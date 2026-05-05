/**
 * js/api.js — 프론트엔드 API 클라이언트
 *
 * Netlify Functions 프록시를 경유해 Claude / 네이버 API를 호출합니다.
 * API 키는 서버(함수)에만 보관되어 브라우저에 노출되지 않습니다.
 *
 * 사용법:
 *   import { callClaude, callNaverDataLab } from '../api.js';
 */

const BASE = '/api';

/* ════════════════════════════════════════════════════════
   Claude API
════════════════════════════════════════════════════════ */

/**
 * Claude 텍스트 생성 호출.
 *
 * @param {object} opts
 * @param {string}   opts.system      - 시스템 프롬프트
 * @param {Array}    opts.messages    - [{ role: 'user'|'assistant', content: string|Array }]
 * @param {string}  [opts.model]      - 기본값: claude-sonnet-4-6
 * @param {number}  [opts.max_tokens] - 기본값: 4096
 * @returns {Promise<string>} 생성된 텍스트
 */
export async function callClaude({ system, messages, model, max_tokens } = {}) {
  const res = await fetch(`${BASE}/claude-proxy`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ system, messages, model, max_tokens }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Claude 오류 ${res.status}`);
  return data.content?.[0]?.text ?? '';
}

/**
 * Claude Vision 호출 (이미지 분석).
 *
 * @param {string} base64      - 이미지 base64 문자열 (data:URL prefix 제거된 순수 base64)
 * @param {string} mediaType   - 'image/jpeg' | 'image/png' | 'image/webp'
 * @param {string} prompt      - 이미지에 대한 질문/지시
 * @param {string} [system]    - 시스템 프롬프트
 * @returns {Promise<string>} 분석 결과 텍스트
 */
export async function callClaudeVision(base64, mediaType, prompt, system) {
  return callClaude({
    system,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text',  text: prompt },
      ],
    }],
  });
}

/* ════════════════════════════════════════════════════════
   네이버 DataLab API
════════════════════════════════════════════════════════ */

/**
 * 네이버 DataLab 검색 트렌드 조회.
 *
 * @param {Array<{groupName: string, keywords: string[]}>} keywordGroups
 * @param {string} [startDate] - 'YYYY-MM-DD' (기본: 30일 전)
 * @param {string} [endDate]   - 'YYYY-MM-DD' (기본: 오늘)
 * @returns {Promise<object>} DataLab 응답 데이터
 */
export async function callNaverDataLab(keywordGroups, startDate, endDate) {
  const today    = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const fmt = d => d.toISOString().slice(0, 10);

  const payload = {
    startDate:     startDate || fmt(thirtyDaysAgo),
    endDate:       endDate   || fmt(today),
    timeUnit:      'date',
    keywordGroups,
  };

  const res = await fetch(`${BASE}/naver-proxy`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      endpoint: 'https://openapi.naver.com/v1/datalab/search',
      payload,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `네이버 DataLab 오류 ${res.status}`);
  return data;
}

/* ════════════════════════════════════════════════════════
   유틸리티
════════════════════════════════════════════════════════ */

/**
 * File → base64 변환 헬퍼 (이미지 업로드용)
 * @param {File} file
 * @returns {Promise<{base64: string, mediaType: string}>}
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      const dataUrl   = reader.result;
      const base64    = dataUrl.split(',')[1];
      const mediaType = file.type || 'image/jpeg';
      resolve({ base64, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
