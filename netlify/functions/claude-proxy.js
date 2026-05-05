/**
 * netlify/functions/claude-proxy.js
 *
 * Claude API 서버사이드 프록시.
 * API 키를 클라이언트에 노출하지 않고 Anthropic API를 안전하게 호출합니다.
 *
 * 환경변수: ANTHROPIC_API_KEY (Netlify 대시보드 → Site settings → Environment variables)
 *
 * 호출 URL: /api/claude-proxy  (netlify.toml redirect 경유)
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL  = 'claude-sonnet-4-6';
const DEFAULT_TOKENS = 4096;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

exports.handler = async (event) => {
  // preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: '잘못된 JSON 형식입니다.' }) };
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'messages 배열이 필요합니다.' }) };
  }

  const payload = {
    model:      body.model      || DEFAULT_MODEL,
    max_tokens: body.max_tokens || DEFAULT_TOKENS,
    messages:   body.messages,
  };
  if (body.system) payload.system = body.system;

  try {
    const res  = await fetch(ANTHROPIC_API, {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return { statusCode: res.status, headers: CORS_HEADERS, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: `Claude API 호출 실패: ${err.message}` }) };
  }
};
