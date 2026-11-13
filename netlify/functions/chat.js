// AXIOM FX — Anthropic chat proxy v2.0
// v2.0 security hardening:
//   • Model is pinned SERVER-SIDE (ANTHROPIC_MODEL env, default claude-sonnet-4-5).
//     Any client-supplied model string is ignored — closes the open-relay cost hole.
//   • max_tokens clamped to 1..4096 (default 1500).
//   • Request body shape validated (messages array of {role,content}).
//   • Optional origin lock via AXIOM_ALLOWED_ORIGIN.

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

function originBlocked(event) {
  const allowed = process.env.AXIOM_ALLOWED_ORIGIN;
  if (!allowed) return false;
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const referer = event.headers?.referer || event.headers?.Referer || '';
  return !(origin.startsWith(allowed) || referer.startsWith(allowed));
}

function validRole(r) { return r === 'user' || r === 'assistant'; }
function validContent(c) {
  if (typeof c === 'string') return c.length > 0 && c.length <= 60000;
  if (Array.isArray(c)) return c.length > 0 && c.every(b => b && typeof b === 'object');
  return false;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: { message: 'Method not allowed' } }) };
  if (originBlocked(event))           return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: { message: 'Origin not allowed' } }) };
  if (!ANTHROPIC_KEY)                 return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY env var not set in Netlify' } }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: { message: 'Invalid JSON body' } }) }; }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 60 ||
      !messages.every(m => m && validRole(m.role) && validContent(m.content))) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: { message: 'Invalid messages array' } }) };
  }

  const maxTokens = Math.min(4096, Math.max(1, parseInt(body.max_tokens, 10) || 1500));
  const payload = {
    model: MODEL, // server-pinned — client value ignored by design
    max_tokens: maxTokens,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  };
  // system is how AXIOM grounds every AI answer in live data. If it is present
  // but invalid, dropping it silently would send an UNGROUNDED request — the
  // exact silent-substitution failure this build forbids. Reject loudly instead.
  if (body.system !== undefined) {
    if (typeof body.system !== 'string' || body.system.length === 0 || body.system.length > 16000) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: { message: 'Invalid system prompt (must be a non-empty string ≤ 16000 chars)' } }) };
    }
    payload.system = body.system;
  }
  if (typeof body.temperature === 'number') payload.temperature = Math.min(1, Math.max(0, body.temperature));

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    });
    const data = await res.json();
    return { statusCode: res.status, headers: CORS, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: { message: e.message } }) };
  }
};
