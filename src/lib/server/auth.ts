import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { APIContext } from 'astro';

// 관리자 로그인
// 1단계: 비밀번호 (환경 변수 ADMIN_PASSWORD)
// 2단계: 지정한 Google 계정으로 로그인 (환경 변수 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET 이 있을 때만 켜짐)
// 2단계를 통과한 브라우저는 144시간 동안 기억해서 비밀번호만으로 들어올 수 있습니다.
const COOKIE = 'mgs_admin';
const TRUST_COOKIE = 'mgs_trust';
const PW_COOKIE = 'mgs_pw';
const STATE_COOKIE = 'mgs_state';
const DAY = 60 * 60 * 24;
const TRUST_AGE = 144 * 60 * 60;
const STEP_AGE = 10 * 60;
// 허용한 Google 계정 (공개 저장소라 주소 대신 SHA-256 값을 둡니다. ADMIN_GOOGLE_EMAIL 로 바꿀 수 있음)
const ALLOWED_EMAIL_SHA = '717f47524a69e9f76e948d41fc123849d17a519f0b0a0c3a978153a365ea8f43';

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

export function googleConfigured() {
  return Boolean(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET'));
}

export function emailAllowed(email: string) {
  const e = email.trim().toLowerCase();
  const want = env('ADMIN_GOOGLE_EMAIL').trim().toLowerCase();
  if (want) return safeEqual(e, want);
  return safeEqual(createHash('sha256').update(e).digest('hex'), ALLOWED_EMAIL_SHA);
}

// 서명한 값: "종류.만료시각.서명"
function token(kind: string, maxAge: number) {
  const body = `${kind}.${Math.floor(Date.now() / 1000) + maxAge}`;
  return `${body}.${sign(body)}`;
}
function valid(raw: string | undefined, kind: string) {
  if (!raw) return false;
  const [k, exp, sig] = raw.split('.');
  if (k !== kind || !exp || !sig || !safeEqual(sig, sign(`${k}.${exp}`))) return false;
  return Number(exp) > Date.now() / 1000;
}
const cookieOpts = (maxAge: number, sameSite: 'strict' | 'lax', path = '/') =>
  ({ path, httpOnly: true, secure: true, sameSite, maxAge }) as const;

// 로그인 유지: 하루. 2단계가 켜져 있을 때는 2단계를 거친 로그인만 인정합니다.
export function login(ctx: APIContext) {
  const kind = googleConfigured() ? 'g' : 'p';
  ctx.cookies.set(COOKIE, token(kind, DAY), cookieOpts(DAY, 'strict'));
}

export function logout(ctx: APIContext) {
  ctx.cookies.delete(COOKIE, { path: '/' });
}

export function isLoggedIn(ctx: APIContext) {
  if (!configured()) return false;
  const raw = ctx.cookies.get(COOKIE)?.value;
  return valid(raw, 'g') || (!googleConfigured() && valid(raw, 'p'));
}

// 144시간 브라우저 기억
export function trustBrowser(ctx: APIContext) {
  ctx.cookies.set(TRUST_COOKIE, token('t', TRUST_AGE), cookieOpts(TRUST_AGE, 'strict', '/api/'));
}
export function isTrusted(ctx: APIContext) {
  return valid(ctx.cookies.get(TRUST_COOKIE)?.value, 't');
}

// 비밀번호를 통과했다는 표시 (10분). Google에서 돌아올 때도 보내져야 해서 lax.
export function passStepOne(ctx: APIContext) {
  ctx.cookies.set(PW_COOKIE, token('pw', STEP_AGE), cookieOpts(STEP_AGE, 'lax', '/api/google/'));
}
export function passedStepOne(ctx: APIContext) {
  return valid(ctx.cookies.get(PW_COOKIE)?.value, 'pw');
}

// Google 로그인 요청과 응답을 짝지어 주는 무작위 값
export function newState(ctx: APIContext) {
  const state = randomBytes(24).toString('base64url');
  ctx.cookies.set(STATE_COOKIE, state, cookieOpts(STEP_AGE, 'lax', '/api/google/'));
  return state;
}
export function checkState(ctx: APIContext, state: string) {
  const want = ctx.cookies.get(STATE_COOKIE)?.value ?? '';
  return Boolean(want && state && safeEqual(want, state));
}
export function clearSteps(ctx: APIContext) {
  ctx.cookies.delete(PW_COOKIE, { path: '/api/google/' });
  ctx.cookies.delete(STATE_COOKIE, { path: '/api/google/' });
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

// 로그인이 필요한 API 앞에 씁니다.
export function guard(ctx: APIContext) {
  if (!configured()) return json({ error: '관리자 설정(ADMIN_PASSWORD, GITHUB_TOKEN)이 아직 없어요.' }, 503);
  if (!isLoggedIn(ctx)) return json({ error: '다시 로그인해 주세요.' }, 401);
  return null;
}
