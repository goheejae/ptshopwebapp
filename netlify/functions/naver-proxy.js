/**
 * netlify/functions/naver-proxy.js
 *
 * 네이버 API 서버사이드 프록시.
 * DataLab (검색 트렌드) 및 기타 네이버 Open API를 CORS 없이 안전하게 호출합니다.
 *
 * 환경변수:
 *   NAVER_CLIENT_ID     — 네이버 개발자센터 애플리케이션 Client ID
 *   NAVER_CLIENT_SECRET — 네이버 개발자센터 애플리케이션 Client Secret
 *
 * 호출 URL: /api/naver-proxy  (netlify.toml redirect 경유)
 *
 * body 형식:
 *   {
 *     endpoint: "https://openapi.naver.com/v1/datalab/search",  // 호출할 네이버 API URL
 *     payload:  { ... }   // 해당 API에 전달할 request body
 *   }
 */

const ALLOWED_HOSTS = [
  'openapi.naver.com',
  'searchadvisor.naver.com',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const clientId     = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: '잘못된 JSON 형식입니다.' }) };
  }

  const { endpoint, payload } = body;
  if (!endpoint || !payload) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'endpoint와 payload가 필요합니다.' }) };
  }

  // 허용된 호스트만 프록시 (SSRF 방지)
  let parsedUrl;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: '유효하지 않은 endpoint URL입니다.' }) };
  }

  if (!ALLOWED_HOSTS.includes(parsedUrl.hostname)) {
    return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: '허용되지 않은 호스트입니다.' }) };
  }

  try {
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: {
        'Content-Type':           'application/json',
        'X-Naver-Client-Id':      clientId,
        'X-Naver-Client-Secret':  clientSecret,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return { statusCode: res.status, headers: CORS_HEADERS, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 502, headers: CORS_HEADERS, body: JSON.stringify({ error: `네이버 API 호출 실패: ${err.message}` }) };
  }
};
