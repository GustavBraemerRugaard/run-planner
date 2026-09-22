/**
 * The ONLY piece of this project that runs on a server. Strava's OAuth token exchange needs a
 * client secret, which must never sit in browser code — so this tiny worker holds the secret and
 * proxies exactly two calls to Strava's token endpoint. It stores nothing itself: the browser keeps
 * the refresh token (see src/lib/strava.ts), this worker just signs requests with the secret.
 *
 * Routes:
 *   POST /exchange { code }          -> { access_token, refresh_token, expires_at, athlete }
 *   POST /refresh  { refresh_token } -> { access_token, refresh_token, expires_at }
 */

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

/** Forward only what the app needs — never pass Strava's raw response straight through. */
function pickTokenFields(data) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    ...(data.athlete
      ? { athlete: { id: data.athlete.id, firstname: data.athlete.firstname, lastname: data.athlete.lastname } }
      : {}),
  };
}

async function stravaTokenRequest(env, body) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Strava token request failed (${res.status})`);
  return data;
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (headers['Access-Control-Allow-Origin'] === 'null') return json({ error: 'origin_not_allowed' }, 403, headers);

    const { pathname } = new URL(request.url);
    try {
      if (request.method === 'POST' && pathname === '/exchange') {
        const { code } = await request.json();
        if (!code) return json({ error: 'missing_code' }, 400, headers);
        const data = await stravaTokenRequest(env, { code, grant_type: 'authorization_code' });
        return json(pickTokenFields(data), 200, headers);
      }
      if (request.method === 'POST' && pathname === '/refresh') {
        const { refresh_token } = await request.json();
        if (!refresh_token) return json({ error: 'missing_refresh_token' }, 400, headers);
        const data = await stravaTokenRequest(env, { refresh_token, grant_type: 'refresh_token' });
        return json(pickTokenFields(data), 200, headers);
      }
      return json({ error: 'not_found' }, 404, headers);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'server_error' }, 502, headers);
    }
  },
};
