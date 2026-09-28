import type { APIRoute } from 'astro';
import {
  checkPassword,
  configured,
  googleConfigured,
  isLoggedIn,
  isTrusted,
  json,
  login,
  logout,
  passStepOne,
} from '../../lib/server/auth';

export const prerender = false;

// 로그인 상태 확인
export const GET: APIRoute = (ctx) =>
  json({ configured: configured(), loggedIn: isLoggedIn(ctx), twoStep: googleConfigured() });

// 1단계: 비밀번호. 2단계가 켜져 있고 기억된 브라우저가 아니면 Google 로그인으로 넘깁니다.
export const POST: APIRoute = async (ctx) => {
  if (!configured()) return json({ error: '관리자 설정(ADMIN_PASSWORD, GITHUB_TOKEN)이 아직 없어요.' }, 503);
  const { password = '' } = await ctx.request.json().catch(() => ({}));
  if (!checkPassword(String(password))) {
    await new Promise((r) => setTimeout(r, 800));
    return json({ error: '비밀번호가 맞지 않아요.' }, 401);
  }
  if (googleConfigured() && !isTrusted(ctx)) {
    passStepOne(ctx);
    return json({ next: '/api/google/start' });
  }
  login(ctx);
  return json({ ok: true });
};

export const DELETE: APIRoute = (ctx) => {
  logout(ctx);
  return json({ ok: true });
};
