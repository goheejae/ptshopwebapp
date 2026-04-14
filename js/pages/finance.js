/**
 * js/pages/finance.js — 결산 시스템 페이지
 *
 * 역할: 고희재·이건우의 월간 수입/지출을 기록하고
 *       정산 수식에 따라 각자의 최종 수령액을 자동으로 계산합니다.
 *
 * 정산 수식:
 *   순수익 = 본인매출 - 공용지출×0.5 - 상대방사비×0.5 + 본인사비×0.5 + 보정액
 *
 * 사용법: import { renderFinance } from './pages/finance.js';
 */

import DB from '../db.js';
import { showToast, escHtml, fmtMoney } from '../utils.js';

// ── 모듈 레벨 상태 ──

/** 현재 보고 있는 월: 'YYYY-MM' 형식 */
let finMonth = new Date().toISOString().slice(0, 7);

// ════════════════════════════════
// SettlementManager — 정산 로직 전담 객체
// ════════════════════════════════
/**
 * 수입/지출 데이터 조작과 정산 계산을 담당합니다.
 * 외부 데이터(엑셀 등)를 추가할 때도 addEntry()만 호출하면 됩니다.
 */
const SettlementManager = {

  /** 현재 월 데이터를 DB에서 가져옵니다. */
  getMonthData() {
    return DB.financeGet(finMonth);
  },

  /** 현재 월 데이터를 DB에 저장합니다. */
  saveMonthData(d) {
    DB.financeSet(finMonth, d);
  },

  /**
   * 수입 또는 지출 항목을 추가합니다.
   * 수동 입력이든 외부 데이터 유입이든 이 메서드를 통합니다.
   *
   * @param {'income'|'expense'} type
   * @param {object} fields - 항목 데이터 (source 미지정 시 'manual'로 자동 설정)
   * @returns {object} 저장된 레코드
   */
  addEntry(type, fields) {
    const d = this.getMonthData();
    const record = {
      id:        Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      createdAt: new Date().toISOString(),
      source:    'manual', // 엑셀 업로드 시 'excel' | 'auto' 로 덮어씁니다
      ...fields,
    };
    if (type === 'income')  d.incomes.push(record);
    if (type === 'expense') d.expenses.push(record);
    this.saveMonthData(d);
    return record;
  },

  /**
   * 수입 또는 지출 항목을 삭제합니다.
   * @param {'income'|'expense'} type
   * @param {string} id
   */
  deleteEntry(type, id) {
    const d = this.getMonthData();
    if (type === 'income')  d.incomes  = d.incomes.filter(r => r.id !== id);
    if (type === 'expense') d.expenses = d.expenses.filter(r => r.id !== id);
    this.saveMonthData(d);
  },

  /**
   * 특정 항목을 부분 업데이트합니다 (인라인 편집 저장에 사용).
   * @param {'income'|'expense'} type
   * @param {string} id
   * @param {object} patch
   */
  updateEntry(type, id, patch) {
    const d   = this.getMonthData();
    const arr = type === 'income' ? d.incomes : d.expenses;
    const idx = arr.findIndex(r => r.id === id);
    if (idx !== -1) arr[idx] = { ...arr[idx], ...patch };
    this.saveMonthData(d);
  },

  /**
   * 특정 강사의 최종 정산액을 계산합니다.
   *
   * 공식: 순수익 = 본인매출 - 공용지출×0.5 - 상대방사비×0.5 + 본인사비×0.5 + 보정액
   *
   * @param {'ko'|'lee'} inst     - 계산할 강사 ID
   * @param {Array}      incomes  - 해당 월 수입 배열
   * @param {Array}      expenses - 해당 월 지출 배열
   * @param {object}     adj      - 보정액 { ko: {amount, reason}, lee: {amount, reason} }
   * @returns {{ myIncome, sharedExp, otherExp, myExp, adjAmt, base, final }}
   */
  calcSettlement(inst, incomes, expenses, adj) {
    const other = inst === 'ko' ? 'lee' : 'ko';

    const myIncome  = incomes.filter(r => r.instructor === inst).reduce((s, r) => s + r.amount, 0);
    const sharedExp = expenses.filter(r => r.payer === 'shared').reduce((s, r) => s + r.amount, 0);
    const otherExp  = expenses.filter(r => r.payer === other).reduce((s, r) => s + r.amount, 0);
    const myExp     = expenses.filter(r => r.payer === inst).reduce((s, r) => s + r.amount, 0);
    const adjAmt    = Number(adj[inst]?.amount) || 0;
    const base      = myIncome - sharedExp * 0.5 - otherExp * 0.5 + myExp * 0.5;

    return { myIncome, sharedExp, otherExp, myExp, adjAmt, base, final: base + adjAmt };
  },

  /**
   * 수동 보정액을 저장합니다.
   * @param {'ko'|'lee'} inst
   * @param {number}     amount
   * @param {string}     reason
   */
  saveAdjustment(inst, amount, reason) {
    const d = this.getMonthData();
    if (!d.adjustments) d.adjustments = { ko: { amount: 0, reason: '' }, lee: { amount: 0, reason: '' } };
    d.adjustments[inst] = { amount, reason };
    this.saveMonthData(d);
  },
};

// ════════════════════════════════
// 메인 렌더 함수
// ════════════════════════════════

/**
 * 결산 시스템 페이지를 #page-content에 그립니다.
 * 수입 테이블, 지출 테이블, 결산 리포트를 포함합니다.
 */
export function renderFinance() {
  const pageContent = document.getElementById('page-content');

  pageContent.innerHTML = `
    <div class="page-header"><h1>💰 결산 시스템</h1></div>

    <!-- 월 이동 네비게이션 -->
    <div class="fin-nav">
      <button class="fin-nav-btn" id="fin-prev">‹</button>
      <div class="fin-month-label" id="fin-month-label"></div>
      <button class="fin-nav-btn" id="fin-next">›</button>
    </div>

    <!-- 수입 내역 섹션 -->
    <div class="fin-section">
      <div class="fin-section-header-row">
        <span>💵 수입 내역</span>
        <button class="fin-import-btn" disabled title="추후 엑셀/통장 내역 업로드 기능 연동 예정">
          📥 외부 데이터 가져오기 (준비 중)
        </button>
      </div>
      <div class="fin-form">
        <div class="fin-form-field">
          <label>날짜</label>
          <input type="date" id="fi-date" class="fin-input" />
        </div>
        <div class="fin-form-field">
          <label>강사</label>
          <select id="fi-inst" class="fin-input">
            <option value="ko">고희재</option>
            <option value="lee">이건우</option>
          </select>
        </div>
        <div class="fin-form-field">
          <label>회원명</label>
          <input type="text" id="fi-name" class="fin-input" placeholder="홍길동" style="width:100px" />
        </div>
        <div class="fin-form-field">
          <label>금액 (원)</label>
          <input type="number" id="fi-amount" class="fin-input" placeholder="0" style="width:120px" min="0" />
        </div>
        <div class="fin-form-field">
          <label>결제수단</label>
          <select id="fi-pay" class="fin-input">
            <option value="card">카드</option>
            <option value="transfer">계좌이체</option>
          </select>
        </div>
        <button class="btn btn-export" id="fi-add-btn">+ 추가</button>
      </div>
      <div class="fin-table-wrap">
        <table class="fin-table">
          <thead><tr>
            <th>날짜</th><th>강사</th><th>회원명</th><th>금액</th><th>결제수단</th><th></th>
          </tr></thead>
          <tbody id="fi-tbody"></tbody>
          <tfoot><tr>
            <td colspan="3" style="text-align:right;font-size:12px;color:var(--text-muted)">합계</td>
            <td colspan="3" id="fi-total"></td>
          </tr></tfoot>
        </table>
      </div>
    </div>

    <!-- 지출 내역 섹션 -->
    <div class="fin-section">
      <div class="fin-section-header-row">
        <span>💸 지출 내역</span>
        <button class="fin-import-btn" disabled title="추후 엑셀/통장 내역 업로드 기능 연동 예정">
          📥 외부 데이터 가져오기 (준비 중)
        </button>
      </div>
      <div class="fin-form">
        <div class="fin-form-field">
          <label>날짜</label>
          <input type="date" id="fe-date" class="fin-input" />
        </div>
        <div class="fin-form-field">
          <label>내용</label>
          <input type="text" id="fe-content" class="fin-input" placeholder="운동용품 구매" style="width:160px" />
        </div>
        <div class="fin-form-field">
          <label>금액 (원)</label>
          <input type="number" id="fe-amount" class="fin-input" placeholder="0" style="width:120px" min="0" />
        </div>
        <div class="fin-form-field">
          <label>결제자</label>
          <select id="fe-payer" class="fin-input">
            <option value="shared">공용</option>
            <option value="ko">고희재 사비</option>
            <option value="lee">이건우 사비</option>
          </select>
        </div>
        <button class="btn btn-export" id="fe-add-btn">+ 추가</button>
      </div>
      <div class="fin-table-wrap">
        <table class="fin-table">
          <thead><tr>
            <th>날짜</th><th>내용</th><th>금액</th><th>결제자</th><th></th>
          </tr></thead>
          <tbody id="fe-tbody"></tbody>
          <tfoot><tr>
            <td colspan="2" style="text-align:right;font-size:12px;color:var(--text-muted)">합계</td>
            <td colspan="3" id="fe-total"></td>
          </tr></tfoot>
        </table>
      </div>
    </div>

    <!-- 결산 리포트 섹션 -->
    <div class="fin-report-section">
      <div class="fin-report-title">
        📊 월말 결산 리포트 — <span id="fin-report-month"></span>
      </div>
      <div class="fin-report-grid" id="fin-report-grid"></div>
    </div>
  `;

  bindFinanceEvents();
  renderFinanceData(); // 폼을 그린 직후 데이터도 바로 채워줍니다
}

// ════════════════════════════════
// 데이터 렌더 함수 (월 변경 시마다 호출)
// ════════════════════════════════

/**
 * 현재 월(finMonth)의 수입/지출 테이블과 결산 리포트를 업데이트합니다.
 */
function renderFinanceData() {
  const data     = SettlementManager.getMonthData();
  const incomes  = data.incomes  || [];
  const expenses = data.expenses || [];
  const adj      = data.adjustments || {
    ko:  { amount: 0, reason: '' },
    lee: { amount: 0, reason: '' },
  };

  // 월 레이블 업데이트: "2026년 4월"
  const [y, m] = finMonth.split('-');
  document.getElementById('fin-month-label').textContent  = `${y}년 ${parseInt(m)}월`;
  document.getElementById('fin-report-month').textContent = `${y}년 ${parseInt(m)}월`;

  // ── 헬퍼: 필드가 비어있으면 [입력 필요] 배지를 반환합니다 ──
  function reqBadge(val, field, type, id) {
    if (val && val.toString().trim()) return escHtml(val);
    return `<span class="badge-required" data-edit="${field}" data-type="${type}" data-id="${id}">입력 필요</span>`;
  }
  function reqBadgeSelect(val, field, type, id, renderFn) {
    if (val && val.toString().trim()) return renderFn(val);
    return `<span class="badge-required" data-edit="${field}" data-type="${type}" data-id="${id}">입력 필요</span>`;
  }

  // ── 수입 테이블 채우기 ──
  document.getElementById('fi-tbody').innerHTML = incomes.length === 0
    ? '<tr class="fin-empty-row"><td colspan="6">등록된 수입이 없습니다</td></tr>'
    : incomes.map(r => {
        const instCell = reqBadgeSelect(r.instructor, 'instructor', 'income', r.id,
          v => `<span class="badge-${v}">${v === 'ko' ? '고희재' : '이건우'}</span>`);
        const nameCell = reqBadge(r.name, 'name', 'income', r.id);
        const srcTag   = r.source && r.source !== 'manual'
          ? ` <span style="font-size:10px;color:var(--text-muted)">[${r.source}]</span>` : '';
        return `
        <tr>
          <td>${r.date}${srcTag}</td>
          <td>${instCell}</td>
          <td>${nameCell}</td>
          <td style="font-weight:600">${fmtMoney(r.amount)}</td>
          <td>${r.payMethod === 'card' ? '카드' : '계좌이체'}</td>
          <td><button class="fin-del" data-type="income" data-id="${r.id}">✕</button></td>
        </tr>`;
      }).join('');

  document.getElementById('fi-total').innerHTML =
    `<strong>${fmtMoney(incomes.reduce((s, r) => s + r.amount, 0))}</strong>`;

  // ── 지출 테이블 채우기 ──
  document.getElementById('fe-tbody').innerHTML = expenses.length === 0
    ? '<tr class="fin-empty-row"><td colspan="5">등록된 지출이 없습니다</td></tr>'
    : expenses.map(r => {
        const payLabel    = r.payer === 'shared' ? '공용' : r.payer === 'ko' ? '고희재 사비' : '이건우 사비';
        const badgeCls    = r.payer === 'shared' ? 'badge-shared' : `badge-${r.payer}`;
        const contentCell = reqBadge(r.content, 'content', 'expense', r.id);
        const payerCell   = reqBadgeSelect(r.payer, 'payer', 'expense', r.id,
          () => `<span class="${badgeCls}">${payLabel}</span>`);
        const srcTag = r.source && r.source !== 'manual'
          ? ` <span style="font-size:10px;color:var(--text-muted)">[${r.source}]</span>` : '';
        return `
        <tr>
          <td>${r.date}${srcTag}</td>
          <td>${contentCell}</td>
          <td style="font-weight:600">${fmtMoney(r.amount)}</td>
          <td>${payerCell}</td>
          <td><button class="fin-del" data-type="expense" data-id="${r.id}">✕</button></td>
        </tr>`;
      }).join('');

  document.getElementById('fe-total').innerHTML =
    `<strong>${fmtMoney(expenses.reduce((s, r) => s + r.amount, 0))}</strong>`;

  // ── 삭제 버튼 이벤트 바인딩 ──
  document.querySelectorAll('.fin-del').forEach(btn => {
    btn.addEventListener('click', () => {
      SettlementManager.deleteEntry(btn.dataset.type, btn.dataset.id);
      renderFinanceData();
      showToast('삭제했습니다');
    });
  });

  // ── [입력 필요] 배지 클릭 → 인라인 편집 활성화 ──
  document.querySelectorAll('.badge-required').forEach(badge => {
    badge.addEventListener('click', function () {
      const { edit: field, type, id } = this.dataset;
      const td = this.parentElement;

      let inputHtml;
      if (field === 'instructor') {
        inputHtml = `
          <select class="fin-inline-input" data-field="${field}" data-type="${type}" data-id="${id}">
            <option value="">-- 선택 --</option>
            <option value="ko">고희재</option>
            <option value="lee">이건우</option>
          </select>`;
      } else if (field === 'payer') {
        inputHtml = `
          <select class="fin-inline-input" data-field="${field}" data-type="${type}" data-id="${id}">
            <option value="">-- 선택 --</option>
            <option value="shared">공용</option>
            <option value="ko">고희재 사비</option>
            <option value="lee">이건우 사비</option>
          </select>`;
      } else {
        inputHtml = `
          <input class="fin-inline-input" type="text"
            data-field="${field}" data-type="${type}" data-id="${id}" placeholder="입력..." />`;
      }

      td.innerHTML = `
        <div class="fin-inline-edit">
          ${inputHtml}
          <button class="fin-inline-save" data-field="${field}" data-type="${type}" data-id="${id}">저장</button>
        </div>`;
      td.querySelector('.fin-inline-input').focus();

      td.querySelector('.fin-inline-save').addEventListener('click', function () {
        const val = td.querySelector('.fin-inline-input').value.trim();
        if (!val) { showToast('값을 입력해주세요'); return; }
        SettlementManager.updateEntry(this.dataset.type, this.dataset.id, { [this.dataset.field]: val });
        renderFinanceData();
      });
    });
  });

  // ── 결산 리포트 렌더링 ──
  renderFinanceReport(incomes, expenses, adj);
}

// ════════════════════════════════
// 결산 리포트 렌더 함수
// ════════════════════════════════

/**
 * 강사별 정산 카드를 그립니다.
 * 보정액 입력 시 실시간으로 최종 수령액을 업데이트합니다.
 */
function renderFinanceReport(incomes, expenses, adj) {
  const grid = document.getElementById('fin-report-grid');
  if (!grid) return;

  grid.innerHTML = ['ko', 'lee'].map(inst => {
    const name      = inst === 'ko' ? '고희재' : '이건우';
    const other     = inst === 'ko' ? '이건우' : '고희재';
    const s         = SettlementManager.calcSettlement(inst, incomes, expenses, adj);
    const adjAmt    = adj[inst]?.amount || 0;
    const adjReason = adj[inst]?.reason || '';
    const finalCls  = s.final >= 0 ? 'plus' : 'minus';

    return `
      <div class="fin-report-card">
        <div class="fin-report-name">${name}</div>
        <div class="fin-report-row">
          <span class="fin-report-label">총 매출</span>
          <span class="fin-report-val">${fmtMoney(s.myIncome)}</span>
        </div>
        <div class="fin-report-row">
          <span class="fin-report-label">공용 지출 50% 차감</span>
          <span class="fin-report-val minus">− ${fmtMoney(s.sharedExp * 0.5)}</span>
        </div>
        <div class="fin-report-row">
          <span class="fin-report-label">${other} 사비 50% 차감</span>
          <span class="fin-report-val minus">− ${fmtMoney(s.otherExp * 0.5)}</span>
        </div>
        <div class="fin-report-row">
          <span class="fin-report-label">본인 사비 50% 보전</span>
          <span class="fin-report-val plus">+ ${fmtMoney(s.myExp * 0.5)}</span>
        </div>
        <div class="fin-divider"></div>
        <div class="fin-report-row">
          <span class="fin-report-label">기본 정산</span>
          <span class="fin-report-val">${fmtMoney(s.base)}</span>
        </div>
        <div style="padding:8px 0 4px">
          <div class="fin-adj-label">수동 보정</div>
          <div class="fin-adj-inputs">
            <input type="number" class="fin-adj-amount" data-inst="${inst}"
              placeholder="±금액" value="${adjAmt || ''}" />
            <input type="text" class="fin-adj-reason" data-inst="${inst}"
              placeholder="보정 사유" value="${escHtml(adjReason)}" />
          </div>
        </div>
        <div class="fin-divider"></div>
        <div class="fin-final-row">
          <span class="fin-final-label">최종 수령액</span>
          <span class="fin-final-val ${finalCls}" id="fin-final-${inst}">${fmtMoney(s.final)}</span>
        </div>
      </div>`;
  }).join('');

  // ── 보정액 입력 시 최종 수령액을 실시간으로 업데이트 ──
  document.querySelectorAll('.fin-adj-amount, .fin-adj-reason').forEach(el => {
    el.addEventListener('input', () => {
      const inst     = el.dataset.inst;
      const amtEl    = document.querySelector(`.fin-adj-amount[data-inst="${inst}"]`);
      const reasonEl = document.querySelector(`.fin-adj-reason[data-inst="${inst}"]`);

      SettlementManager.saveAdjustment(inst, parseFloat(amtEl.value) || 0, reasonEl.value);

      // 저장 후 최종 수령액 span만 교체합니다 (전체 재렌더 없음)
      const d    = SettlementManager.getMonthData();
      const s    = SettlementManager.calcSettlement(inst, d.incomes || [], d.expenses || [], d.adjustments);
      const span = document.getElementById(`fin-final-${inst}`);
      if (span) {
        span.textContent = fmtMoney(s.final);
        span.className   = `fin-final-val ${s.final >= 0 ? 'plus' : 'minus'}`;
      }
    });
  });
}

// ════════════════════════════════
// 이벤트 바인딩
// ════════════════════════════════

/**
 * 결산 페이지의 이벤트 리스너를 등록합니다.
 * renderFinance() 마지막에 호출됩니다.
 */
function bindFinanceEvents() {
  // 날짜 입력 기본값을 오늘로 설정합니다
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('fi-date').value = today;
  document.getElementById('fe-date').value = today;

  // ── 월 이동 버튼 ──
  document.getElementById('fin-prev').addEventListener('click', () => {
    const d = new Date(finMonth + '-01');
    d.setMonth(d.getMonth() - 1);
    finMonth = d.toISOString().slice(0, 7);
    renderFinanceData();
  });
  document.getElementById('fin-next').addEventListener('click', () => {
    const d = new Date(finMonth + '-01');
    d.setMonth(d.getMonth() + 1);
    finMonth = d.toISOString().slice(0, 7);
    renderFinanceData();
  });

  // ── 수입 추가 ──
  document.getElementById('fi-add-btn').addEventListener('click', () => {
    const date   = document.getElementById('fi-date').value;
    const amount = parseInt(document.getElementById('fi-amount').value) || 0;
    if (!date || !amount) { showToast('날짜와 금액을 입력하세요'); return; }

    SettlementManager.addEntry('income', {
      date,
      instructor: document.getElementById('fi-inst').value,
      name:       document.getElementById('fi-name').value.trim(),
      amount,
      payMethod:  document.getElementById('fi-pay').value,
    });

    document.getElementById('fi-amount').value = '';
    document.getElementById('fi-name').value   = '';
    renderFinanceData();
    showToast('수입을 추가했습니다');
  });

  // ── 지출 추가 ──
  document.getElementById('fe-add-btn').addEventListener('click', () => {
    const date   = document.getElementById('fe-date').value;
    const amount = parseInt(document.getElementById('fe-amount').value) || 0;
    if (!date || !amount) { showToast('날짜와 금액을 입력하세요'); return; }

    SettlementManager.addEntry('expense', {
      date,
      content: document.getElementById('fe-content').value.trim(),
      amount,
      payer:   document.getElementById('fe-payer').value,
    });

    document.getElementById('fe-amount').value  = '';
    document.getElementById('fe-content').value = '';
    renderFinanceData();
    showToast('지출을 추가했습니다');
  });
}
