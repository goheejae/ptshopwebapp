/**
 * js/pages/notice.js — 공지사항 페이지
 *
 * 역할: 모든 직원이 공유하는 공지사항/메모를 보고 수정하는 전용 페이지.
 *       Firebase /notice 경로에 실시간 저장·동기화됩니다.
 */

import DB from '../db.js';
import { escHtml } from '../utils.js';

let _noticeTimer;

export function renderNotice() {
  const pageContent = document.getElementById('page-content');

  pageContent.innerHTML = `
    <div class="page-header"><h1>📢 공지사항</h1></div>

    <div class="notice-board notice-board--full">
      <div class="notice-header">📢 공지사항 및 메모</div>
      <textarea id="notice-text" class="notice-textarea notice-textarea--full"
        placeholder="공지사항을 입력하세요...">${escHtml(DB.noticeGet())}</textarea>
      <div class="notice-footer" id="notice-status">저장됨</div>
    </div>`;

  _bindNoticeEvents();
}

function _bindNoticeEvents() {
  const ta     = document.getElementById('notice-text');
  const status = document.getElementById('notice-status');
  if (!ta) return;

  // 초기 높이 자동 조절
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';

  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';

    if (status) status.textContent = '입력 중...';

    clearTimeout(_noticeTimer);
    _noticeTimer = setTimeout(() => {
      DB.noticeSet(ta.value);
      if (status) status.textContent = '저장됨 ✓';
    }, 2000);
  });
}
