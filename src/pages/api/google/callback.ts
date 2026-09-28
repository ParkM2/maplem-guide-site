import type { APIRoute } from 'astro';
import { checkState, clearSteps, emailAllowed, googleConfigured, login, passedStepOne, trustBrowser } from '../../../lib/server/auth';

export const prerender = false;

const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';

// Google에서 돌아온 곳: 허용한 계정이면 로그인하고 이 브라우저를 144시간 기억합니다.
export const GET: APIRoute = async (ctx) => {
  const back = (reason: string) => {
    clearSteps(ctx);
    return ctx.redirect(`/admin/?g=${reason}`, 302);
  };
  const code = ctx.url.searchParams.get('code') ?? '';
  const state = ctx.url.searchParams.get('state') ?? '';
  if (!googleConfigured() || !passedStepOne(ctx) || !checkState(ctx, state)) return back('expired');
  if (!code) return back('cancel');
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${ctx.url.origin}/api/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.id_token) return back('fail');
    // Google 서버에서 직접(HTTPS) 받은 id_token 이라 내용만 확인하면 됩니다.
    const claims = JSON.parse(Buffer.from(String(data.id_token).split('.')[1], 'base64url').toString());
    const okIssuer = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
    if (!okIssuer || claims.aud !== process.env.GOOGLE_CLIENT_ID || Number(claims.exp) < Date.now() / 1000) return back('fail');
    if (!claims.email_verified || !emailAllowed(String(claims.email ?? ''))) return back('denied');
    clearSteps(ctx);
    login(ctx);
    trustBrowser(ctx);
    return ctx.redirect('/admin/', 302);
  } catch {
    return back('fail');
  }
};
