/**
 * js/pages/salesLog.js — 매출일지 모듈
 *
 * PT 세션 매출을 기록하고 은행 입금 기록과 스마트 매칭하여
 * 확정(confirmed)된 항목만 정산(finance calcSettlement)에 반영합니다.
 *
 * 정산 반영 규칙:
 *   pending  → finance income 없음 → 정산 제외
 *   confirmed 신규 → finance income(은행액 or 원금) 생성 → 정산 포함
 *   confirmed 재등록 → finance income(isRenewal=true) 생성 → calcSettlement 자동 제외
 *
 * 스마트 매칭:
 *   pending 항목 렌더 시, DB.finance 전체에서 미연결 income 중
 *   금액 3% 이내 + 날짜 5일 이내 조건을 만족하는 후보를 표시합니다.
 */

import DB from '../db.js';
import { showToast, escHtml, fmtMoney } from '../utils.js';

// ── 상수 (finance.js 와 동일) ──
const LEGACY_KEY   = '2025-11~03';
const LEGACY_LABEL = '2025년 11월 ~ 2026년 3월 (통합)';
const FIRST_NORMAL = '2026-04';

// ── 모듈 레벨 상태 ──
let slMonth = new Date().toISOString().slice(0, 7);
if (slMonth < FIRST_NORMAL) slMonth = LEGACY_KEY;
let slType  = 'new';   // 입력 폼 신규/재등록

// ── 월 네비게이션 헬퍼 ──
function prevMonthKey(cur) {
  if (cur === FIRST_NORMAL) return LEGACY_KEY;
  if (cur === LEGACY_KEY)   return null;
  const d = new Date(cur + '-01');
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}
function nextMonthKey(cur) {
  if (cur === LEGACY_KEY) return FIRST_NORMAL;
  const d = new Date(cur + '-01');
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 7);
}
function monthLabel(key) {
  if (key === LEGACY_KEY) return LEGACY_LABEL;
  const [y, m] = key.split('-');
  return `${y}년 ${parseInt(m)}월`;
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

// ── 날짜 차이 (일) ──
function dayDiff(d1, d2) {
  return Math.abs((new Date(d1) - new Date(d2)) / 86400000);
}

// ════════════════════════════════
// 스마트 매칭 엔진
// ════════════════════════════════

/**
 * pending 매출일지 항목에 대해 DB.finance 전체를 스캔하여
 * 연결되지 않은 income 중 금액(3%)·날짜(5일) 조건을 만족하는 최적 후보를 반환합니다.
 *
 * @returns {{ month, incomeId, income } | null}
 */
function findBestMatch(slEntry) {
  const finMonths = Object.keys(DB._d.finance || {});
  let best      = null;
  let bestScore = -Infinity;

  for (const month of finMonths) {
    const mData = DB.financeGet(month);
    for (const inc of mData.incomes) {
      if (inc.salesLogId) continue;           // 이미 다른 매출일지에 연결됨
      if (!inc.amount || !inc.date) continue;

      const amtRatio = Math.abs(inc.amount - slEntry.amount) / slEntry.amount;
      if (amtRatio > 0.03) continue;          // 금액 3% 초과 제외

      const dd = dayDiff(inc.date, slEntry.date);
      if (dd > 5) continue;                   // 날짜 5일 초과 제외

      let score = 100 - amtRatio * 500 - dd * 8;

      // 이름 유사성 보너스
      if (inc.name && slEntry.memberName) {
        const n1 = inc.name.replace(/\s/g, '');
        const n2 = slEntry.memberName.replace(/\s/g, '');
        if (n1 && n2 && (n1.includes(n2) || n2.includes(n1))) score += 30;
      }

      if (score > bestScore) {
        bestScore = score;
        best = { month, incomeId: inc.id, income: inc };
      }
    }
  }
  return best;
}

// ════════════════════════════════
// 메인 렌더 함수
// ════════════════════════════════
export function renderSalesLog() {
  document.getElementById('page-content').innerHTML = `
    <div class="page-header"><h1>📋 매출일지</h1></div>

    <!-- 월 이동 -->
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

    <!-- 매출일지 리스트 -->
    <div class="fin-section">
      <div class="fin-section-header-row">
        <span>📋 매출일지 목록</span>
        <span id="sl-summary" style="font-size:12px;color:var(--text-muted)"></span>
      </div>
      <div class="sl-match-legend">
        <span class="sl-legend-dot pending"></span>대기(미확정) — 정산 미반영 &nbsp;
        <span class="sl-legend-dot confirmed"></span>확정 — 정산 반영
      </div>
      <div class="fin-table-wrap">
        <table class="fin-table sl-table">
          <thead><tr>
            <th>날짜</th><th>선생님</th><th>회원명</th><th>원금</th>
            <th>구분</th><th>결제</th><th>상태</th><th style="min-width:200px">은행 매칭 / 확정</th><th></th>
          </tr></thead>
          <tbody id="sl-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  bindSalesLogEvents();
  renderSalesLogData();
}

// ════════════════════════════════
// 데이터 렌더
// ════════════════════════════════
function renderSalesLogData() {
  // 월 레이블 + prev 비활성화
  document.getElementById('sl-month-label').textContent = monthLabel(slMonth);
  const prevBtn = document.getElementById('sl-prev');
  if (prevBtn) {
    prevBtn.disabled      = slMonth === LEGACY_KEY;
    prevBtn.style.opacity = slMonth === LEGACY_KEY ? '0.3' : '1';
    prevBtn.style.cursor  = slMonth === LEGACY_KEY ? 'not-allowed' : 'pointer';
  }

  // 날짜 오름차순 정렬
  const entries = DB.salesLogsGetByMonth(slMonth)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // 요약
  const confirmedNew = entries.filter(e => e.status === 'confirmed' && e.type !== 'renewal');
  const pendingCnt   = entries.filter(e => e.status === 'pending').length;
  const sumEl = document.getElementById('sl-summary');
  if (sumEl) {
    const confirmedAmt = confirmedNew.reduce((s, e) => s + (e.linkedAmount ?? e.amount), 0);
    sumEl.textContent = `확정 ${confirmedNew.length}건 ${fmtMoney(confirmedAmt)} | 대기 ${pendingCnt}건`;
  }

  // pending 항목에 대해 스마트 매칭 실행
  const matchMap = {};
  for (const e of entries) {
    if (e.status === 'pending') matchMap[e.id] = findBestMatch(e);
  }

  document.getElementById('sl-tbody').innerHTML = entries.length === 0
    ? '<tr class="fin-empty-row"><td colspan="9">등록된 매출일지가 없습니다</td></tr>'
    : entries.map(e => buildRow(e, matchMap[e.id])).join('');

  bindRowEvents();
}

// ────────────────────────────────
// 행 HTML 생성
// ────────────────────────────────
function buildRow(e, match) {
  const instLabel = e.instructor === 'ko' ? '고희재' : '이건우';
  const payLabel  = { card:'카드', cash:'현금', transfer:'계좌이체' }[e.payMethod] ?? e.payMethod;
  const isConf    = e.status === 'confirmed';

  const statusCell = isConf
    ? `<span class="sl-badge confirmed">✅ 확정</span>`
    : `<span class="sl-badge pending">🔵 대기</span>`;

  let matchCell;
  if (isConf) {
    const dispAmt = e.linkedAmount != null ? fmtMoney(e.linkedAmount) : fmtMoney(e.amount);
    matchCell = `
      <div class="sl-confirmed-info">
        <span>입금 ${dispAmt}</span>
        <button class="sl-cancel-btn fin-edit-cancel" data-id="${escHtml(e.id)}">↩️ 취소</button>
      </div>`;
  } else if (match) {
    matchCell = `
      <div class="sl-match-box">
        <span class="sl-match-hint" title="은행 기록">
          ${escHtml(match.income.date)}&nbsp;${fmtMoney(match.income.amount)}
        </span>
        <button class="sl-ok-btn"
          data-id="${escHtml(e.id)}"
          data-match-month="${escHtml(match.month)}"
          data-match-id="${escHtml(match.incomeId)}"
          data-match-amt="${match.income.amount}">✅ OK</button>
      </div>`;
  } else if (e.payMethod === 'cash') {
    matchCell = `
      <button class="sl-manual-btn fin-scan-btn"
        data-id="${escHtml(e.id)}"
        style="font-size:11px;padding:3px 10px">💵 입금 확인</button>`;
  } else {
    matchCell = `<span style="color:var(--text-muted);font-size:11px">은행 기록 대기 중…</span>`;
  }

  return `
    <tr class="fin-data-row sl-data-row${isConf ? ' sl-row-confirmed' : ''}"
        data-id="${escHtml(e.id)}" title="클릭하여 수정">
      <td>${escHtml(e.date)}</td>
      <td><span class="badge-${escHtml(e.instructor)}">${instLabel}</span></td>
      <td>${escHtml(e.memberName || '—')}</td>
      <td style="font-weight:600">${fmtMoney(e.amount)}</td>
      <td><span class="fin-type-btn ${e.type === 'renewal' ? 'renewal' : 'new'}"
               style="pointer-events:none">${e.type === 'renewal' ? '재등록' : '신규'}</span></td>
      <td>${payLabel}</td>
      <td>${statusCell}</td>
      <td>${matchCell}</td>
      <td><button class="sl-del-btn fin-del" data-id="${escHtml(e.id)}">✕</button></td>
    </tr>`;
}

// ────────────────────────────────
// 행 이벤트 바인딩
// ────────────────────────────────
function bindRowEvents() {
  // ✅ OK — 은행 매칭 승인
  document.querySelectorAll('.sl-ok-btn').forEach(btn => {
    btn.addEventListener('click', () =>
      confirmWithMatch(btn.dataset.id, btn.dataset.matchMonth, btn.dataset.matchId,
        parseFloat(btn.dataset.matchAmt))
    );
  });

  // 💵 수동 확정 (현금)
  document.querySelectorAll('.sl-manual-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmManual(btn.dataset.id));
  });

  // ↩️ 승인 취소
  document.querySelectorAll('.sl-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => cancelConfirm(btn.dataset.id));
  });

  // ✕ 삭제
  document.querySelectorAll('.sl-del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const entry = DB.salesLogsGetById(btn.dataset.id);
      if (entry?.status === 'confirmed') {
        showToast('확정된 항목은 먼저 승인을 취소해주세요');
        return;
      }
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
// 확정 로직
// ════════════════════════════════

/** 은행 기록 매칭으로 승인 */
function confirmWithMatch(slId, matchMonth, matchIncomeId, bankAmt) {
  const entry = DB.salesLogsGetById(slId);
  if (!entry) return;

  // finance income에 매출일지 연결 정보 기록
  DB.financeUpdateIncome(matchMonth, matchIncomeId, {
    salesLogId:  slId,
    instructor:  entry.instructor,
    name:        entry.memberName,
    isRenewal:   entry.type === 'renewal',
  });

  // 매출일지 확정
  DB.salesLogsUpdate(slId, {
    status:       'confirmed',
    linkedMonth:  matchMonth,
    linkedId:     matchIncomeId,
    linkedAmount: bankAmt,
  });

  renderSalesLogData();
  showToast(`✅ 승인 완료 — 입금액 ${fmtMoney(bankAmt)} 정산 반영`);
}

/** 수동 확정 (현금 등 은행 기록 없음) — 원금으로 finance income 신규 생성 */
function confirmManual(slId) {
  const entry = DB.salesLogsGetById(slId);
  if (!entry) return;

  const newIncome = DB.financeAddIncome(slMonth, {
    date:       entry.date,
    instructor: entry.instructor,
    name:       entry.memberName,
    amount:     entry.amount,
    payMethod:  entry.payMethod,
    isRenewal:  entry.type === 'renewal',
    source:     'saleslog',
    salesLogId: slId,
  });

  DB.salesLogsUpdate(slId, {
    status:       'confirmed',
    linkedMonth:  slMonth,
    linkedId:     newIncome.id,
    linkedAmount: entry.amount,
  });

  renderSalesLogData();
  showToast(`💵 수동 확정 — ${fmtMoney(entry.amount)} 정산 반영`);
}

/** 승인 취소 — finance 연결 해제 후 pending 복귀 */
function cancelConfirm(slId) {
  const entry = DB.salesLogsGetById(slId);
  if (!entry || entry.status !== 'confirmed') return;

  if (entry.linkedMonth && entry.linkedId) {
    const finData = DB.financeGet(entry.linkedMonth);
    const income  = finData.incomes.find(i => i.id === entry.linkedId);

    if (income) {
      if (income.source === 'saleslog') {
        // 수동 생성 항목 → 완전 삭제
        DB.financeDelIncome(entry.linkedMonth, entry.linkedId);
      } else {
        // 엑셀/기존 항목 → 연결만 해제, 강사/회원명 초기화
        DB.financeUpdateIncome(entry.linkedMonth, entry.linkedId, {
          salesLogId: null,
          instructor:  '',
          name:        '',
          isRenewal:   false,
        });
      }
    }
  }

  DB.salesLogsUpdate(slId, {
    status:       'pending',
    linkedMonth:  null,
    linkedId:     null,
    linkedAmount: null,
  });

  renderSalesLogData();
  showToast('↩️ 승인이 취소되었습니다');
}

// ════════════════════════════════
// 인라인 편집 모드
// ════════════════════════════════
function enterEditMode(row) {
  const id    = row.dataset.id;
  const e     = DB.salesLogsGetById(id);
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
    <td colspan="3" style="white-space:nowrap">
      <button class="fin-edit-save">저장</button>
      <button class="fin-edit-cancel">취소</button>
    </td>`;

  row.querySelector('.fin-edit-save').addEventListener('click', () => {
    const patch = {};
    row.querySelectorAll('[name]').forEach(el => {
      patch[el.name] = el.name === 'amount' ? (parseInt(el.value, 10) || 0) : el.value;
    });
    DB.salesLogsUpdate(id, patch);

    // 확정 상태면 연결된 finance income도 실시간 업데이트
    if (e.status === 'confirmed' && e.linkedMonth && e.linkedId) {
      DB.financeUpdateIncome(e.linkedMonth, e.linkedId, {
        instructor: patch.instructor ?? e.instructor,
        name:       patch.memberName ?? e.memberName,
        isRenewal:  (patch.type ?? e.type) === 'renewal',
      });
    }

    renderSalesLogData();
    showToast('수정했습니다');
  });

  row.querySelector('.fin-edit-cancel').addEventListener('click', () => renderSalesLogData());
}

// ════════════════════════════════
// 이벤트 바인딩 (폼)
// ════════════════════════════════
function bindSalesLogEvents() {
  // 월 이동
  document.getElementById('sl-prev').addEventListener('click', () => {
    const prev = prevMonthKey(slMonth);
    if (!prev) return;
    slMonth = prev;
    renderSalesLogData();
  });
  document.getElementById('sl-next').addEventListener('click', () => {
    slMonth = nextMonthKey(slMonth);
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
      month:        slMonth,
      date,
      instructor:   document.getElementById('sl-inst').value,
      memberName:   document.getElementById('sl-member').value.trim(),
      amount,
      type:         slType,
      payMethod:    document.getElementById('sl-pay').value,
      status:       'pending',
      linkedMonth:  null,
      linkedId:     null,
      linkedAmount: null,
    });

    document.getElementById('sl-amount').value = '';
    document.getElementById('sl-member').value = '';
    renderSalesLogData();
    showToast('매출을 등록했습니다');
  });
}
