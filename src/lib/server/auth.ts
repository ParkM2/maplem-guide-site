import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { APIContext } from 'astro';

// 관리자 로그인: Vercel 환경 변수 ADMIN_PASSWORD 하나로 확인하고, 서명한 쿠키로 30일 유지합니다.
const COOKIE = 'mgs_admin';
const MAX_AGE = 60 * 60 * 24 * 30;

const env = (k: string) => process.env[k] ?? '';

function secret() {
  return createHash('sha256').update(`${env('ADMIN_PASSWORD')}|${env('GITHUB_TOKEN')}`).digest();
}

function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function configured() {
  return Boolean(env('ADMIN_PASSWORD') && env('GITHUB_TOKEN'));
}

export function checkPassword(input: string) {
  const want = env('ADMIN_PASSWORD');
  if (!want) return false;
  const h = (s: string) => createHash('sha256').update(s).digest('hex');
  return safeEqual(h(input), h(want));
}

export function login(ctx: APIContext) {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  ctx.cookies.set(COOKIE, `${exp}.${sign(exp)}`, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: MAX_AGE,
  });
}

export function logout(ctx: APIContext) {
  ctx.cookies.delete(COOKIE, { path: '/' });
}

export function isLoggedIn(ctx: APIContext) {
  if (!configured()) return false;
  const raw = ctx.cookies.get(COOKIE)?.value;
  if (!raw) return false;
  const [exp, sig] = raw.split('.');
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now() / 1000;
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

// 로그인이 필요한 API 앞에 씁니다.
export function guard(ctx: APIContext) {
  if (!configured()) return json({ error: '관리자 설정(ADMIN_PASSWORD, GITHUB_TOKEN)이 아직 없어요.' }, 503);
  if (!isLoggedIn(ctx)) return json({ error: '다시 로그인해 주세요.' }, 401);
  return null;
}
