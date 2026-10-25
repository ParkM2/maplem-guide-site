import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { APIContext, AstroGlobal } from 'astro';
import { dbConfigured, sql } from './db';
import { hasSigned, hmac, isLoggedIn, setSigned } from './auth';

// 질문/의견 게시판: 누구나 글과 댓글을 쓸 수 있고, 비밀글은 글쓴이 비밀번호나 관리자만 볼 수 있습니다.
// 글, 사진, 댓글은 방문 통계와 같은 Postgres(Neon)에 저장합니다.
export const LIMITS = {
  name: 20,
  title: 100,
  body: 5000,
  comment: 1000,
  pwMin: 4,
  pwMax: 50,
  images: 5,
  noticeImages: 1000, // 공지(관리자)는 사실상 제한 없음
  noticeBytes: 4 * 1024 * 1024, // 서버 함수가 한 번에 주고받을 수 있는 크기(4.5MB) 안쪽
  imageBytes: 1024 * 1024 + 64 * 1024, // 1MB 넘는 사진은 브라우저에서 줄여서 올립니다 (약간의 여유)
  perPage: 20,
};
const ACCESS_AGE = 60 * 60 * 24; // 비밀번호로 연 비밀글은 하루 동안 다시 묻지 않음

let ready: Promise<unknown> | null = null;
export function ensureBoard() {
  ready ??= (async () => {
    const db = sql();
    // 표가 이미 다 있으면(보통은 그렇습니다) 한 번만 물어보고 끝냅니다.
    // 서버가 깨어날 때마다 표 만들기 명령 9개를 DB에 하나씩 보내던 시간을 줄입니다.
    // 아래에 표나 칸을 새로 추가하면 이 확인에도 같이 넣어 주세요.
    const [{ ok }] = await db`
      select to_regclass('board_images') is not null
         and to_regclass('board_comments') is not null
         and exists (select 1 from information_schema.columns
                     where table_name = 'board_posts' and column_name = 'updated') as ok`;
    if (ok) return;
    await db`
      create table if not exists board_posts (
        id serial primary key,
        created timestamptz not null default now(),
        name text not null,
        pw text not null,
        secret boolean not null default false,
        title text not null,
        body text not null,
        ip text,
        images integer not null default 0,
        comments integer not null default 0,
        views integer not null default 0
      )`;
    await db`create index if not exists board_posts_created on board_posts (created desc)`;
    await db`alter table board_posts add column if not exists notice boolean not null default false`;
    await db`alter table board_posts add column if not exists updated timestamptz`;
    await db`
      create table if not exists board_images (
        id serial primary key,
        post_id integer not null references board_posts(id) on delete cascade,
        ord integer not null,
        mime text not null,
        width integer,
        height integer,
        data bytea not null
      )`;
    await db`create index if not exists board_images_post on board_images (post_id)`;
    await db`
      create table if not exists board_comments (
        id serial primary key,
        post_id integer not null references board_posts(id) on delete cascade,
        created timestamptz not null default now(),
        name text not null,
        pw text,
        admin boolean not null default false,
        body text not null,
        ip text
      )`;
    await db`create index if not exists board_comments_post on board_comments (post_id)`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

export const boardReady = dbConfigured;

// 공개글 사진 주소에는 서명값(k)을 붙여 Vercel CDN에 오래 저장해 두게 합니다(다음 사람부터는 DB를 거치지 않음).
// 글이 나중에 비밀글로 바뀌면 이 주소를 더 쓰지 않으므로, 번호만 바꿔 넣어서는 저장된 사진을 볼 수 없습니다.
export const photoKey = (id: number) => hmac(`photo|${id}`).slice(0, 16);
export const photoPath = (id: number, secret: boolean) =>
  secret ? `/api/board/photo/${id}` : `/api/board/photo/${id}?k=${photoKey(id)}`;

// 비밀번호는 그대로 저장하지 않고 scrypt 값만 저장합니다.
export function hashPw(pw: string) {
  const salt = randomBytes(16);
  return `s1$${salt.toString('base64')}$${scryptSync(pw, salt, 32).toString('base64')}`;
}
export function checkPw(pw: string, stored: string | null) {
  if (!stored) return false;
  const [v, salt, hash] = stored.split('$');
  if (v !== 's1' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = scryptSync(pw, Buffer.from(salt, 'base64'), 32);
  return want.length === got.length && timingSafeEqual(want, got);
}

type Ctx = APIContext | AstroGlobal;
const cookieName = (id: number) => `mgs_bp${id}`;
export const isAdmin = (ctx: Ctx) => isLoggedIn(ctx as APIContext);
export function grantAccess(ctx: Ctx, id: number) {
  setSigned(ctx as APIContext, cookieName(id), `bp${id}`, ACCESS_AGE);
}
export function canRead(ctx: Ctx, post: { id: number; secret: boolean }) {
  return !post.secret || isAdmin(ctx) || hasSigned(ctx as APIContext, cookieName(post.id), `bp${post.id}`);
}

// 글 수정: 비밀번호를 맞히면 30분 동안 수정 화면을 쓸 수 있습니다. 공지는 관리자만.
const editCookie = (id: number) => `mgs_be${id}`;
export function grantEdit(ctx: Ctx, id: number) {
  setSigned(ctx as APIContext, editCookie(id), `be${id}`, 30 * 60);
}
export function canEdit(ctx: Ctx, post: { id: number; notice: boolean }) {
  if (isAdmin(ctx)) return true;
  return !post.notice && hasSigned(ctx as APIContext, editCookie(post.id), `be${post.id}`);
}

// 같은 사람이 짧은 시간에 너무 많이 쓰지 못하게 (IP는 그대로 저장하지 않고 서명값으로)
export function ipKey(ctx: APIContext) {
  const ip = ctx.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ctx.clientAddress || '';
  return hmac(`ip|${ip}`).slice(0, 22);
}

export const clean = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);

export async function getPost(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const [p] = await sql()`select id, created, updated, name, pw, secret, notice, title, body, images, comments, views from board_posts where id = ${id}`;
  return (p as unknown as Post) ?? null;
}
export type Post = {
  id: number; created: Date; updated: Date | null; name: string; pw: string; secret: boolean; notice: boolean; title: string; body: string;
  images: number; comments: number; views: number;
};

// 사진 파일 종류를 앞부분 바이트로 확인
export function sniffImage(b: Uint8Array) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
