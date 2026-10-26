/**
 * Keeps the Strava client secret off the phone. The app talks to Strava directly with an access token; only the
 * steps that need the secret (signing in and refreshing the token) go through here.
 *
 *   GET  /strava/connect?app_redirect=<url>   starts Strava sign-in, then sends the tokens back to <url>
 *   GET  /strava/callback                      where Strava returns after sign-in (set as the callback domain)
 *   POST /strava/refresh  { refresh_token }    swaps a refresh token for a new access token
 *   GET  /health                               "ok"
 *
 * Errors are { error: "message" }.
 */

interface Env {
  /** From strava.com/settings/api. Set with `npx wrangler secret put STRAVA_CLIENT_ID`. */
  STRAVA_CLIENT_ID: string;
  /** Set with `npx wrangler secret put STRAVA_CLIENT_SECRET`. Never commit it. */
  STRAVA_CLIENT_SECRET: string;
}

const STRAVA_AUTHORIZE = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN = 'https://www.strava.com/oauth/token';

// read_all includes activities marked "Only you", which is how watch uploads are often set.
const SCOPE = 'read,activity:read_all';

// Only send tokens back into the app: its own scheme in a build, or Expo Go while developing.
const ALLOWED_REDIRECTS = /^(triathlontracker|exp):\/\//;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

/** Adds query parameters to an app link, which may already have some. */
function withParams(base: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return `${base}${base.includes('?') ? '&' : '?'}${query}`;
}

interface TokenReply {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  athlete?: { firstname?: string; lastname?: string };
}

async function callTokenEndpoint(params: Record<string, string>, env: Env): Promise<TokenReply | null> {
  const response = await fetch(STRAVA_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      ...params,
    }).toString(),
  });
  if (!response.ok) {
    console.error('Strava token request failed', response.status, await response.text());
    return null;
  }
  return (await response.json()) as TokenReply;
}

function connect(url: URL, env: Env): Response {
  const appRedirect = url.searchParams.get('app_redirect') ?? '';
  if (!ALLOWED_REDIRECTS.test(appRedirect)) return json({ error: 'Unknown app address.' }, 400);

  const authorize = new URL(STRAVA_AUTHORIZE);
  authorize.searchParams.set('client_id', env.STRAVA_CLIENT_ID);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('redirect_uri', new URL('/strava/callback', url.origin).toString());
  authorize.searchParams.set('approval_prompt', 'auto');
  authorize.searchParams.set('scope', SCOPE);
  // Strava hands `state` back untouched, which tells the callback where the app is listening.
  authorize.searchParams.set('state', appRedirect);
  return Response.redirect(authorize.toString(), 302);
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Android browsers often ignore a plain 302 to an app link, so hand back a page that tries the redirect and also
 * offers a button, which counts as a tap and is always allowed.
 */
function openApp(link: string): Response {
  const href = escapeHtml(link);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Return to Triathlon Tracker</title>
<style>body{font-family:system-ui,sans-serif;text-align:center;padding:64px 24px}a{display:inline-block;margin-top:24px;padding:16px 32px;background:#fc4c02;color:#fff;border-radius:12px;font-size:18px;text-decoration:none}</style>
</head><body><h1>Connected to Strava</h1><p>Tap the button to go back to the app.</p><a href="${href}">Return to the app</a>
<script>setTimeout(function(){location.href=${JSON.stringify(link).replace(/</g, '\\u003c')}},300)</script></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function callback(url: URL, env: Env): Promise<Response> {
  const appRedirect = url.searchParams.get('state') ?? '';
  if (!ALLOWED_REDIRECTS.test(appRedirect)) return json({ error: 'Unknown app address.' }, 400);
  const back = (params: Record<string, string>) => openApp(withParams(appRedirect, params));

  const code = url.searchParams.get('code');
  if (!code) return back({ error: url.searchParams.get('error') === 'access_denied' ? 'denied' : 'failed' });
  if (!(url.searchParams.get('scope') ?? '').includes('activity:read')) return back({ error: 'scope' });

  const tokens = await callTokenEndpoint({ code, grant_type: 'authorization_code' }, env);
  if (!tokens?.access_token || !tokens.refresh_token || !tokens.expires_at) return back({ error: 'failed' });

  return back({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: String(tokens.expires_at),
    athlete: [tokens.athlete?.firstname, tokens.athlete?.lastname].filter(Boolean).join(' '),
  });
}

async function refresh(request: Request, env: Env): Promise<Response> {
  let body: { refresh_token?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send a JSON body.' }, 400);
  }
  if (typeof body.refresh_token !== 'string' || !body.refresh_token) {
    return json({ error: 'refresh_token is required.' }, 400);
  }

  const tokens = await callTokenEndpoint({ refresh_token: body.refresh_token, grant_type: 'refresh_token' }, env);
  if (!tokens?.access_token || !tokens.refresh_token || !tokens.expires_at) {
    return json({ error: 'Strava would not renew the sign-in. Connect again in Settings.' }, 401);
  }
  return json({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: tokens.expires_at });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const expected = url.pathname === '/strava/refresh' ? 'POST' : 'GET';
    if (request.method !== expected) return json({ error: 'Method not allowed.' }, 405);

    try {
      switch (url.pathname) {
        case '/strava/connect':
          return connect(url, env);
        case '/strava/callback':
          return await callback(url, env);
        case '/strava/refresh':
          return await refresh(request, env);
        case '/health':
          return new Response('ok');
        default:
          return json({ error: 'Not found.' }, 404);
      }
    } catch (e) {
      console.error('Request failed', e);
      return json({ error: 'Something went wrong.' }, 500);
    }
  },
};
