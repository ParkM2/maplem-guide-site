import type { APIRoute } from 'astro';
import { checkPassword, configured, isLoggedIn, json, login, logout } from '../../lib/server/auth';

export const prerender = false;

// 로그인 상태 확인
export const GET: APIRoute = (ctx) => json({ configured: configured(), loggedIn: isLoggedIn(ctx) });

export const POST: APIRoute = async (ctx) => {
  if (!configured()) return json({ error: '관리자 설정(ADMIN_PASSWORD, GITHUB_TOKEN)이 아직 없어요.' }, 503);
  const { password = '' } = await ctx.request.json().catch(() => ({}));
  if (!checkPassword(String(password))) {
    await new Promise((r) => setTimeout(r, 800));
    return json({ error: '비밀번호가 맞지 않아요.' }, 401);
  }
  login(ctx);
  return json({ ok: true });
};

export const DELETE: APIRoute = (ctx) => {
  logout(ctx);
  return json({ ok: true });
};
