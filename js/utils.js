/**
 * js/utils.js — 공통 유틸리티 함수 모음
 *
 * 역할: 여러 페이지에서 공통으로 쓰이는 작은 함수들을 한 곳에 모아둡니다.
 *       Toast 알림, HTML 이스케이프, 금액 포매팅, 반응형 여부 확인 등이 포함됩니다.
 *
 * 사용법: import { showToast, escHtml, fmtMoney } from '../utils.js';
 */

// ── Toast 타이머 관리 (모듈 레벨 변수) ──
// 여러 번 연속으로 Toast를 띄울 때 이전 타이머를 취소하기 위해 저장해둡니다.
let toastTimer;

/**
 * 화면 우측 하단에 잠깐 메시지를 표시합니다.
 *
 * 사용 예: showToast('✅ 저장했습니다.');
 *          showToast('❌ 오류 발생', 4000); // 4초 표시
 *
 * @param {string} msg  - 표시할 메시지
 * @param {number} ms   - 표시 유지 시간 (밀리초, 기본값 2500)
 */
export function showToast(msg, ms = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/**
 * HTML 특수문자를 이스케이프하여 XSS를 방지합니다.
 * 사용자가 입력한 텍스트를 innerHTML에 넣을 때 반드시 사용하세요.
 *
 * 사용 예: cell.innerHTML = escHtml(userInput);
 *
 * @param {string} s - 이스케이프할 문자열
 * @returns {string}
 */
export function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 숫자를 한국 원화 형식으로 포매팅합니다.
 *
 * 사용 예: fmtMoney(1500000) → "1,500,000원"
 *
 * @param {number} n - 금액 (소수점 있어도 반올림됩니다)
 * @returns {string}
 */
export function fmtMoney(n) {
  return Math.abs(Math.round(n || 0)).toLocaleString('ko-KR') + '원';
}

/**
 * 현재 화면이 모바일 너비(768px 이하)인지 확인합니다.
 *
 * @returns {boolean}
 */
export function isMobile() {
  return window.innerWidth <= 768;
}

/**
 * "구현 예정" 플레이스홀더 화면을 렌더링합니다.
 * 아직 개발되지 않은 페이지에 임시로 사용합니다.
 *
 * @param {string} icon  - 이모지 아이콘
 * @param {string} title - 페이지 제목
 * @param {string} desc  - 설명 문구
 */
export function comingSoon(icon, title, desc) {
  document.getElementById('page-content').innerHTML = `
    <div class="page-header"><h1>${icon} ${title}</h1></div>
    <div class="coming-soon">
      <div class="cs-icon">${icon}</div>
      <h2>${title}</h2>
      <p>${desc}</p>
    </div>`;
}
