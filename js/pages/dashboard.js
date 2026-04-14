/**
 * js/pages/dashboard.js — 대시보드 페이지
 *
 * 역할: 앱을 처음 열면 보이는 홈 화면입니다.
 *       각 기능의 요약 카드를 보여주고, 클릭하면 해당 페이지로 이동합니다.
 *
 * 사용법: import { renderDashboard } from './pages/dashboard.js';
 */

import DB from '../db.js';
import { escHtml } from '../utils.js';

/** 공지사항 자동저장 타이머 (모듈 레벨 — 페이지 재렌더 시에도 유지됨) */
let _noticeTimer;

/**
 * 대시보드 화면을 #page-content 에 그립니다.
 *
 * navigate 함수를 받아서 카드 클릭 시 페이지 이동에 사용합니다.
 * (main.js에서 window.navigate로 전역 노출되어 있어 인라인 onclick에서도 동작합니다.)
 */
export function renderDashboard() {
  const pageContent = document.getElementById('page-content');

  // 긴급 투두 개수를 계산합니다 (마감 24시간 이내이고 미완료인 항목)
  const todos = DB.todosGet();
  const urgent = todos.filter(t => {
    if (t.done) return false;
    const remainingMs = new Date(t.dueDate) - Date.now();
    return remainingMs > 0 && remainingMs < 86400000; // 86400000ms = 24시간
  }).length;

  // 미완료 투두 개수
  const undoneCount = todos.filter(t => !t.done).length;

  // 투두 카드에 표시할 값: 긴급 항목이 있으면 빨간 경고, 없으면 미완료 건수
  const todoValue = urgent
    ? `<span style="color:#e5414a">⚠ ${urgent}건 긴급</span>`
    : `${undoneCount}건`;

  pageContent.innerHTML = `
    <div class="page-header"><h1>🏠 대시보드</h1></div>

    <div class="notice-board">
      <div class="notice-header">📢 공지사항 및 메모</div>
      <textarea id="notice-text" class="notice-textarea" placeholder="공지사항을 입력하세요...">${escHtml(DB.noticeGet())}</textarea>
    </div>

    <div class="dash-grid">

      <div class="dash-card" onclick="navigate('scheduler')">
        <div class="dc-icon">📅</div>
        <div class="dc-title">주간 스케쥴러</div>
        <div class="dc-value">고희재 · 이건우</div>
        <div class="dc-sub">07:00 ~ 22:00</div>
      </div>

      <div class="dash-card" onclick="navigate('todo')">
        <div class="dc-icon">✅</div>
        <div class="dc-title">To-do 리스트</div>
        <div class="dc-value">${todoValue}</div>
        <div class="dc-sub">미완료 업무</div>
      </div>

      <div class="dash-card" onclick="navigate('finance')">
        <div class="dc-icon">💰</div>
        <div class="dc-title">결산 시스템</div>
        <div class="dc-value">월간 정산</div>
        <div class="dc-sub">수입 · 지출 관리</div>
      </div>

      <div class="dash-card" onclick="navigate('consult')">
        <div class="dc-icon">📝</div>
        <div class="dc-title">상담지 매니저</div>
        <div class="dc-value">${DB.consultsGet().length}건</div>
        <div class="dc-sub">누적 상담 기록</div>
      </div>

      <div class="dash-card" onclick="navigate('stats')">
        <div class="dc-icon">📊</div>
        <div class="dc-title">통계</div>
        <div class="dc-value">수집 중</div>
        <div class="dc-sub">방문경로 · 미등록 사유</div>
      </div>

    </div>`;

  _bindNoticeEvents();
}

function _bindNoticeEvents() {
  const ta = document.getElementById('notice-text');
  if (!ta) return;

  // 초기 높이 자동 조절
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';

  ta.addEventListener('input', () => {
    // 높이 자동 조절
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';

    // 2초 debounce 후 Firebase 저장
    clearTimeout(_noticeTimer);
    _noticeTimer = setTimeout(() => DB.noticeSet(ta.value), 2000);
  });
}
