import type { APIRoute } from 'astro';
import { googleConfigured, newState, passedStepOne } from '../../../lib/server/auth';

export const prerender = false;

// 2단계: Google 로그인 화면으로 보냅니다 (비밀번호를 통과한 뒤에만).
export const GET: APIRoute = (ctx) => {
  if (!googleConfigured() || !passedStepOne(ctx)) return ctx.redirect('/admin/?g=expired', 302);
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${ctx.url.origin}/api/google/callback`,
    response_type: 'code',
    scope: 'openid email',
    state: newState(ctx),
    prompt: 'select_account',
  });
  return ctx.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, 302);
};
