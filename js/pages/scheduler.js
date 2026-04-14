/**
 * js/pages/scheduler.js — 주간 스케쥴러 페이지
 *
 * 역할: 고희재·이건우 강사의 주간 시간표를 관리합니다.
 *       - 셀 드래그로 범위 선택 → 배경색/유형 일괄 적용
 *       - 셀 더블클릭 → 인라인 텍스트 편집
 *       - 커스텀 유형 추가/삭제
 *       - 이전/다음 주 네비게이션
 *
 * 충돌 방지 규칙:
 *   - mousedown → isDragging = true
 *   - document.mouseup (전역 단일 핸들러) → isDragging = false
 *   - dblclick는 mouseup×2 이후 발생 → isDragging 항상 false 보장
 *   - input 내부 mousedown에서 e.stopPropagation() → 드래그 재시작 방지
 *
 * 사용법: import { renderScheduler } from './pages/scheduler.js';
 */

import DB from '../db.js';
import { showToast, escHtml } from '../utils.js';

// ── 상수 ──
/** 강사 목록 */
const INSTRUCTORS = [
  { id: 'ko',  name: '고희재' },
  { id: 'lee', name: '이건우' },
];

/** 표시할 시간대: 7시 ~ 22시 (총 16행) */
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);

/** 요일 한글 이름 */
const DAYS_KR = ['월', '화', '수', '목', '금', '토', '일'];

/** 앱에 기본 내장된 유형 (사용자가 삭제 불가) */
const DEFAULT_TYPES = [
  { name: '수업', color: '#000000' },
  { name: '상담', color: '#0000FF' },
  { name: '청소', color: '#008000' },
  { name: '회의', color: '#FFA500' },
];

/** 엑셀 스타일 배경색 팔레트 (5행 × 10열 = 50색) */
const BG_PALETTE = [
  '#ffffff','#f2f2f2','#d9d9d9','#bfbfbf','#a6a6a6','#808080','#595959','#404040','#262626','#000000',
  '#fff9c4','#fff59d','#fff176','#ffee58','#ffca28','#ffa726','#ff7043','#ef5350','#e53935','#b71c1c',
  '#e3f2fd','#90caf9','#42a5f5','#1e88e5','#1565c0','#e8f5e9','#66bb6a','#43a047','#2e7d32','#1b5e20',
  '#f3e5f5','#ce93d8','#ab47bc','#7b1fa2','#4a148c','#fce4ec','#f48fb1','#e91e63','#c2185b','#880e4f',
  '#e5414a','#4f7cff','#2ab07f','#f59e0b','#8b5cf6','#ec4899','#0ea5e9','#10b981','#f97316','#6366f1',
];

/** bg 값(레거시 문자열 또는 hex 색상)을 CSS 색상값으로 변환 */
function bgColor(bg) {
  if (!bg) return '';
  if (bg === 'resident') return '#ffffff';
  if (bg === 'non-resident') return '#ebebeb';
  return bg;
}

// ── 모듈 레벨 상태 ──
// 이 변수들은 페이지를 다시 렌더링해도 값이 유지됩니다.

/** 현재 보고 있는 주의 월요일 날짜 */
let schedWeekStart = getMonday(new Date());

/** 드래그 시작 정보: { instId, wKey, startDay, startHour } */
let dragInfo = null;

/** 현재 드래그 중인지 여부 */
let isDragging = false;

/** 드래그가 실제로 이동했는지 여부 (단순 클릭과 구분) */
let dragHasMoved = false;

/** 현재 선택된 셀 목록: [{instId, wKey, day, hour}] */
let schedSelected = [];

/** 현재 시간선 인터벌 ID */
let timeLineInterval = null;

/** 드롭다운에 표시되는 현재 선택 배경색 (앱 진입 시 항상 흰색) */
let selectedBgColor = '#ffffff';

/** 모바일 더블탭 감지용 */
let lastTapCell = null;
let lastTapTime  = 0;

// ── 드롭다운 외부 클릭 시 닫기 (모듈 초기화 시 한 번만 등록) ──
document.addEventListener('click', e => {
  if (!e.target.closest('.sched-dd-wrap')) {
    document.querySelectorAll('.sched-dd-panel.open').forEach(p => p.classList.remove('open'));
  }
});

// ── 터치 드래그 (touchmove는 시작 엘리먼트에서만 발생 → document에서 좌표로 셀 탐색) ──
document.addEventListener('touchmove', e => {
  if (!isDragging || !dragInfo) return;
  if (e.touches.length !== 1) return;
  e.preventDefault();
  const touch = e.touches[0];
  const el    = document.elementFromPoint(touch.clientX, touch.clientY);
  const cell  = el?.closest('.sched-cell');
  if (!cell || cell.dataset.inst !== dragInfo.instId) return;
  dragHasMoved = true;
  const { day, hour } = coords(cell);
  clearSelection();
  selectRange(dragInfo.instId, dragInfo.wKey,
              dragInfo.startDay, dragInfo.startHour, day, hour);
}, { passive: false });

document.addEventListener('touchend', () => {
  if (!isDragging) return;
  isDragging = false;
  const allSelected = document.querySelectorAll('.sched-cell.selected');
  if (allSelected.length) {
    showFloatingDeleteBtn(allSelected[allSelected.length - 1]);
  } else {
    hideFloatingDeleteBtn();
  }
});

// ── 전역 mouseup 핸들러 (딱 한 번만 등록) ──
// 드래그가 테이블 밖에서 끝나도 isDragging이 해제되도록 document에 등록합니다.

document.addEventListener('mouseup', () => {
  isDragging = false;
  // 드래그가 끝났고 선택된 셀이 있으면 플로팅 삭제 버튼 표시
  if (schedSelected.length > 0) {
    const lastCell = document.querySelector(
      `.sched-cell.selected:last-of-type`
    ) || document.querySelector('.sched-cell.selected');
    // 선택 셀 중 DOM 기준 마지막 셀 찾기
    const allSelected = document.querySelectorAll('.sched-cell.selected');
    if (allSelected.length) {
      showFloatingDeleteBtn(allSelected[allSelected.length - 1]);
    }
  } else {
    hideFloatingDeleteBtn();
  }
});

// ── 플로팅 삭제 버튼 표시/숨김 ──
function showFloatingDeleteBtn(lastCell) {
  let btn = document.getElementById('floating-clear-btn');
  if (!btn) {
    btn = document.createElement('div');
    btn.id = 'floating-clear-btn';
    btn.className = 'floating-clear-btn';
    btn.textContent = '🗑 영역 비우기';
    document.body.appendChild(btn);
  }
  // onclick을 매번 재바인딩해서 stale closure 방지
  btn.onclick = e => {
    e.stopPropagation(); // 이벤트 버블링으로 인한 hide 충돌 차단
    window.clearSelectedCells();
  };
  // position:fixed — 스크롤과 무관하게 뷰포트 기준 고정
  const rect = lastCell.getBoundingClientRect();
  const top  = Math.min(rect.bottom + 6, window.innerHeight - 48);
  const left = Math.max(4, Math.min(rect.right - 130, window.innerWidth - 140));
  btn.style.top     = `${top}px`;
  btn.style.left    = `${left}px`;
  btn.style.display = 'block';
}

function hideFloatingDeleteBtn() {
  const btn = document.getElementById('floating-clear-btn');
  if (btn) btn.style.display = 'none';
}

// 스크롤 시 즉시 숨김 (capture: true → 자식 요소 스크롤도 감지)
window.addEventListener('scroll', () => hideFloatingDeleteBtn(), true);

// 셀·버튼 외 영역 mousedown 시 숨김
document.addEventListener('mousedown', e => {
  if (!e.target.closest('.sched-cell') && e.target.id !== 'floating-clear-btn') {
    hideFloatingDeleteBtn();
  }
});

// ── 선택 셀 전체 삭제 (텍스트 + 배경) ──
window.clearSelectedCells = function () {
  if (!schedSelected.length) return;
  schedSelected.forEach(({ instId, wKey: w, day, hour }) => {
    setCell(instId, w, day, hour, { text: '', bg: '' });
  });
  applyDataToSelectedCells();
  hideFloatingDeleteBtn();
};

// Delete / Backspace 키 → 선택 셀 삭제 (input/textarea 포커스 중일 때는 제외)
document.addEventListener('keydown', e => {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (!schedSelected.length) return;
  e.preventDefault();
  window.clearSelectedCells();
});

// ════════════════════════════════
// 날짜 헬퍼 함수
// ════════════════════════════════

/**
 * 주어진 날짜가 속한 주의 월요일을 반환합니다.
 * @param {Date} d
 * @returns {Date}
 */
function getMonday(d) {
  const day  = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // 일요일(0)이면 -6, 나머지는 1-day
  const m    = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

/**
 * 날짜에 n일을 더한 새 Date를 반환합니다.
 * @param {Date}   d
 * @param {number} n
 * @returns {Date}
 */
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * 날짜를 "M/D" 형식 문자열로 반환합니다. 예: "4/7"
 * @param {Date} d
 * @returns {string}
 */
function fmt(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 월요일 날짜를 "YYYY-MM-DD" 형식 문자열로 반환합니다.
 * localStorage 키와 data 속성에 사용됩니다.
 * @param {Date} monday
 * @returns {string}
 */
function weekKey(monday) {
  return monday.toISOString().slice(0, 10);
}

/**
 * 주어진 날짜가 오늘인지 확인합니다.
 * @param {Date} d
 * @returns {boolean}
 */
function isToday(d) {
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth()    === t.getMonth()    &&
    d.getDate()     === t.getDate()
  );
}

// ════════════════════════════════
// 셀 데이터 접근 (DB 위임)
// ════════════════════════════════

/** DB에서 셀 데이터를 읽어옵니다. */
function getCell(instId, wKey, day, hour) {
  return DB.schedGet(instId, wKey, day, hour);
}

/** DB에 셀 데이터를 저장합니다. */
function setCell(instId, wKey, day, hour, patch) {
  DB.schedSet(instId, wKey, day, hour, patch);
}

// ════════════════════════════════
// 메인 렌더 함수
// ════════════════════════════════

/**
 * 스케쥴러 페이지를 #page-content에 그립니다.
 * 주간 이동, 유형 변경 시 이 함수를 다시 호출하여 전체를 새로 그립니다.
 */
export function renderScheduler() {
  const wKey      = weekKey(schedWeekStart);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(schedWeekStart, i));
  const label     = `${fmt(weekDates[0])} ~ ${fmt(weekDates[6])}`;

  // 기본 유형 + 사용자 추가 유형을 합칩니다
  const allTypes = [...DEFAULT_TYPES, ...DB.typesGet()];

  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `
    <div class="page-header"><h1>📅 주간 스케쥴러</h1></div>

    <!-- 툴바: 주간 이동 + 배경색 + 유형 버튼 -->
    <div class="sched-toolbar">

      <!-- 주간 네비게이션 -->
      <div class="sched-week-nav">
        <button class="sched-nav-btn" id="sc-prev">‹</button>
        <span class="sched-week-label">${label}</span>
        <button class="sched-nav-btn" id="sc-next">›</button>
        <button class="sched-nav-btn sched-today-btn" id="sc-today">오늘</button>
      </div>

      <div class="sched-divider"></div>

      <!-- 배경색 드롭다운 -->
      <div class="sched-dd-wrap" id="bg-dd-wrap">
        <button class="sched-dd-trigger" id="bg-dd-btn">
          <span class="sched-color-swatch" style="background:${selectedBgColor};"></span>
          배경색
          <span class="dd-arrow">▾</span>
        </button>
        <div class="sched-dd-panel" id="bg-dd-panel">
          <div class="excel-palette">
            ${BG_PALETTE.map(c => `<div class="pal-item" data-bg-color="${c}" style="background:${c};" title="${c}"></div>`).join('')}
          </div>
          <button class="sched-bg-btn clear-bg" data-bg="" style="margin-top:6px;">지우기 (흰색)</button>
        </div>
      </div>

      <div class="sched-divider"></div>

      <!-- 유형(폰트 색상) 드롭다운 -->
      <div class="sched-dd-wrap" id="type-dd-wrap">
        <button class="sched-dd-trigger" id="type-dd-btn">
          유형
          <span class="dd-arrow">▾</span>
        </button>
        <div class="sched-dd-panel" id="type-dd-panel">
          <div class="sched-type-list">
            ${allTypes.map((t, i) => `
              <div class="sched-type-wrap">
                <button class="sched-type-btn" data-color="${t.color}" style="color:${t.color};">${t.name}</button>
                ${i >= DEFAULT_TYPES.length
                  ? `<span class="sched-type-del" data-idx="${i - DEFAULT_TYPES.length}">✕</span>`
                  : ''}
              </div>`).join('')}
          </div>
          <button class="sched-add-type-btn" id="sc-add-type" title="유형 추가">＋</button>
        </div>
      </div>

    </div>

    <!-- 강사별 시간표 테이블 -->
    <div class="sched-tables">
      ${INSTRUCTORS.map(inst => `
        <div class="sched-table-wrap">
          <div class="sched-instructor-bar">
            👤 ${inst.name}
            <button class="sched-deadline-btn${DB.deadlineGet(inst.id) ? ' active' : ''}" data-inst="${inst.id}">
              ${DB.deadlineGet(inst.id) ? '마감중' : '마감'}
            </button>
          </div>
          <div class="sched-table-scroll">
            <table class="sched-table" data-inst="${inst.id}" data-wkey="${wKey}">
              <thead>
                <tr>
                  <th class="sched-th-time">시간</th>
                  ${weekDates.map((d, i) => `
                    <th class="sched-th-day ${isToday(d) ? 'today-col' : ''} ${i === 5 ? 'sat' : i === 6 ? 'sun' : ''}" data-day="${i}">
                      <span class="day-kr">${DAYS_KR[i]}</span>
                      <span class="day-date">${fmt(d)}</span>
                    </th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${HOURS.map(hour => `
                  <tr>
                    <td class="sched-td-time">${String(hour).padStart(2, '0')}:00</td>
                    ${weekDates.map((_, day) => {
                      const c  = getCell(inst.id, wKey, day, hour);
                      const bg = bgColor(c.bg);
                      return `<td class="sched-cell ${isToday(weekDates[day]) ? 'today-col' : ''}"
                        data-inst="${inst.id}" data-wkey="${wKey}"
                        data-day="${day}" data-hour="${hour}"
                        style="background:${bg}; color:${c.typeColor || ''};"
                      >${c.text ? `<span class="sched-cell-text">${escHtml(c.text)}</span>` : ''}</td>`;
                    }).join('')}
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`).join('')}
    </div>

    <!-- 유형 추가 모달 -->
    <div id="type-modal" class="modal-overlay" style="display:none;">
      <div class="modal-box">
        <div class="modal-title">새 유형 추가</div>
        <div class="modal-body">
          <label>유형 이름</label>
          <input type="text" id="new-type-name" placeholder="예: 수업" />
          <label>폰트 색상</label>
          <div class="color-presets">
            ${['#e5414a','#4f7cff','#2ab07f','#ff6b35','#f59e0b','#8b5cf6','#ec4899','#0ea5e9'].map(c =>
              `<div class="color-dot" style="background:${c};" data-preset="${c}" title="${c}"></div>`
            ).join('')}
          </div>
          <div class="color-row">
            <input type="color" id="new-type-color" value="#ff6b35" />
            <span id="new-type-color-val" style="font-size:13px; font-weight:600;">#ff6b35</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-import" id="modal-cancel">취소</button>
          <button class="btn btn-export" id="modal-confirm">추가</button>
        </div>
      </div>
    </div>
  `;

  bindSchedulerEvents(wKey);
}

// ════════════════════════════════
// 마감 & 현재 시간선
// ════════════════════════════════

/**
 * 현재 보고 있는 주에서 오늘의 dayIndex(0=월…6=일)를 반환합니다.
 * 이번 주가 아니면 -1을 반환합니다.
 */
function getTodayDayIndex() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(schedWeekStart);
  monday.setHours(0, 0, 0, 0);
  const diff = Math.round((today - monday) / (1000 * 60 * 60 * 24));
  return diff >= 0 && diff <= 6 ? diff : -1;
}

/**
 * 마감: 오늘 현재 시각 이후의 빈 셀을 연한 회색으로 채웁니다.
 * 채워진 셀에 deadlineFilled: true 플래그를 저장해 복구 시 식별합니다.
 */
function applyDeadline(instId, wKey) {
  const todayIdx = getTodayDayIndex();
  if (todayIdx === -1) {
    showToast('현재 주가 아닙니다. 오늘 버튼을 눌러 이동하세요.');
    return;
  }
  const currentHour = new Date().getHours();
  const GRAY = '#d9d9d9'; // BG_PALETTE 좌측 3번째

  HOURS.forEach(hour => {
    if (hour < currentHour) return;
    const c = getCell(instId, wKey, todayIdx, hour);
    if (c.bg) return; // 이미 채워진 셀은 건드리지 않음
    setCell(instId, wKey, todayIdx, hour, { bg: GRAY, deadlineFilled: true });
    const cellEl = document.querySelector(
      `.sched-cell[data-inst="${instId}"][data-day="${todayIdx}"][data-hour="${hour}"]`
    );
    if (cellEl) cellEl.style.background = GRAY;
  });

  DB.deadlineSet(instId, true);
  const btn = document.querySelector(`.sched-deadline-btn[data-inst="${instId}"]`);
  if (btn) { btn.classList.add('active'); btn.textContent = '마감중'; }
}

/**
 * 마감 취소: deadlineFilled 플래그가 있는 셀만 흰색으로 복구합니다.
 */
function cancelDeadline(instId, wKey) {
  const todayIdx = getTodayDayIndex();

  DB.schedClearDeadlineFilled(instId);

  // 현재 주가 보이는 경우에만 DOM 즉시 업데이트
  if (todayIdx !== -1) {
    HOURS.forEach(hour => {
      const cellEl = document.querySelector(
        `.sched-cell[data-inst="${instId}"][data-day="${todayIdx}"][data-hour="${hour}"]`
      );
      if (!cellEl) return;
      const c = getCell(instId, wKey, todayIdx, hour);
      cellEl.style.background = bgColor(c.bg);
    });
  }

  DB.deadlineSet(instId, false);
  const btn = document.querySelector(`.sched-deadline-btn[data-inst="${instId}"]`);
  if (btn) { btn.classList.remove('active'); btn.textContent = '마감'; }
}

/**
 * 현재 시각에 맞게 모든 스케줄 테이블에 붉은 가로 선을 그립니다.
 * 스케줄러 페이지가 없으면 인터벌을 자동 종료합니다.
 */
function updateTimeLine() {
  if (!document.querySelector('.sched-table')) {
    clearInterval(timeLineInterval);
    timeLineInterval = null;
    return;
  }
  document.querySelectorAll('.sched-time-line').forEach(el => el.remove());

  const now = new Date();
  const h   = now.getHours();
  const m   = now.getMinutes();
  if (h < 7 || h >= 22) return;

  document.querySelectorAll('.sched-table-scroll').forEach(scrollEl => {
    const targetCell = scrollEl.querySelector(`.sched-cell[data-hour="${h}"]`);
    if (!targetCell) return;
    const row     = targetCell.closest('tr');
    const cRect   = scrollEl.getBoundingClientRect();
    const rRect   = row.getBoundingClientRect();
    const lineTop = rRect.top - cRect.top + scrollEl.scrollTop + (rRect.height * m / 60);

    const tableEl   = scrollEl.querySelector('.sched-table');
    const lineWidth = tableEl ? tableEl.offsetWidth : scrollEl.scrollWidth;

    const line = document.createElement('div');
    line.className   = 'sched-time-line';
    line.style.top   = `${lineTop}px`;
    line.style.width = `${lineWidth}px`;
    scrollEl.appendChild(line);
  });
}

/** 현재 시간선 인터벌을 시작(또는 재시작)합니다. */
function startTimeLine() {
  if (timeLineInterval) { clearInterval(timeLineInterval); timeLineInterval = null; }
  updateTimeLine();
  timeLineInterval = setInterval(updateTimeLine, 30000); // 30초마다 갱신
}

// ════════════════════════════════
// 이벤트 바인딩
// ════════════════════════════════

/**
 * 스케쥴러 페이지의 모든 이벤트 리스너를 등록합니다.
 * renderScheduler() 마지막에 호출됩니다.
 * @param {string} wKey - 현재 주의 weekKey
 */
function bindSchedulerEvents(wKey) {

  // ── 주간 네비게이션 버튼 ──
  document.getElementById('sc-prev').addEventListener('click', () => {
    schedWeekStart = addDays(schedWeekStart, -7);
    schedSelected  = [];
    renderScheduler();
  });
  document.getElementById('sc-next').addEventListener('click', () => {
    schedWeekStart = addDays(schedWeekStart, 7);
    schedSelected  = [];
    renderScheduler();
  });
  document.getElementById('sc-today').addEventListener('click', () => {
    schedWeekStart = getMonday(new Date());
    schedSelected  = [];
    renderScheduler();
  });

  // ── 배경색 드롭다운 토글 ──
  document.getElementById('bg-dd-btn').addEventListener('click', () => {
    document.getElementById('bg-dd-panel').classList.toggle('open');
    document.getElementById('type-dd-panel').classList.remove('open');
  });

  // ── 유형 드롭다운 토글 ──
  document.getElementById('type-dd-btn').addEventListener('click', () => {
    document.getElementById('type-dd-panel').classList.toggle('open');
    document.getElementById('bg-dd-panel').classList.remove('open');
  });

  // ── 팔레트 색상 클릭 ──
  document.querySelectorAll('.pal-item').forEach(item => {
    item.addEventListener('click', () => {
      if (!schedSelected.length) return showToast('먼저 셀을 선택하세요.');
      const color = item.dataset.bgColor;
      selectedBgColor = color;
      const swatch = document.querySelector('#bg-dd-btn .sched-color-swatch');
      if (swatch) swatch.style.background = color;
      document.getElementById('bg-dd-panel').classList.remove('open');
      schedSelected.forEach(({ instId, wKey: w, day, hour }) => {
        setCell(instId, w, day, hour, { bg: color });
      });
      applyDataToSelectedCells();
    });
  });

  // ── 배경 지우기 버튼 ──
  document.querySelectorAll('.sched-bg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!schedSelected.length) return showToast('먼저 셀을 선택하세요.');
      selectedBgColor = '#ffffff';
      const swatch = document.querySelector('#bg-dd-btn .sched-color-swatch');
      if (swatch) swatch.style.background = '#ffffff';
      document.getElementById('bg-dd-panel').classList.remove('open');
      schedSelected.forEach(({ instId, wKey: w, day, hour }) => {
        setCell(instId, w, day, hour, { bg: btn.dataset.bg });
      });
      applyDataToSelectedCells();
    });
  });

  // ── 유형(폰트 색상) 버튼 ──
  document.querySelectorAll('.sched-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!schedSelected.length) return showToast('먼저 셀을 선택하세요.');
      document.getElementById('type-dd-panel').classList.remove('open');
      schedSelected.forEach(({ instId, wKey: w, day, hour }) => {
        setCell(instId, w, day, hour, { typeColor: btn.dataset.color });
      });
      applyDataToSelectedCells();
    });
  });

  // ── 커스텀 유형 삭제 버튼 (✕) ──
  document.querySelectorAll('.sched-type-del').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation(); // 유형 버튼 클릭 이벤트가 함께 발생하지 않도록 막습니다
      DB.typesDel(+el.dataset.idx);
      renderScheduler();
    });
  });

  // ── 유형 추가 모달: 열기 ──
  document.getElementById('sc-add-type').addEventListener('click', () => {
    document.getElementById('type-modal').style.display = 'flex';
    document.getElementById('new-type-name').value      = '';
    document.getElementById('new-type-color').value     = '#ff6b35';
    document.getElementById('new-type-color-val').textContent = '#ff6b35';
  });

  // ── 유형 추가 모달: 닫기 ──
  document.getElementById('modal-cancel').addEventListener('click', () => {
    document.getElementById('type-modal').style.display = 'none';
  });
  // 모달 오버레이 클릭 시 닫기
  document.getElementById('type-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });

  // ── 색상 피커 → 옆에 hex 값 표시 ──
  document.getElementById('new-type-color').addEventListener('input', function () {
    document.getElementById('new-type-color-val').textContent = this.value;
  });

  // ── 컬러 프리셋 도트 클릭 → color input에 자동 입력 ──
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const hex = dot.dataset.preset;
      document.getElementById('new-type-color').value = hex;
      document.getElementById('new-type-color-val').textContent = hex;
    });
  });

  // ── 유형 추가 모달: 확인 버튼 ──
  document.getElementById('modal-confirm').addEventListener('click', () => {
    const name = document.getElementById('new-type-name').value.trim();
    if (!name) return showToast('유형 이름을 입력하세요.');
    DB.typesAdd({ name, color: document.getElementById('new-type-color').value });
    document.getElementById('type-modal').style.display = 'none';
    renderScheduler();
  });

  // ── 마감 버튼 ──
  document.querySelectorAll('.sched-deadline-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const instId = btn.dataset.inst;
      if (DB.deadlineGet(instId)) {
        cancelDeadline(instId, wKey);
      } else {
        applyDeadline(instId, wKey);
      }
    });
  });

  // ── 현재 시간선 시작 ──
  startTimeLine();

  // ── 각 셀에 드래그/더블클릭 이벤트 등록 ──
  document.querySelectorAll('.sched-cell').forEach(cell => {
    cell.addEventListener('mousedown',  onCellMouseDown);
    cell.addEventListener('mouseenter', onCellMouseEnter);
    cell.addEventListener('dblclick',   onCellDblClick);
    cell.addEventListener('touchstart', onCellTouchStart, { passive: false });
  });
}

// ════════════════════════════════
// 드래그 이벤트 핸들러
// ════════════════════════════════

/**
 * 터치 시작: 더블탭이면 인라인 편집기를 열고, 단일 탭이면 드래그를 시작합니다.
 * this = 터치한 <td> 요소
 */
function onCellTouchStart(e) {
  if (e.touches.length !== 1) return;
  if (e.target.classList.contains('sched-input')) return;

  const now  = Date.now();
  const cell = this;

  // 더블탭 감지: 같은 셀에 300ms 이내 두 번 탭
  if (lastTapCell === cell && now - lastTapTime < 300) {
    e.preventDefault();
    lastTapCell = null;
    isDragging  = false;
    clearSelection();
    openEditor(cell);
    return;
  }
  lastTapCell = cell;
  lastTapTime = now;

  e.preventDefault();
  isDragging   = true;
  dragHasMoved = false;
  hideFloatingDeleteBtn();
  const { instId, wKey, day, hour } = coords(cell);
  dragInfo = { instId, wKey, startDay: day, startHour: hour };
  clearSelection();
  selectRange(instId, wKey, day, hour, day, hour);
}

/**
 * 셀을 누르면 드래그를 시작합니다.
 * this = 클릭한 <td> 요소
 */
function onCellMouseDown(e) {
  if (e.button !== 0) return; // 마우스 왼쪽 버튼만 처리
  // 인라인 입력창 위를 클릭했을 때는 드래그 시작 안 함
  if (e.target.classList.contains('sched-input')) return;

  e.preventDefault(); // 텍스트 선택 방지
  isDragging   = true;
  dragHasMoved = false;
  hideFloatingDeleteBtn(); // 새 드래그 시작 시 기존 버튼 숨김

  const { instId, wKey, day, hour } = coords(this);
  dragInfo = { instId, wKey, startDay: day, startHour: hour };

  clearSelection();
  selectRange(instId, wKey, day, hour, day, hour);
}

/**
 * 드래그 중에 다른 셀로 마우스가 이동하면 범위를 확장합니다.
 * this = 마우스가 올라간 <td> 요소
 */
function onCellMouseEnter() {
  if (!isDragging || !dragInfo) return;
  // 다른 강사 테이블로는 드래그 불가
  if (this.dataset.inst !== dragInfo.instId) return;

  dragHasMoved = true;
  const { day, hour } = coords(this);
  clearSelection();
  selectRange(dragInfo.instId, dragInfo.wKey,
              dragInfo.startDay, dragInfo.startHour,
              day, hour);
}

/**
 * 셀을 더블클릭하면 인라인 텍스트 편집기를 엽니다.
 * this = 더블클릭한 <td> 요소
 */
function onCellDblClick(e) {
  // 이미 편집 중인 입력창이면 무시
  if (e.target.classList.contains('sched-input')) return;
  clearSelection();
  openEditor(this);
}

// ════════════════════════════════
// 선택 관련 유틸 함수
// ════════════════════════════════

/**
 * 셀의 data 속성에서 좌표 정보를 읽어 반환합니다.
 * @param {HTMLElement} cell - .sched-cell 요소
 * @returns {{ instId: string, wKey: string, day: number, hour: number }}
 */
function coords(cell) {
  return {
    instId: cell.dataset.inst,
    wKey:   cell.dataset.wkey,
    day:    +cell.dataset.day,
    hour:   +cell.dataset.hour,
  };
}

/** 현재 선택된 모든 셀을 해제합니다. */
function clearSelection() {
  document.querySelectorAll('.sched-cell.selected')
    .forEach(c => c.classList.remove('selected'));
  schedSelected = [];
}

/**
 * (d1,h1) ~ (d2,h2) 범위에 속하는 셀을 모두 선택합니다.
 * 드래그 방향에 관계없이 동작합니다 (역방향도 지원).
 */
function selectRange(instId, wKey, d1, h1, d2, h2) {
  const [minD, maxD] = [Math.min(d1, d2), Math.max(d1, d2)];
  const [minH, maxH] = [Math.min(h1, h2), Math.max(h1, h2)];
  schedSelected = [];

  document.querySelectorAll(`.sched-cell[data-inst="${instId}"]`).forEach(cell => {
    const d = +cell.dataset.day;
    const h = +cell.dataset.hour;
    if (d >= minD && d <= maxD && h >= minH && h <= maxH) {
      cell.classList.add('selected');
      schedSelected.push({ instId, wKey, day: d, hour: h });
    }
  });
}

/**
 * 배경색/유형 변경 후, 전체 재렌더 없이 선택된 셀의 스타일만 업데이트합니다.
 * 선택 상태(파란 외곽선)도 함께 유지합니다.
 */
function applyDataToSelectedCells() {
  schedSelected.forEach(({ instId, wKey, day, hour }) => {
    const cell = document.querySelector(
      `.sched-cell[data-inst="${instId}"][data-wkey="${wKey}"][data-day="${day}"][data-hour="${hour}"]`
    );
    if (!cell) return;

    const c = getCell(instId, wKey, day, hour);
    cell.style.background = bgColor(c.bg);
    cell.style.color = c.typeColor || '';

    // 텍스트 동기화
    const textEl = cell.querySelector('.sched-cell-text');
    if (c.text) {
      if (textEl) textEl.textContent = c.text;
      else {
        const span = document.createElement('span');
        span.className = 'sched-cell-text';
        span.textContent = c.text;
        cell.appendChild(span);
      }
    } else if (textEl) {
      textEl.remove();
    }

    // 스타일 변경 후에도 선택 외곽선을 다시 추가합니다
    cell.classList.add('selected');
  });
}

// ════════════════════════════════
// 인라인 편집기
// ════════════════════════════════

/**
 * 셀 위에 input을 생성하여 텍스트를 직접 편집할 수 있게 합니다.
 * 열기 전에 다른 모든 열린 입력창을 blur로 강제 저장합니다.
 * Enter/blur 시 저장, Escape 시 취소합니다.
 * @param {HTMLElement} cell - .sched-cell 요소
 */
function openEditor(cell) {
  // 1. 이미 열려있는 모든 입력창 강제 종료 및 저장
  document.querySelectorAll('.sched-input').forEach(el => {
    el.dispatchEvent(new Event('blur'));
  });

  const { instId, wKey, day, hour } = coords(cell);
  const c = getCell(instId, wKey, day, hour);

  const textEl = cell.querySelector('.sched-cell-text');
  if (textEl) textEl.style.visibility = 'hidden';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'sched-input';
  input.value = c.text || '';
  if (c.typeColor) input.style.color = c.typeColor;
  cell.appendChild(input);

  // 모바일/태블릿 가독성을 위해 폰트 크기 강제 조절(줌 방지)
  input.style.fontSize = '16px';
  input.focus();
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const val = input.value.trim();
    setCell(instId, wKey, day, hour, { text: val });
    input.remove();
    if (textEl) {
      textEl.style.visibility = '';
      textEl.textContent = val;
      if (!val) textEl.remove();
    } else if (val) {
      const span = document.createElement('span');
      span.className = 'sched-cell-text';
      span.textContent = val;
      cell.appendChild(span);
    }
    document.removeEventListener('pointerdown', globalPointerGuard);
  };

  // 2. PC 마우스와 태블릿 터치를 모두 감지하는 통합 가드
  const globalPointerGuard = (e) => {
    if (!cell.contains(e.target)) {
      commit();
    }
  };

  // 전역에 포인터 이벤트 등록 (현재 이벤트 전파가 끝난 뒤 등록되도록 setTimeout)
  setTimeout(() => {
    document.addEventListener('pointerdown', globalPointerGuard);
  }, 0);

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      committed = true;
      input.remove();
      if (textEl) textEl.style.visibility = '';
      document.removeEventListener('pointerdown', globalPointerGuard);
    }
    e.stopPropagation();
  });

  // 입력창 자체를 누를 때는 닫히지 않게 + 드래그 방지
  input.addEventListener('pointerdown', e => e.stopPropagation());
}
