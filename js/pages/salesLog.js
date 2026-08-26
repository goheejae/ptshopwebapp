/**
 * js/pages/salesLog.js — 매출일지 모듈
 *
 * PT 세션 매출을 독립적으로 기록·관리합니다. 결산(finance.js)과 데이터를
 * 주고받지 않는 별도 장부이며, 대기/확정 같은 상태 구분 없이 등록된 항목을
 * 그대로 목록으로 보여줍니다.
 *
 * 기간 표시:
 *   2025-11 ~ 2026-12 → 통합 구간
 *   2027-01 ~         → 1년 단위 구간 (2027년, 2028년, …)
 *   구간 분류는 항목의 실제 date 를 기준으로 계산합니다 — 저장된 값 자체는 바꾸지 않습니다.
 */

import DB from '../db.js';
import { showToast, escHtml, fmtMoney } from '../utils.js';

// ── 기간 정의 ──
const PERIODS = [
  { key: '2025-11~2026-12', label: '2025년 11월 ~ 2026년 12월', start: '2025-11', end: '2026-12' },
];
const FIRST_YEARLY = 2027;   // 이 연도부터 1년 단위 구간

function yearPeriod(year) {
  return { key: String(year), label: `${year}년`, start: `${year}-01`, end: `${year}-12` };
}
/** 'YYYY-MM' → 해당 월이 속한 구간 객체. 통합 구간 이전 데이터도 통합 구간에 포함(catch-all). */
function periodForMonth(monthKey) {
  if (monthKey <= PERIODS[0].end) return PERIODS[0];
  return yearPeriod(parseInt(monthKey.slice(0, 4), 10));
}
function periodByKey(key) {
  return key === PERIODS[0].key ? PERIODS[0] : yearPeriod(parseInt(key, 10));
}
function prevPeriodKey(cur) {
  if (cur === PERIODS[0].key) return null;
  const year = parseInt(cur, 10);
  return (year - 1 < FIRST_YEARLY) ? PERIODS[0].key : String(year - 1);
}
function nextPeriodKey(cur) {
  if (cur === PERIODS[0].key) return String(FIRST_YEARLY);
  return String(parseInt(cur, 10) + 1);
}

/** 구간에 속한 매출일지 항목을 실제 date 기준으로 골라 날짜 오름차순 반환 */
function entriesInPeriod(periodKey) {
  const p       = periodByKey(periodKey);
  const isFirst = periodKey === PERIODS[0].key;
  return Object.values(DB._d.salesLogs || {})
    .filter(e => {
      if (!e || !e.date) return false;
      const mk = e.date.slice(0, 7);
      return isFirst ? mk <= p.end : (mk >= p.start && mk <= p.end);
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

// ── 모듈 레벨 상태 ──
let slPeriod = periodForMonth(new Date().toISOString().slice(0, 7)).key;
let slType   = 'new';   // 입력 폼 신규/재등록

function todayStr() { return new Date().toISOString().slice(0, 10); }

// ════════════════════════════════
// 강사별 신규매출 현황 렌더
// ════════════════════════════════
/**
 * 매출일지 entries 에서 신규(=재등록 아닌) 항목을 강사별로 집계해 카드 UI 로 보여줍니다.
 * 회원 수(고유 회원명) 도 함께 노출.
 */
function renderSalesLogStats(entries) {
  const wrap = document.getElementById('sl-stats');
  if (!wrap) return;

  const newOnly = entries.filter(e => e.type !== 'renewal');

  const calc = inst => {
    const rows     = newOnly.filter(e => e.instructor === inst);
    const totalAmt = rows.reduce((s, e) => s + e.amount, 0);
    const members  = new Set(rows.map(e => (e.memberName || '').trim()).filter(Boolean));
    return { cnt: rows.length, totalAmt, memberCnt: members.size };
  };

  const ko  = calc('ko');
  const lee = calc('lee');

  const card = (name, cls, s) => `
    <div class="sl-stat-card">
      <div class="sl-stat-name"><span class="badge-${cls}">${name}</span></div>
      <div class="sl-stat-row">
        <span class="sl-stat-label">신규 회원 수</span>
        <span class="sl-stat-val">${s.memberCnt}명</span>
      </div>
      <div class="sl-stat-row">
        <span class="sl-stat-label">신규매출 총합 (${s.cnt}건)</span>
        <span class="sl-stat-val sl-stat-strong">${fmtMoney(s.totalAmt)}</span>
      </div>
    </div>
  `;

  wrap.innerHTML = `<div class="sl-stat-grid">${card('고희재', 'ko', ko)}${card('이건우', 'lee', lee)}</div>`;
}

// ════════════════════════════════
// 누적 신규회원 현황 — 매출일지 단독 집계 (전체 기간)
// ════════════════════════════════
/**
 * 모든 기간의 매출일지(type='new') 항목만으로 강사별 고유 회원 수 / 총 매출액 통계를 만듭니다.
 */
function renderCumulativeNewMembers() {
  const wrap = document.getElementById('sl-cumulative');
  if (!wrap) return;

  const stats = inst => {
    const memberSet = new Set();
    let totalAmt = 0, cnt = 0;

    Object.values(DB._d.salesLogs || {}).forEach(e => {
      if (!e || e.instructor !== inst) return;
      if (e.type === 'renewal') return;
      const name = (e.memberName || '').trim();
      if (name) memberSet.add(name);
      totalAmt += e.amount;
      cnt++;
    });

    return { memberCnt: memberSet.size, totalAmt, cnt };
  };

  const ko  = stats('ko');
  const lee = stats('lee');

  const card = (name, cls, s) => `
    <div class="sl-stat-card">
      <div class="sl-stat-name"><span class="badge-${cls}">${name}</span></div>
      <div class="sl-stat-row">
        <span class="sl-stat-label">신규회원 수 (고유 이름)</span>
        <span class="sl-stat-val sl-stat-strong">${s.memberCnt}명</span>
      </div>
      <div class="sl-stat-row">
        <span class="sl-stat-label">신규매출 합계 (${s.cnt}건)</span>
        <span class="sl-stat-val sl-stat-strong">${fmtMoney(s.totalAmt)}</span>
      </div>
    </div>
  `;

  wrap.innerHTML = `<div class="sl-stat-grid">${card('고희재', 'ko', ko)}${card('이건우', 'lee', lee)}</div>`;
}

// ════════════════════════════════
// 메인 렌더 함수
// ════════════════════════════════
export function renderSalesLog() {
  document.getElementById('page-content').innerHTML = `
    <div class="page-header"><h1>📋 매출일지</h1></div>

    <!-- 기간 이동 -->
    <div class="fin-nav">
      <button class="fin-nav-btn" id="sl-prev">‹</button>
      <div class="fin-month-label" id="sl-month-label"></div>
      <button class="fin-nav-btn" id="sl-next">›</button>
    </div>

    <!-- 입력 폼 -->
    <div class="fin-section">
      <div class="fin-section-header-row"><span>✏️ 매출 등록</span></div>
      <div class="fin-form">
        <div class="fin-form-field">
          <label>날짜</label>
          <input type="date" id="sl-date" class="fin-input" value="${todayStr()}" />
        </div>
        <div class="fin-form-field">
          <label>담당 선생님</label>
          <select id="sl-inst" class="fin-input">
            <option value="ko">고희재</option>
            <option value="lee">이건우</option>
          </select>
        </div>
        <div class="fin-form-field">
          <label>회원명</label>
          <input type="text" id="sl-member" class="fin-input" placeholder="홍길동" style="width:100px" />
        </div>
        <div class="fin-form-field">
          <label>금액 (원)</label>
          <input type="number" id="sl-amount" class="fin-input" placeholder="0" style="width:120px" min="0" />
        </div>
        <div class="fin-form-field">
          <label>구분</label>
          <div class="fin-type-toggle">
            <button class="fin-toggle-btn active" id="sl-type-new">신규</button>
            <button class="fin-toggle-btn" id="sl-type-renewal">재등록</button>
          </div>
        </div>
        <div class="fin-form-field">
          <label>결제수단</label>
          <select id="sl-pay" class="fin-input">
            <option value="card">카드</option>
            <option value="cash">현금</option>
            <option value="transfer">계좌이체</option>
          </select>
        </div>
        <button class="btn btn-export" id="sl-add-btn">+ 추가</button>
      </div>
    </div>

    <!-- 강사별 신규매출 현황 (현재 구간) -->
    <div class="fin-section">
      <div class="fin-section-header-row">
        <span>📈 신규매출 현황</span>
      </div>
      <div id="sl-stats"></div>
    </div>

    <!-- 매출일지 리스트 -->
    <div class="fin-section">
      <div class="fin-section-header-row">
        <span>📋 매출일지 목록</span>
        <span id="sl-summary" style="font-size:12px;color:var(--text-muted)"></span>
      </div>
      <div class="fin-table-wrap">
        <table class="fin-table sl-table">
          <thead><tr>
            <th style="min-width:96px">날짜</th>
            <th>선생님</th>
            <th>회원명</th>
            <th style="min-width:90px">원금</th>
            <th>구분</th>
            <th>결제</th>
            <th></th>
          </tr></thead>
          <tbody id="sl-tbody"></tbody>
        </table>
      </div>
    </div>

    <!-- 누적 신규회원 현황 (매출일지 단독, 전체 기간) -->
    <div class="fin-section">
      <div class="fin-section-header-row">
        <span>👥 신규회원 누적 현황 — 매출일지 (모든 기간)</span>
      </div>
      <div id="sl-cumulative"></div>
    </div>
  `;

  bindSalesLogEvents();
  renderSalesLogData();
}

// ════════════════════════════════
// 데이터 렌더
// ════════════════════════════════
function renderSalesLogData() {
  // 구간 레이블 + prev 비활성화
  document.getElementById('sl-month-label').textContent = periodByKey(slPeriod).label;
  const prevBtn = document.getElementById('sl-prev');
  if (prevBtn) {
    const atEarliest = slPeriod === PERIODS[0].key;
    prevBtn.disabled      = atEarliest;
    prevBtn.style.opacity = atEarliest ? '0.3' : '1';
    prevBtn.style.cursor  = atEarliest ? 'not-allowed' : 'pointer';
  }

  const entries = entriesInPeriod(slPeriod);

  // 요약
  const newEntries = entries.filter(e => e.type !== 'renewal');
  const sumEl = document.getElementById('sl-summary');
  if (sumEl) {
    const totalAmt = newEntries.reduce((s, e) => s + e.amount, 0);
    sumEl.textContent = `신규 ${newEntries.length}건 ${fmtMoney(totalAmt)}`;
  }

  // 강사별 신규매출 현황 — 현재 구간 entries 기반 (재등록 제외)
  renderSalesLogStats(entries);
  // 누적 신규회원 — 모든 기간의 매출일지 단독 집계
  renderCumulativeNewMembers();

  document.getElementById('sl-tbody').innerHTML = entries.length === 0
    ? '<tr class="fin-empty-row"><td colspan="7">등록된 매출일지가 없습니다</td></tr>'
    : entries.map(e => buildRow(e)).join('');

  bindRowEvents();
}

// ────────────────────────────────
// 행 HTML 생성
// ────────────────────────────────
function buildRow(e) {
  const instLabel = e.instructor === 'ko' ? '고희재' : '이건우';
  const payLabel  = { card:'카드', cash:'현금', transfer:'계좌이체' }[e.payMethod] ?? e.payMethod;

  return `
    <tr class="fin-data-row sl-data-row" data-id="${escHtml(e.id)}" title="클릭하여 수정">
      <td>${escHtml(e.date)}</td>
      <td><span class="badge-${escHtml(e.instructor)}">${instLabel}</span></td>
      <td>${escHtml(e.memberName || '—')}</td>
      <td style="font-weight:600">${fmtMoney(e.amount)}</td>
      <td><span class="fin-type-btn ${e.type === 'renewal' ? 'renewal' : 'new'}"
               style="pointer-events:none">${e.type === 'renewal' ? '재등록' : '신규'}</span></td>
      <td>${payLabel}</td>
      <td><button class="sl-del-btn fin-del" data-id="${escHtml(e.id)}">✕</button></td>
    </tr>`;
}

// ────────────────────────────────
// 행 이벤트 바인딩
// ────────────────────────────────
function bindRowEvents() {
  // ✕ 삭제
  document.querySelectorAll('.sl-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      DB.salesLogsDel(btn.dataset.id);
      renderSalesLogData();
      showToast('삭제했습니다');
    });
  });

  // 행 클릭 → 인라인 편집
  document.querySelectorAll('.sl-data-row').forEach(row => {
    row.addEventListener('click', ev => {
      if (ev.target.closest('button')) return;
      enterEditMode(row);
    });
  });
}

// ════════════════════════════════
// 인라인 편집 모드
// ════════════════════════════════
function enterEditMode(row) {
  const id = row.dataset.id;
  const e  = DB.salesLogsGetById(id);
  if (!e) return;

  const s = v => escHtml(v || '');

  row.innerHTML = `
    <td><input class="fin-inline-input" type="date" name="date" value="${s(e.date)}" /></td>
    <td>
      <select class="fin-inline-input" name="instructor">
        <option value="ko"  ${e.instructor==='ko' ?'selected':''}>고희재</option>
        <option value="lee" ${e.instructor==='lee'?'selected':''}>이건우</option>
      </select>
    </td>
    <td><input class="fin-inline-input" type="text" name="memberName" value="${s(e.memberName)}" style="width:80px"/></td>
    <td><input class="fin-inline-input" type="number" name="amount" value="${e.amount}" style="width:90px" min="0"/></td>
    <td>
      <select class="fin-inline-input" name="type">
        <option value="new"     ${e.type==='new'    ?'selected':''}>신규</option>
        <option value="renewal" ${e.type==='renewal'?'selected':''}>재등록</option>
      </select>
    </td>
    <td>
      <select class="fin-inline-input" name="payMethod">
        <option value="card"     ${e.payMethod==='card'    ?'selected':''}>카드</option>
        <option value="cash"     ${e.payMethod==='cash'    ?'selected':''}>현금</option>
        <option value="transfer" ${e.payMethod==='transfer'?'selected':''}>계좌이체</option>
      </select>
    </td>
    <td style="white-space:nowrap">
      <button class="fin-edit-save">저장</button>
      <button class="fin-edit-cancel">취소</button>
    </td>`;

  row.querySelector('.fin-edit-save').addEventListener('click', () => {
    const patch = {};
    row.querySelectorAll('[name]').forEach(el => {
      patch[el.name] = el.name === 'amount' ? (parseInt(el.value, 10) || 0) : el.value;
    });
    // 날짜가 바뀌면 실제 소속 구간도 자동으로 바뀜(구간은 date 기준 계산) — month 필드도 함께 갱신
    patch.month = patch.date.slice(0, 7);
    DB.salesLogsUpdate(id, patch);
    renderSalesLogData();
    showToast('수정했습니다');
  });

  row.querySelector('.fin-edit-cancel').addEventListener('click', () => renderSalesLogData());
}

// ════════════════════════════════
// 이벤트 바인딩 (폼)
// ════════════════════════════════
function bindSalesLogEvents() {
  // 구간 이동
  document.getElementById('sl-prev').addEventListener('click', () => {
    const prev = prevPeriodKey(slPeriod);
    if (!prev) return;
    slPeriod = prev;
    renderSalesLogData();
  });
  document.getElementById('sl-next').addEventListener('click', () => {
    slPeriod = nextPeriodKey(slPeriod);
    renderSalesLogData();
  });

  // 신규/재등록 토글
  document.getElementById('sl-type-new').addEventListener('click', () => {
    slType = 'new';
    document.getElementById('sl-type-new').classList.add('active');
    document.getElementById('sl-type-renewal').classList.remove('active');
  });
  document.getElementById('sl-type-renewal').addEventListener('click', () => {
    slType = 'renewal';
    document.getElementById('sl-type-renewal').classList.add('active');
    document.getElementById('sl-type-new').classList.remove('active');
  });

  // 추가 버튼
  document.getElementById('sl-add-btn').addEventListener('click', () => {
    const date   = document.getElementById('sl-date').value;
    const amount = parseInt(document.getElementById('sl-amount').value, 10) || 0;
    if (!date || !amount) { showToast('날짜와 금액을 입력하세요'); return; }

    DB.salesLogsAdd({
      month:      date.slice(0, 7),
      date,
      instructor: document.getElementById('sl-inst').value,
      memberName: document.getElementById('sl-member').value.trim(),
      amount,
      type:       slType,
      payMethod:  document.getElementById('sl-pay').value,
    });

    showToast('매출을 등록했습니다');

    document.getElementById('sl-amount').value = '';
    document.getElementById('sl-member').value = '';
    renderSalesLogData();
  });
}
