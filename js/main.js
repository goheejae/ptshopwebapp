/**
 * js/main.js — 앱 진입점 & 라우터
 *
 * 역할: 앱이 시작될 때 가장 먼저 실행되는 파일입니다.
 *       - 사이드바 토글 (PC: 접기/펼치기 / 모바일: 오버레이)
 *       - 사이드바 버튼 클릭 → 해당 페이지 모듈을 불러와 렌더링
 *       - 데이터 내보내기 / 가져오기
 *
 * 사용법: index.html에서 <script type="module" src="js/main.js"> 로 불러옵니다.
 */

import DB from './db.js';
import { showToast, isMobile } from './utils.js';

// ── 페이지 모듈 import ──
// 각 페이지는 독립 모듈로 분리되어 있습니다.
import { renderDashboard } from './pages/dashboard.js';
import { renderScheduler } from './pages/scheduler.js';
import { renderTodo }      from './pages/todo.js';
import { renderFinance }   from './pages/finance.js';
import { renderConsult }   from './pages/consult.js';
import { renderCallLog }   from './pages/callLog.js';
import { renderOtLog }     from './pages/otLog.js';
import { renderStats }     from './pages/stats.js';
import { renderNotice }    from './pages/notice.js';
import { renderSalesLog }  from './pages/salesLog.js';
import { renderMarketing } from './pages/marketing.js';

// ════════════════════════════════
// 라우터
// ════════════════════════════════

/** 페이지 이름 → 렌더 함수 매핑 테이블 */
const pages = {
  dashboard: renderDashboard,
  scheduler: renderScheduler,
  todo:      renderTodo,
  finance:   renderFinance,
  consult:   renderConsult,
  callLog:   renderCallLog,
  otLog:     renderOtLog,
  stats:     renderStats,
  notice:    renderNotice,
  salesLog:  renderSalesLog,
  marketing: renderMarketing,
};

/** 현재 활성화된 페이지 이름 */
let currentPage = 'dashboard';

/**
 * 지정한 페이지로 이동합니다.
 * 사이드바 활성 상태를 업데이트하고 해당 렌더 함수를 호출합니다.
 *
 * 대시보드 카드의 onclick="navigate('scheduler')" 에서도 호출되므로
 * window.navigate로 전역에 노출합니다.
 *
 * @param {string} page - pages 객체의 키 ('dashboard' | 'scheduler' | 등)
 */
function navigate(page) {
  currentPage = page;

  // 사이드바 버튼 활성화 상태 업데이트
  document.querySelectorAll('.nav-item[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );

  // 스케줄러 플로팅 버튼 잔상 제거
  document.getElementById('floating-clear-btn')?.remove();

  // 기존 페이지 내용을 지우고 새 페이지를 렌더링합니다
  document.getElementById('page-content').innerHTML = '';
  pages[page]?.();

  // 모바일에서 페이지 이동 시 사이드바를 자동으로 닫습니다
  if (isMobile()) document.body.classList.remove('sidebar-open');
}

// 대시보드 카드 등 인라인 onclick에서 사용할 수 있도록 전역에 노출합니다.
window.navigate = navigate;

// ── 사이드바 버튼 이벤트 등록 ──
document.querySelectorAll('.nav-item[data-page]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.page));
});

// ════════════════════════════════
// 사이드바 토글
// ════════════════════════════════

/**
 * 햄버거 버튼 클릭 시 동작합니다.
 * - PC: sidebar-collapsed 클래스로 사이드바를 완전히 숨깁니다.
 * - 모바일: sidebar-open 클래스로 오버레이와 함께 표시합니다.
 */
document.getElementById('toggle-btn').addEventListener('click', () => {
  if (isMobile()) {
    document.body.classList.toggle('sidebar-open');
  } else {
    document.body.classList.toggle('sidebar-collapsed');
  }
});

// 모바일에서 사이드바 외부(오버레이) 클릭 시 닫기
document.getElementById('sidebar-overlay').addEventListener('click', () => {
  document.body.classList.remove('sidebar-open');
});

// 화면 크기가 바뀔 때 모바일 오버레이 상태를 초기화합니다
window.addEventListener('resize', () => {
  if (!isMobile()) document.body.classList.remove('sidebar-open');
});

// ════════════════════════════════
// 데이터 내보내기 / 가져오기
// ════════════════════════════════

/**
 * 전체 데이터를 JSON 파일로 다운로드합니다.
 * 파일명 형식: fitplan_backup_YYYY-MM-DD.json
 */
document.getElementById('btn-export').addEventListener('click', () => {
  const blob = new Blob(
    [JSON.stringify(DB.exportAll(), null, 2)],
    { type: 'application/json' }
  );
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `fitplan_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ 데이터를 내보냈습니다.');
});

/**
 * JSON 파일을 선택하여 데이터를 불러옵니다.
 * 기존 데이터는 가져온 데이터로 교체됩니다.
 */
const fileInput = document.getElementById('file-input');

document.getElementById('btn-import').addEventListener('click', () => {
  fileInput.value = ''; // 같은 파일을 다시 선택할 수 있도록 초기화
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      DB.importAll(JSON.parse(e.target.result));
      showToast('✅ 데이터를 불러왔습니다.');
      navigate(currentPage); // 현재 페이지를 새 데이터로 다시 렌더링합니다
    } catch {
      showToast('❌ 파일 오류: 올바른 JSON 파일인지 확인해주세요.');
    }
  };
  reader.readAsText(file);
});

// ════════════════════════════════
// 앱 초기화 (Firebase 데이터 로드 후 렌더링)
// ════════════════════════════════

document.getElementById('page-content').innerHTML =
  '<p style="text-align:center;padding:80px 20px;color:#7a829e;font-size:1rem">☁️ 데이터 동기화 중...</p>';

await DB.init();
navigate('dashboard');

// 스케줄러·투두 실시간 동기화 — 다른 기기에서 수정 시 현재 화면 자동 갱신
DB.startRealTimeSync(changed => {
  if (changed === 'scheduler' && currentPage === 'scheduler') pages.scheduler();
  if (changed === 'todos'     && currentPage === 'todo')      pages.todo();
  if (changed === 'instructors' && currentPage === 'scheduler') pages.scheduler();
  // 공지사항: 전체 재렌더 대신 textarea 값만 업데이트해 커서 위치 유지
  if (changed === 'notice') {
    const ta = document.getElementById('notice-text');
    if (ta && ta.value !== DB.noticeGet()) {
      ta.value = DB.noticeGet();
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    }
  }
});
