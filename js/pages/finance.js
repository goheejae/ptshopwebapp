/**
 * js/pages/finance.js — 결산 시스템 페이지 v3
 *
 * 정산 수식:
 *   수령액 = 본인매출(재등록 제외) + 본인개인지출×0.5 − 상대방개인지출×0.5 − 공용지출합계×0.5
 *
 * 기간 정책:
 *   2025-11 ~ 2026-03 → 통합 세션 (LEGACY_KEY) — 그 이전 이동 불가
 *   2026-04~          → 정상 월 단위
 *
 * 엑셀 업로드:
 *   SheetJS(XLSX) 사용 — 입금 열 → 매출, 출금 열 → 공용지출로 자동 분류
 *   현재 finMonth 경로에 저장 (실제 날짜 무관)
 *
 * 렌더링:
 *   모든 리스트는 항상 날짜 오름차순으로 정렬
 */

import DB from '../db.js';
import { showToast, escHtml, fmtMoney } from '../utils.js';

// ── Google Vision API 키 ──
const GOOGLE_VISION_API_KEY = 'AIzaSyBGf8Y7Y_qnRez6PvEIfKuGE0zA8kjoLZA';

// ── 상수 ──
const LEGACY_KEY   = '2025-11~03';
const LEGACY_LABEL = '2025년 11월 ~ 2026년 3월 (통합)';
const FIRST_NORMAL = '2026-04';

// ── 모듈 레벨 상태 ──
let finMonth        = new Date().toISOString().slice(0, 7);
let incomeIsRenewal = false;    // 매출 입력 폼 토글
let feIsAuto        = false;    // 공용지출 폼이 OCR로 채워졌는지
let fpIsAuto        = false;    // 개인지출 폼이 OCR로 채워졌는지
let fiIsAuto        = false;    // 매출 폼이 OCR로 채워졌는지
let lastExcelKey    = null;     // 중복 업로드 방지 — "파일명::크기"

if (finMonth < FIRST_NORMAL) finMonth = LEGACY_KEY;

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
function genId()    { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/** 날짜 문자열 기준 오름차순 정렬 (복사본 반환) */
function sortByDate(arr) {
  return [...arr].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/**
 * 할부 결제를 월별로 분산하여 각 월의 finance 데이터에 저장합니다.
 * FIRST_NORMAL(2026-04) 이전 회차는 하나로 합산해 LEGACY_KEY에 저장합니다.
 *
 * @param {string} startDate  - 시작 날짜 'YYYY-MM-DD'
 * @param {number} monthlyAmt - 월 할부 금액 (Math.round(총금액 / 개월수))
 * @param {number} total      - 총 할부 개월 수
 * @param {object} base       - 공통 필드 (instructor, name, payMethod, isRenewal, isAuto 등)
 */
function distributeInstallment(startDate, monthlyAmt, total, base) {
  const groupId = genId();
  const sd = new Date(startDate);

  const items = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(sd);
    d.setMonth(d.getMonth() + i);
    const y   = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    items.push({ no: i + 1, monthKey: `${y}-${mo}`, date: `${y}-${mo}-${day}` });
  }

  // LEGACY: 2026-04 이전 회차는 통합 기간에 합산
  const legacyItems = items.filter(it => it.monthKey < FIRST_NORMAL);
  const normalItems = items.filter(it => it.monthKey >= FIRST_NORMAL);

  if (legacyItems.length > 0) {
    DB.financeAddIncome(LEGACY_KEY, {
      ...base,
      date:               legacyItems[0].date,
      amount:             legacyItems.length * monthlyAmt,
      isInstallment:      true,
      installTotal:       total,
      installLegacyCount: legacyItems.length,
      installGroupId:     groupId,
    });
  }

  normalItems.forEach(item => {
    DB.financeAddIncome(item.monthKey, {
      ...base,
      date:           item.date,
      amount:         monthlyAmt,
      isInstallment:  true,
      installTotal:   total,
      installNo:      item.no,
      installGroupId: groupId,
    });
  });

  fiIsAuto = false;
}

/**
 * 할부 지출을 월별로 분산하여 저장합니다.
 * 통합 기간(LEGACY_KEY) 이전/내 회차는 하나로 합산합니다.
 *
 * @param {string} startDate  - 시작 날짜 'YYYY-MM-DD'
 * @param {number} monthlyAmt - 월 할부 금액
 * @param {number} total      - 총 할부 개월 수
 * @param {object} base       - 공통 필드 (content, payer, isAuto 등)
 * @param {'shared'|'private'} section
 */
function distributeExpenseInstallment(startDate, monthlyAmt, total, base, section) {
  const groupId = genId();
  const sd = new Date(startDate);
  const addFn = section === 'private'
    ? DB.financeAddPrivateExpense.bind(DB)
    : DB.financeAddExpense.bind(DB);

  const items = [];
  for (let i = 0; i < total; i++) {
    const d   = new Date(sd);
    d.setMonth(d.getMonth() + i);
    const y   = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    items.push({ no: i + 1, monthKey: `${y}-${mo}`, date: `${y}-${mo}-${day}` });
  }

  const legacyItems = items.filter(it => it.monthKey < FIRST_NORMAL);
  const normalItems = items.filter(it => it.monthKey >= FIRST_NORMAL);

  // 레거시 기간 회차는 합산하지 않고 각각 LEGACY_KEY에 개별 저장
  // → LEGACY 뷰에서 11월/12월/1월/2월/3월 회차가 각각 표시됨
  legacyItems.forEach(item => {
    addFn(LEGACY_KEY, {
      ...base,
      date:           item.date,
      amount:         monthlyAmt,
      isInstallment:  true,
      installTotal:   total,
      installNo:      item.no,
      installGroupId: groupId,
    });
  });

  normalItems.forEach(item => {
    addFn(item.monthKey, {
      ...base,
      date:           item.date,
      amount:         monthlyAmt,
      isInstallment:  true,
      installTotal:   total,
      installNo:      item.no,
      installGroupId: groupId,
    });
  });
}

/**
 * 같은 installGroupId를 가진 이후 회차(installNo >= fromInstallNo)의
 * 결제자(payer)를 일괄 변경합니다. (개인지출 한정)
 */
function cascadeInstallmentPayer(installGroupId, fromInstallNo, newPayer) {
  const finance = DB._d.finance || {};
  Object.keys(finance).forEach(monthKey => {
    const d = DB.financeGet(monthKey);
    let changed = false;
    d.privateExpenses = d.privateExpenses.map(e => {
      if (e.installGroupId === installGroupId && e.installNo >= fromInstallNo) {
        changed = true;
        return { ...e, payer: newPayer };
      }
      return e;
    });
    if (changed) DB.financeSet(monthKey, d);
  });
}

// ════════════════════════════════
// SettlementManager
// ════════════════════════════════
const SM = {
  get()   { return DB.financeGet(finMonth); },
  save(d) { DB.financeSet(finMonth, d); },

  addIncome(fields) {
    const d = this.get();
    d.incomes.push({ id: genId(), createdAt: new Date().toISOString(), ...fields });
    this.save(d);
  },
  addShared(fields) {
    const d = this.get();
    d.expenses.push({ id: genId(), createdAt: new Date().toISOString(), ...fields });
    this.save(d);
  },
  addPrivate(fields) {
    const d = this.get();
    d.privateExpenses.push({ id: genId(), createdAt: new Date().toISOString(), ...fields });
    this.save(d);
  },

  del(section, id) {
    const d = this.get();
    const key = section === 'income' ? 'incomes' : section === 'shared' ? 'expenses' : 'privateExpenses';
    d[key] = d[key].filter(r => r.id !== id);
    this.save(d);
  },

  update(section, id, patch) {
    const d = this.get();
    const key = section === 'income' ? 'incomes' : section === 'shared' ? 'expenses' : 'privateExpenses';
    const i = d[key].findIndex(r => r.id === id);
    if (i !== -1) d[key][i] = { ...d[key][i], ...patch };
    this.save(d);
  },

  // 구형(단일 객체) → 배열 정규화
  _normalizeAdjs(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    // 구형: { amount, note }
    return (raw.amount || raw.note) ? [{ id: 'legacy', amount: raw.amount || 0, note: raw.note || '' }] : [];
  },

  calc(inst, data) {
    const other        = inst === 'ko' ? 'lee' : 'ko';
    const myIncome     = data.incomes.filter(r => r.instructor === inst && !r.isRenewal).reduce((s, r) => s + r.amount, 0);
    const renewalAmt   = data.incomes.filter(r => r.instructor === inst &&  r.isRenewal).reduce((s, r) => s + r.amount, 0);
    const sharedTotal  = data.expenses.reduce((s, r) => s + r.amount, 0);
    const myPrivate    = data.privateExpenses.filter(r => r.payer === inst).reduce((s, r) => s + r.amount, 0);
    const otherPrivate = data.privateExpenses.filter(r => r.payer === other).reduce((s, r) => s + r.amount, 0);
    const final        = myIncome + myPrivate * 0.5 - otherPrivate * 0.5 - sharedTotal * 0.5;
    const adjItems     = this._normalizeAdjs((data.adjustments || {})[inst]);
    const adjAmt       = adjItems.reduce((s, a) => s + (a.amount || 0), 0);
    return { myIncome, renewalAmt, sharedTotal, myPrivate, otherPrivate, final,
             adjItems, adjAmt, adjustedFinal: final + adjAmt };
  },

  addAdjustment(inst, amount, note) {
    const d = this.get();
    if (!d.adjustments) d.adjustments = {};
    const cur = this._normalizeAdjs(d.adjustments[inst]);
    cur.push({ id: genId(), amount, note });
    d.adjustments[inst] = cur;
    this.save(d);
  },

  delAdjustment(inst, id) {
    const d = this.get();
    if (!d.adjustments) return;
    const cur = this._normalizeAdjs(d.adjustments[inst]);
    d.adjustments[inst] = cur.filter(a => a.id !== id);
    this.save(d);
  },
};

// ════════════════════════════════
// 엑셀 파싱 유틸
// ════════════════════════════════

/**
 * 날짜 값을 'YYYY-MM-DD' 문자열로 정규화합니다.
 * SheetJS cellDates:true 시 Date 객체가 오기도 하고, 문자열로 오기도 합니다.
 */
function normalizeDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // 점·슬래시를 하이픈으로 통일
  const s = String(raw).replace(/[./]/g, '-').trim();
  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  // YYYY-MM-DD (또는 YY-MM-DD)
  const m = s.match(/(\d{2,4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = m[1].length === 2 ? '20' + m[1] : m[1];
    return `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return null;
}

/** 쉼표·원화 기호 등을 제거하고 정수로 변환 */
function parseAmount(val) {
  if (val === '' || val === null || val === undefined) return 0;
  const n = parseInt(String(val).replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

/**
 * 헤더 배열에서 키워드와 부분 일치하는 컬럼명을 찾습니다 (공백 무시, 소문자 비교).
 */
function findCol(headers, ...keywords) {
  return headers.find(h =>
    keywords.some(kw => h.replace(/\s/g, '').toLowerCase().includes(kw.toLowerCase()))
  ) || null;
}

/**
 * 엑셀 파일을 파싱하여 현재 finMonth에 즉시 저장합니다.
 * 입금 열이 있는 행 → 매출(income)
 * 출금 열이 있는 행 → 공용지출(shared expense)
 */
function handleExcelUpload(file) {
  if (typeof XLSX === 'undefined') {
    showToast('⚠️ SheetJS 라이브러리가 로드되지 않았습니다');
    return;
  }

  // 중복 업로드 방지 (파일명 + 크기가 같으면 거부)
  const fileKey = `${file.name}::${file.size}`;
  if (lastExcelKey === fileKey) {
    showToast('이미 업로드한 파일입니다 (중복 방지)');
    document.getElementById('fin-excel-input').value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      // type:'array' 는 BIFF(.xls) · OOXML(.xlsx) · CSV · HTML 위장 .xls 까지 모두 자동 판별합니다.
      const wb     = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
      const ws     = wb.Sheets[wb.SheetNames[0]];
      // header:1 → 배열의 배열로 받아서 헤더 행을 직접 탐색합니다.
      // (한국 은행 거래내역은 1~5행에 "거래내역조회", "조회기간: …" 같은 안내 행이 깔려 있고
      //  그 아래에 진짜 헤더가 있는 경우가 많아 첫 행을 헤더로 쓰면 컬럼을 못 찾습니다.)
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!matrix.length) { showToast('엑셀에 데이터가 없습니다'); return; }

      // 날짜 + (입금 또는 출금) 키워드를 모두 가진 첫 행 = 진짜 헤더
      const isHeaderRow = arr => {
        const cells = arr.map(c => String(c ?? '').replace(/\s/g, '').toLowerCase());
        const hasDate = cells.some(c => /날짜|거래일|일자|date/.test(c));
        const hasIO   = cells.some(c => c.includes('입금')) || cells.some(c => c.includes('출금'));
        return hasDate && hasIO;
      };
      const headerIdx = matrix.findIndex(isHeaderRow);
      if (headerIdx < 0) {
        console.warn('[엑셀] 헤더 후보 행 미검출 — 상위 10행:', matrix.slice(0, 10));
        showToast('헤더 행을 찾을 수 없습니다 (날짜 + 입금/출금 컬럼 필요)');
        return;
      }

      const headers = matrix[headerIdx].map(h => String(h ?? '').trim());
      // 헤더 다음 행부터 데이터로 간주, 객체 배열로 변환
      const rows = matrix.slice(headerIdx + 1).map(arr => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = arr[i] ?? ''; });
        return obj;
      });

      const dateCol    = findCol(headers, '날짜', '거래일', '일자', 'date');
      const incomeCol  = findCol(headers, '입금');
      const expenseCol = findCol(headers, '출금');
      const descCol    = findCol(headers, '적요', '거래내용', '내용', '메모', 'desc');

      if (!dateCol) {
        showToast('날짜 컬럼을 찾을 수 없습니다 (날짜 / 거래일 / 일자)');
        return;
      }
      if (!incomeCol && !expenseCol) {
        showToast('입금·출금 컬럼을 찾을 수 없습니다');
        return;
      }

      // ── 기존 데이터 고유키(지문) 수집 ──
      // 형식: "I::날짜::금액" (매출) / "E::날짜::항목::금액" (공용지출)
      const existing = SM.get();
      const existingKeys = new Set([
        ...existing.incomes.map(r => `I::${r.date}::${r.amount}`),
        ...existing.expenses.map(r => `E::${r.date}::${r.content || ''}::${r.amount}`),
      ]);

      let cntIncome = 0, cntExpense = 0, cntSkip = 0;

      rows.forEach(row => {
        const date = normalizeDate(row[dateCol]);
        if (!date) return;

        if (incomeCol) {
          const amt = parseAmount(row[incomeCol]);
          if (amt > 0) {
            const desc = descCol ? String(row[descCol] || '').trim() : '';
            const key = `I::${date}::${amt}`;
            if (existingKeys.has(key)) { cntSkip++; return; }
            SM.addIncome({
              date, amount: amt,
              instructor: '', name: desc, payMethod: 'transfer',
              isRenewal: false, source: 'excel', isAuto: true,
            });
            existingKeys.add(key);   // 같은 파일 내 중복도 방지
            cntIncome++;
          }
        }
        if (expenseCol) {
          const amt = parseAmount(row[expenseCol]);
          if (amt > 0) {
            const content = descCol ? String(row[descCol] || '').trim() : '';
            const key = `E::${date}::${content}::${amt}`;
            if (existingKeys.has(key)) { cntSkip++; return; }
            SM.addShared({ date, amount: amt, content, source: 'excel', isAuto: true });
            existingKeys.add(key);
            cntExpense++;
          }
        }
      });

      lastExcelKey = fileKey;
      renderFinanceData();

      const added = cntIncome + cntExpense;
      if (added === 0 && cntSkip > 0) {
        showToast(`모든 내역(${cntSkip}건)이 이미 등록되어 있습니다`);
      } else if (cntSkip > 0) {
        showToast(`중복 ${cntSkip}건 제외 — 매출 ${cntIncome}건 · 공용지출 ${cntExpense}건 추가`);
      } else {
        showToast(`업로드 완료 — 매출 ${cntIncome}건 · 공용지출 ${cntExpense}건`);
      }
    } catch (err) {
      console.error('엑셀 파싱 오류:', err);
      showToast(`엑셀 파싱 실패: ${err.message || '알 수 없는 오류'}`);
    }
    // 같은 파일 재업로드도 가능하도록 input 초기화
    document.getElementById('fin-excel-input').value = '';
  };
  reader.onerror = () => {
    showToast('파일 읽기 실패 — 파일이 손상되었거나 접근할 수 없습니다');
    document.getElementById('fin-excel-input').value = '';
  };
  reader.readAsArrayBuffer(file);
}

// ════════════════════════════════
// 영수증 OCR (Google Vision API)
// ════════════════════════════════

/**
 * File → Base64 DataURL 변환 (Promise)
 */
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * OCR 텍스트에서 날짜 · 금액 · 상호명을 추출합니다.
 * @returns {{ date: string|null, amount: number|null, content: string|null }}
 */
function extractReceiptData(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ── 날짜 추출 ──
  let date = null;
  const datePatterns = [
    /(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,   // 2025-11-01 / 2025.11.01
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,       // 2025년 11월 1일
    /(\d{2})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,    // 25-11-01
  ];
  outer: for (const line of lines) {
    for (const pat of datePatterns) {
      const m = line.match(pat);
      if (m) {
        const y = m[1].length === 2 ? '20' + m[1] : m[1];
        date = `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        break outer;
      }
    }
  }

  // ── 금액 추출 ──
  // 1순위: 합계/총액 등 키워드 근처 숫자
  let amount = null;
  const amtKeyword = /합계|총액|총금액|결제금액|받을금액|청구금액|승인금액|total|amount/i;
  for (const line of lines) {
    if (amtKeyword.test(line)) {
      const nums = line.match(/[\d,]+/g);
      if (nums) {
        const n = parseInt(nums[nums.length - 1].replace(/,/g, ''), 10);
        if (!isNaN(n) && n >= 100) { amount = n; break; }
      }
    }
  }
  // 2순위: 텍스트 전체에서 가장 큰 정수 (100 이상)
  if (!amount) {
    const allNums = [...text.matchAll(/[\d,]+/g)]
      .map(m => parseInt(m[0].replace(/,/g, ''), 10))
      .filter(n => !isNaN(n) && n >= 100);
    if (allNums.length) amount = Math.max(...allNums);
  }

  // ── 상호명 추출 ──
  // 첫 번째 의미있는 줄 (숫자로만 이루어지지 않고, 구분선이 아니며, 2자 이상)
  let content = null;
  for (const line of lines) {
    if (line.length < 2)           continue;
    if (/^[\d\s\-.:\/]+$/.test(line)) continue;  // 숫자·구분자만
    if (/^[*\-=|]+$/.test(line))   continue;      // 구분선
    content = line;
    break;
  }

  return { date, amount, content };
}

/**
 * 영수증 이미지를 Google Vision API로 분석하여
 * 지출 입력 폼(`prefix`-date / -amount / -content)을 채웁니다.
 * DB 저장은 하지 않습니다 — 사용자가 확인 후 [추가] 버튼을 눌러야 저장됩니다.
 *
 * @param {File}   file   - 이미지 파일
 * @param {'fi'|'fe'|'fp'} prefix - 매출('fi'), 공용지출('fe'), 개인지출('fp')
 */
async function analyzeReceipt(file, prefix) {
  const btn = document.getElementById(`${prefix}-scan-btn`);
  if (!btn) return;

  const origLabel   = btn.innerHTML;
  btn.innerHTML     = '⏳ 분석 중…';
  btn.disabled      = true;

  try {
    // 이미지 → base64
    const dataUrl  = await toBase64(file);
    const b64      = dataUrl.split(',')[1];

    // Vision API 호출
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image:    { content: b64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
          }],
        }),
      }
    );

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.error?.message || `HTTP ${res.status}`);
    }

    const json     = await res.json();
    const fullText = json.responses?.[0]?.textAnnotations?.[0]?.description || '';

    if (!fullText) {
      showToast('텍스트를 인식하지 못했습니다 — 직접 입력해주세요');
      return;
    }

    const { date, amount, content } = extractReceiptData(fullText);

    if (prefix === 'fi') {
      // 매출 폼 채우기 — date · amount만 적용, 카드 영수증 감지 시 결제수단 자동 세팅
      if (date)   document.getElementById('fi-date').value   = date;
      if (amount) document.getElementById('fi-amount').value = amount;

      const isCard = /카드|신용카드|체크카드|승인번호|VISA|MASTER|AMEX|CARD/i.test(fullText);
      if (isCard) {
        const payEl = document.getElementById('fi-pay');
        if (payEl) payEl.value = 'card';
        const installField = document.getElementById('fi-install-field');
        if (installField) installField.style.display = '';
      }
      if (date || amount) fiIsAuto = true;

      const filled = [date && '날짜', amount && '금액', isCard && '카드 감지'].filter(Boolean);
      showToast(filled.length
        ? `${filled.join(' · ')} 인식 완료 — 할부 개월 확인 후 [추가] 버튼을 누르세요`
        : '인식된 항목이 없습니다 — 직접 입력해주세요');
    } else {
      // 공용지출·개인지출 폼 채우기
      if (date)    document.getElementById(`${prefix}-date`).value    = date;
      if (amount)  document.getElementById(`${prefix}-amount`).value  = amount;
      if (content) document.getElementById(`${prefix}-content`).value = content;

      // 카드 영수증 감지 시 결제수단 자동 세팅 + 할부 필드 표시
      const isCard = /카드|신용카드|체크카드|승인번호|VISA|MASTER|AMEX|CARD/i.test(fullText);
      const payEl  = document.getElementById(`${prefix}-pay`);
      if (payEl && isCard) {
        payEl.value = 'card';
        const installField = document.getElementById(`${prefix}-install-field`);
        if (installField) installField.style.display = '';
      }

      const filled = [date && '날짜', amount && '금액', content && '상호명', isCard && '카드 감지'].filter(Boolean);
      if (filled.length) {
        // OCR로 폼이 채워졌음을 기록 → [추가] 버튼 클릭 시 isAuto: true 저장
        if (prefix === 'fe') feIsAuto = true;
        if (prefix === 'fp') fpIsAuto = true;
      }
      showToast(filled.length
        ? `${filled.join(' · ')} 인식 완료 — 확인 후 [추가] 버튼을 누르세요`
        : '인식된 항목이 없습니다 — 직접 입력해주세요'
      );
    }

  } catch (err) {
    console.error('OCR 오류:', err);
    showToast(`영수증 분석 실패: ${err.message}`);
  } finally {
    btn.innerHTML = origLabel;
    btn.disabled  = false;
    document.getElementById(`${prefix}-scan-input`).value = '';
  }
}

// ════════════════════════════════
// 메인 렌더 함수
// ════════════════════════════════
export function renderFinance() {
  document.getElementById('page-content').innerHTML = `
    <div class="page-header"><h1>💰 결산 시스템</h1></div>

    <!-- 월 이동 네비게이션 -->
    <div class="fin-nav">
      <button class="fin-nav-btn" id="fin-prev">‹</button>
      <div class="fin-month-label" id="fin-month-label"></div>
      <button class="fin-nav-btn" id="fin-next">›</button>
    </div>

    <!-- 엑셀 업로드 바 -->
    <div class="fin-excel-bar">
      <label class="btn btn-export fin-excel-label" for="fin-excel-input">
        📥 통장 내역 엑셀 업로드
      </label>
      <input type="file" id="fin-excel-input" accept=".xlsx,.xls,.csv" style="display:none" />
      <span class="fin-excel-hint">입금 열 → 매출 자동 등록 · 출금 열 → 공용지출 자동 등록 (현재 월에 저장)</span>
    </div>

    <!-- ① 매출 내역 -->
    <div class="fin-section">
      <div class="fin-section-header-row">
        <span>💵 매출 내역</span>
      </div>
      <div class="fin-form">
        <div class="fin-form-field">
          <label>날짜</label>
          <input type="date" id="fi-date" class="fin-input" value="${todayStr()}" />
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
            <option value="transfer">계좌이체</option>
          </select>
        </div>
        <div class="fin-form-field">
          <label>유형</label>
          <div class="fin-type-toggle">
            <button class="fin-toggle-btn active" id="fi-type-new">신규</button>
            <button class="fin-toggle-btn" id="fi-type-renewal">재등록</button>
          </div>
        </div>
        <input type="file" id="fi-scan-input" accept="image/*" capture="environment" style="display:none" />
        <button class="fin-scan-btn" id="fi-scan-btn">📷 영수증 스캔</button>
        <button class="btn btn-export" id="fi-add-btn">+ 추가</button>
      </div>
      <div class="fin-table-wrap">
        <table class="fin-table">
          <thead><tr>
            <th>날짜</th><th>강사</th><th>회원명</th><th>금액</th><th>결제수단</th><th>유형</th><th></th>
          </tr></thead>
          <tbody id="fi-tbody"></tbody>
          <tfoot><tr>
            <td colspan="3" style="text-align:right;font-size:12px;color:var(--text-muted)">정산 포함 합계</td>
            <td colspan="4" id="fi-total"></td>
          </tr></tfoot>
        </table>
      </div>
    </div>

    <!-- ② 공용지출 내역 -->
    <div class="fin-section">
      <div class="fin-section-header-row">
        <span>💸 공용지출 내역</span>
      </div>
      <div class="fin-form">
        <div class="fin-form-field">
          <label>날짜</label>
          <input type="date" id="fe-date" class="fin-input" value="${todayStr()}" />
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
        <div class="fin-form-field">
          <label>결제수단</label>
          <select id="fe-pay" class="fin-input">
            <option value="cash">현금</option>
            <option value="card">카드</option>
            <option value="transfer">계좌이체</option>
          </select>
        </div>
        <div class="fin-form-field" id="fe-install-field" style="display:none">
          <label>할부</label>
          <input type="number" id="fe-install" class="fin-input" value="1" min="1" max="60" style="width:60px" />
          <span style="font-size:11px;color:var(--text-muted)">개월</span>
        </div>
        <input type="file" id="fe-scan-input" accept="image/*" capture="environment" style="display:none" />
        <button class="fin-scan-btn" id="fe-scan-btn">📷 영수증 스캔</button>
        <button class="btn btn-export" id="fe-add-btn">+ 추가</button>
      </div>
      <div class="fin-table-wrap">
        <table class="fin-table">
          <thead><tr><th>날짜</th><th>내용</th><th>금액</th><th>결제수단</th><th>결제자</th><th></th></tr></thead>
          <tbody id="fe-tbody"></tbody>
          <tfoot><tr>
            <td style="text-align:right;font-size:12px;color:var(--text-muted)">합계</td>
            <td></td>
            <td colspan="4" id="fe-total"></td>
          </tr></tfoot>
        </table>
      </div>
    </div>

    <!-- ③ 개인지출 내역 -->
    <div class="fin-section">
      <div class="fin-section-header-row">
        <span>🧾 개인지출 내역 <span style="font-size:11px;color:var(--text-muted);font-weight:400">개인이 결제한 공용 비용 — 상대방이 절반 부담</span></span>
      </div>
      <div class="fin-form">
        <div class="fin-form-field">
          <label>날짜</label>
          <input type="date" id="fp-date" class="fin-input" value="${todayStr()}" />
        </div>
        <div class="fin-form-field">
          <label>내용</label>
          <input type="text" id="fp-content" class="fin-input" placeholder="기구 구매" style="width:160px" />
        </div>
        <div class="fin-form-field">
          <label>금액 (원)</label>
          <input type="number" id="fp-amount" class="fin-input" placeholder="0" style="width:120px" min="0" />
        </div>
        <div class="fin-form-field">
          <label>결제자</label>
          <select id="fp-payer" class="fin-input">
            <option value="ko">고희재</option>
            <option value="lee">이건우</option>
          </select>
        </div>
        <div class="fin-form-field">
          <label>결제수단</label>
          <select id="fp-pay" class="fin-input">
            <option value="cash">현금</option>
            <option value="card">카드</option>
            <option value="transfer">계좌이체</option>
          </select>
        </div>
        <div class="fin-form-field" id="fp-install-field" style="display:none">
          <label>할부</label>
          <input type="number" id="fp-install" class="fin-input" value="1" min="1" max="60" style="width:60px" />
          <span style="font-size:11px;color:var(--text-muted)">개월</span>
        </div>
        <input type="file" id="fp-scan-input" accept="image/*" capture="environment" style="display:none" />
        <button class="fin-scan-btn" id="fp-scan-btn">📷 영수증 스캔</button>
        <button class="btn btn-export" id="fp-add-btn">+ 추가</button>
      </div>
      <div class="fin-table-wrap">
        <table class="fin-table">
          <thead><tr><th>날짜</th><th>내용</th><th>금액</th><th>결제수단</th><th>결제자</th><th></th></tr></thead>
          <tbody id="fp-tbody"></tbody>
          <tfoot><tr>
            <td style="text-align:right;font-size:12px;color:var(--text-muted)">합계</td>
            <td></td>
            <td colspan="4" id="fp-total"></td>
          </tr></tfoot>
        </table>
      </div>
    </div>

    <!-- ④ 최종 보정 -->
    <div class="fin-adjust-section">
      <div class="fin-adjust-title">⚖️ 최종 보정</div>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px">장부에 적기 모호한 항목을 수동으로 조정합니다. 음수 입력 시 차감, 양수 입력 시 가산됩니다.</p>
      <div class="fin-adjust-grid" id="fin-adjust-grid"></div>
    </div>

    <!-- ⑤ 결산 리포트 -->
    <div class="fin-report-section">
      <div class="fin-report-title">
        📊 월말 결산 리포트 — <span id="fin-report-month"></span>
      </div>
      <div class="fin-report-grid" id="fin-report-grid"></div>
    </div>
  `;

  bindFinanceEvents();
  renderFinanceData();
}

// ════════════════════════════════
// 데이터 렌더 (항상 날짜 오름차순 정렬)
// ════════════════════════════════
function renderFinanceData() {
  const data = SM.get();

  // 날짜 오름차순 정렬 (원본 건드리지 않음)
  const incomes         = sortByDate(data.incomes);
  const expenses        = sortByDate(data.expenses);
  const privateExpenses = sortByDate(data.privateExpenses);

  // 월 레이블
  const label = monthLabel(finMonth);
  document.getElementById('fin-month-label').textContent  = label;
  document.getElementById('fin-report-month').textContent = label;

  // prev 버튼 비활성화
  const prevBtn = document.getElementById('fin-prev');
  if (prevBtn) {
    prevBtn.disabled       = (finMonth === LEGACY_KEY);
    prevBtn.style.opacity  = (finMonth === LEGACY_KEY) ? '0.3' : '1';
    prevBtn.style.cursor   = (finMonth === LEGACY_KEY) ? 'not-allowed' : 'pointer';
  }

  // ── 매출 테이블 ──
  const settlableTotal = incomes.filter(r => !r.isRenewal).reduce((s, r) => s + r.amount, 0);
  const srcTag = r => r.source && r.source !== 'manual'
    ? ` <span style="font-size:10px;color:var(--text-muted)">[${escHtml(r.source)}]</span>` : '';

  document.getElementById('fi-tbody').innerHTML = incomes.length === 0
    ? '<tr class="fin-empty-row"><td colspan="7">등록된 매출이 없습니다</td></tr>'
    : incomes.map(r => `
        <tr class="fin-data-row${r.isRenewal ? ' fi-renewal-row' : ''}" data-id="${escHtml(r.id)}" data-section="income" title="클릭하여 수정">
          <td>${r.isAuto ? '<span class="fin-auto-dot" title="자동 입력">●</span>' : ''}${escHtml(r.date)}${srcTag(r)}</td>
          <td>${r.instructor
            ? `<span class="badge-${escHtml(r.instructor)}">${r.instructor === 'ko' ? '고희재' : '이건우'}</span>`
            : '<span style="color:var(--text-muted);font-size:11px">—</span>'}</td>
          <td>${escHtml(r.name || '—')}</td>
          <td style="font-weight:600">${fmtMoney(r.amount)}</td>
          <td>${r.payMethod === 'card' ? '카드' : '계좌이체'}${r.isInstallment ? ` <span class="fin-install-badge">${r.installLegacyCount ? `${r.installLegacyCount}/${r.installTotal}회 합산` : `${r.installNo}/${r.installTotal}`}</span>` : ''}</td>
          <td>
            <button class="fin-type-btn ${r.isRenewal ? 'renewal' : 'new'}"
                    data-id="${escHtml(r.id)}">${r.isRenewal ? '재등록' : '신규'}</button>
          </td>
          <td><button class="fin-del" data-section="income" data-id="${escHtml(r.id)}">✕</button></td>
        </tr>`
    ).join('');

  document.getElementById('fi-total').innerHTML =
    `<strong>${fmtMoney(settlableTotal)}</strong>`
    + ` <span style="font-size:11px;color:var(--text-muted)">(재등록 제외)</span>`;

  // ── 공용지출 테이블 ──
  document.getElementById('fe-tbody').innerHTML = expenses.length === 0
    ? '<tr class="fin-empty-row"><td colspan="6">등록된 공용지출이 없습니다</td></tr>'
    : expenses.map(r => `
        <tr class="fin-data-row" data-id="${escHtml(r.id)}" data-section="shared" title="클릭하여 수정">
          <td>${r.isAuto ? '<span class="fin-auto-dot" title="자동 입력">●</span>' : ''}${escHtml(r.date)}${srcTag(r)}</td>
          <td>${escHtml(r.content || '—')}</td>
          <td style="font-weight:600">${fmtMoney(r.amount)}${r.isInstallment ? ` <span class="fin-install-badge">${r.installLegacyCount ? `${r.installLegacyCount}/${r.installTotal}회 합산` : `${r.installNo}/${r.installTotal}`}</span>` : ''}</td>
          <td>${r.payMethod === 'card' ? '💳 카드' : r.payMethod === 'transfer' ? '🏦 계좌이체' : '💵 현금'}</td>
          <td>${r.payer === 'ko' ? '<span class="badge-ko">고희재</span>' : r.payer === 'lee' ? '<span class="badge-lee">이건우</span>' : '공용'}</td>
          <td><button class="fin-del" data-section="shared" data-id="${escHtml(r.id)}">✕</button></td>
        </tr>`
    ).join('');

  document.getElementById('fe-total').innerHTML =
    `<strong>${fmtMoney(expenses.reduce((s, r) => s + r.amount, 0))}</strong>`;

  // ── 개인지출 테이블 ──
  document.getElementById('fp-tbody').innerHTML = privateExpenses.length === 0
    ? '<tr class="fin-empty-row"><td colspan="5">등록된 개인지출이 없습니다</td></tr>'
    : privateExpenses.map(r => `
        <tr class="fin-data-row" data-id="${escHtml(r.id)}" data-section="private" title="클릭하여 수정">
          <td>${r.isAuto ? '<span class="fin-auto-dot" title="자동 입력">●</span>' : ''}${escHtml(r.date)}</td>
          <td>${escHtml(r.content || '—')}</td>
          <td style="font-weight:600">${fmtMoney(r.amount)}${r.isInstallment ? ` <span class="fin-install-badge">${r.installLegacyCount ? `${r.installLegacyCount}/${r.installTotal}회 합산` : `${r.installNo}/${r.installTotal}`}</span>` : ''}</td>
          <td>${r.payMethod === 'card' ? '💳 카드' : r.payMethod === 'transfer' ? '🏦 계좌이체' : '💵 현금'}</td>
          <td><span class="badge-${escHtml(r.payer)}">${r.payer === 'ko' ? '고희재' : '이건우'}</span></td>
          <td><button class="fin-del" data-section="private" data-id="${escHtml(r.id)}">✕</button></td>
        </tr>`
    ).join('');

  document.getElementById('fp-total').innerHTML =
    `<strong>${fmtMoney(privateExpenses.reduce((s, r) => s + r.amount, 0))}</strong>`;

  // ── 유형 토글 버튼 (매출 행 내) ──
  document.querySelectorAll('.fin-type-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const cur = SM.get().incomes.find(x => x.id === btn.dataset.id);
      if (!cur) return;
      SM.update('income', btn.dataset.id, { isRenewal: !cur.isRenewal });
      renderFinanceData();
    });
  });

  // ── 삭제 버튼 ──
  document.querySelectorAll('.fin-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      SM.del(btn.dataset.section, btn.dataset.id);
      renderFinanceData();
      showToast('삭제했습니다');
    });
  });

  // ── 행 클릭 → 편집 모드 ──
  // 편집 모드 진입 후에는 폼 내부(select/input/저장·취소 버튼) 클릭이 row 까지 버블링되어
  // enterEditMode 가 재호출되면 row.innerHTML 이 다시 그려지면서 열린 드롭다운이 즉시 닫혀버립니다.
  // → row.dataset.editing 플래그로 가드합니다. 플래그는 renderFinanceData() 재렌더 시 자연 소멸.
  document.querySelectorAll('.fin-data-row').forEach(row => {
    row.addEventListener('click', e => {
      if (row.dataset.editing === '1') return;
      if (e.target.closest('.fin-del') || e.target.closest('.fin-type-btn')) return;
      enterEditMode(row);
    });
  });

  // ── 결산 리포트 (정렬된 배열로 계산) ──
  renderReport({ incomes, expenses, privateExpenses, adjustments: data.adjustments || {} });
  renderAdjustmentSection(data);
}

// ════════════════════════════════
// 인라인 편집 모드
// ════════════════════════════════
function enterEditMode(row) {
  const section = row.dataset.section;
  const id      = row.dataset.id;
  const data    = SM.get();
  const key     = section === 'income' ? 'incomes' : section === 'shared' ? 'expenses' : 'privateExpenses';
  const r       = data[key].find(x => x.id === id);
  if (!r) return;

  const actionCells = `
    <td style="white-space:nowrap">
      <button class="fin-edit-save">저장</button>
      <button class="fin-edit-cancel">취소</button>
    </td>`;

  if (section === 'income') {
    row.innerHTML = `
      <td><input class="fin-inline-input" type="date" name="date" value="${escHtml(r.date)}" /></td>
      <td>
        <select class="fin-inline-input" name="instructor">
          <option value=""   ${!r.instructor ? 'selected' : ''}>(미지정)</option>
          <option value="ko"  ${r.instructor === 'ko'  ? 'selected' : ''}>고희재</option>
          <option value="lee" ${r.instructor === 'lee' ? 'selected' : ''}>이건우</option>
        </select>
      </td>
      <td><input class="fin-inline-input" type="text" name="name" value="${escHtml(r.name || '')}" style="width:80px" /></td>
      <td><input class="fin-inline-input" type="number" name="amount" value="${r.amount}" style="width:90px" min="0" /></td>
      <td>
        <select class="fin-inline-input" name="payMethod">
          <option value="transfer" ${r.payMethod !== 'cash' ? 'selected' : ''}>계좌이체</option>
        </select>
      </td>
      <td>
        <select class="fin-inline-input" name="isRenewal">
          <option value="false" ${!r.isRenewal ? 'selected' : ''}>신규</option>
          <option value="true"  ${ r.isRenewal ? 'selected' : ''}>재등록</option>
        </select>
      </td>
      ${actionCells}`;

  } else if (section === 'shared') {
    row.innerHTML = `
      <td><input class="fin-inline-input" type="date" name="date" value="${escHtml(r.date)}" /></td>
      <td><input class="fin-inline-input" type="text" name="content" value="${escHtml(r.content || '')}" style="width:140px" /></td>
      <td><input class="fin-inline-input" type="number" name="amount" value="${r.amount}" style="width:90px" min="0" /></td>
      <td>
        <select class="fin-inline-input" name="payMethod">
          <option value="cash"     ${(r.payMethod || 'cash') === 'cash'     ? 'selected' : ''}>현금</option>
          <option value="card"     ${r.payMethod === 'card'                 ? 'selected' : ''}>카드</option>
          <option value="transfer" ${r.payMethod === 'transfer'             ? 'selected' : ''}>계좌이체</option>
        </select>
      </td>
      <td>
        <select class="fin-inline-input" name="payer">
          <option value="shared" ${(r.payer || 'shared') === 'shared' ? 'selected' : ''}>공용</option>
          <option value="ko"     ${r.payer === 'ko'                    ? 'selected' : ''}>고희재 사비</option>
          <option value="lee"    ${r.payer === 'lee'                   ? 'selected' : ''}>이건우 사비</option>
        </select>
      </td>
      ${actionCells}`;

  } else {
    row.innerHTML = `
      <td><input class="fin-inline-input" type="date" name="date" value="${escHtml(r.date)}" /></td>
      <td><input class="fin-inline-input" type="text" name="content" value="${escHtml(r.content || '')}" style="width:140px" /></td>
      <td><input class="fin-inline-input" type="number" name="amount" value="${r.amount}" style="width:90px" min="0" /></td>
      <td>
        <select class="fin-inline-input" name="payMethod">
          <option value="cash"     ${(r.payMethod || 'cash') === 'cash'     ? 'selected' : ''}>현금</option>
          <option value="card"     ${r.payMethod === 'card'                 ? 'selected' : ''}>카드</option>
          <option value="transfer" ${r.payMethod === 'transfer'             ? 'selected' : ''}>계좌이체</option>
        </select>
      </td>
      <td>
        <select class="fin-inline-input" name="payer">
          <option value="ko"  ${r.payer === 'ko'  ? 'selected' : ''}>고희재</option>
          <option value="lee" ${r.payer === 'lee' ? 'selected' : ''}>이건우</option>
        </select>
      </td>
      ${actionCells}`;
  }

  row.querySelector('.fin-edit-save').addEventListener('click', () => {
    const patch = {};
    row.querySelectorAll('[name]').forEach(el => {
      let val = el.value;
      if (el.name === 'amount')    val = parseInt(val, 10) || 0;
      if (el.name === 'isRenewal') val = (val === 'true');
      patch[el.name] = val;
    });
    SM.update(section, id, patch);

    // 할부 개인지출 결제자 변경 시 이후 회차 자동 상속
    let msg = '수정했습니다';
    if (section === 'private' && r.isInstallment && r.installNo && patch.payer && patch.payer !== r.payer) {
      cascadeInstallmentPayer(r.installGroupId, r.installNo + 1, patch.payer);
      const payerName = patch.payer === 'ko' ? '고희재' : '이건우';
      msg = `${r.installNo + 1}회차부터 결제자를 ${payerName}로 변경했습니다`;
    }

    renderFinanceData();
    showToast(msg);
  });

  row.querySelector('.fin-edit-cancel').addEventListener('click', () => {
    renderFinanceData();
  });
}

// ════════════════════════════════
// 결산 리포트
// ════════════════════════════════
function renderReport(data) {
  const grid = document.getElementById('fin-report-grid');
  if (!grid) return;

  grid.innerHTML = ['ko', 'lee'].map(inst => {
    const name  = inst === 'ko' ? '고희재' : '이건우';
    const other = inst === 'ko' ? '이건우' : '고희재';
    const s     = SM.calc(inst, data);
    const fcls  = s.adjustedFinal >= 0 ? 'plus' : 'minus';

    return `
      <div class="fin-report-card">
        <div class="fin-report-name">${name}</div>
        <div class="fin-report-row">
          <span class="fin-report-label">정산 매출 (신규)</span>
          <span class="fin-report-val">${fmtMoney(s.myIncome)}</span>
        </div>
        ${s.renewalAmt > 0 ? `
        <div class="fin-report-row">
          <span class="fin-report-label" style="color:#2563eb">재등록 매출 (정산 제외)</span>
          <span class="fin-report-val" style="color:#2563eb">${fmtMoney(s.renewalAmt)}</span>
        </div>` : ''}
        <div class="fin-report-row">
          <span class="fin-report-label">공용지출 50% 차감</span>
          <span class="fin-report-val minus">− ${fmtMoney(s.sharedTotal * 0.5)}</span>
        </div>
        <div class="fin-report-row">
          <span class="fin-report-label">${other} 개인지출 50% 차감</span>
          <span class="fin-report-val minus">− ${fmtMoney(s.otherPrivate * 0.5)}</span>
        </div>
        <div class="fin-report-row">
          <span class="fin-report-label">본인 개인지출 50% 보전</span>
          <span class="fin-report-val plus">+ ${fmtMoney(s.myPrivate * 0.5)}</span>
        </div>
        ${s.adjItems.map(a => `
        <div class="fin-report-row">
          <span class="fin-report-label fin-adj-label">보정: ${escHtml(a.note || '—')}</span>
          <span class="fin-report-val ${a.amount >= 0 ? 'plus' : 'minus'}">${a.amount >= 0 ? '+ ' : '− '}${fmtMoney(Math.abs(a.amount))}</span>
        </div>`).join('')}
        <div class="fin-divider"></div>
        <div class="fin-final-row">
          <span class="fin-final-label">최종 수령액${s.adjAmt !== 0 ? ' (보정 포함)' : ''}</span>
          <span class="fin-final-val ${fcls}">${fmtMoney(s.adjustedFinal)}</span>
        </div>
      </div>`;
  }).join('');
}

// ════════════════════════════════
// 최종 보정 섹션 렌더링
// ════════════════════════════════
function renderAdjustmentSection(data) {
  const grid = document.getElementById('fin-adjust-grid');
  if (!grid) return;

  grid.innerHTML = ['ko', 'lee'].map(inst => {
    const name  = inst === 'ko' ? '고희재' : '이건우';
    const items = SM._normalizeAdjs((data.adjustments || {})[inst]);
    const total = items.reduce((s, a) => s + (a.amount || 0), 0);

    const itemRows = items.map(a => `
      <div class="fin-adjust-item" data-inst="${escHtml(inst)}" data-adj-id="${escHtml(a.id)}">
        <span class="fin-adjust-item-val ${a.amount >= 0 ? 'plus' : 'minus'}">${a.amount >= 0 ? '+' : ''}${fmtMoney(a.amount)}</span>
        <span class="fin-adjust-item-note">${escHtml(a.note || '—')}</span>
        <button class="fin-adj-del" data-inst="${escHtml(inst)}" data-adj-id="${escHtml(a.id)}" title="삭제">✕</button>
      </div>`).join('');

    return `
      <div class="fin-adjust-card">
        <div class="fin-adjust-name">${name}${items.length > 0 ? ` <span class="fin-adjust-total">(합계 ${total >= 0 ? '+' : ''}${fmtMoney(total)})</span>` : ''}</div>
        ${itemRows}
        <div class="fin-adjust-row">
          <input type="number" id="adj-${inst}-amount" class="fin-input fin-adjust-input"
                 placeholder="금액 (음수 가능)" />
          <input type="text" id="adj-${inst}-note" class="fin-input fin-adjust-note"
                 placeholder="보정 내용 (예: 현금 선지급)" />
          <button class="btn btn-export fin-adjust-add" data-inst="${inst}">+ 추가</button>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.fin-adjust-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const inst   = btn.dataset.inst;
      const amount = parseInt(document.getElementById(`adj-${inst}-amount`).value, 10);
      const note   = document.getElementById(`adj-${inst}-note`).value.trim();
      if (!amount) { showToast('금액을 입력하세요'); return; }
      SM.addAdjustment(inst, amount, note);
      renderFinanceData();
      const name = inst === 'ko' ? '고희재' : '이건우';
      showToast(`${name} 보정 추가: ${amount > 0 ? '+' : ''}${fmtMoney(amount)}`);
    });
  });

  grid.querySelectorAll('.fin-adj-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const { inst, adjId } = btn.dataset;
      SM.delAdjustment(inst, adjId);
      renderFinanceData();
    });
  });
}

// ════════════════════════════════
// 이벤트 바인딩
// ════════════════════════════════
function bindFinanceEvents() {
  // ── 월 이동 ──
  document.getElementById('fin-prev').addEventListener('click', () => {
    const prev = prevMonthKey(finMonth);
    if (!prev) return;
    finMonth = prev;
    renderFinanceData();
  });
  document.getElementById('fin-next').addEventListener('click', () => {
    finMonth = nextMonthKey(finMonth);
    renderFinanceData();
  });

  // ── 엑셀 업로드 ──
  document.getElementById('fin-excel-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleExcelUpload(file);
  });

  // ── 영수증 스캔 — 매출 ──
  document.getElementById('fi-scan-btn').addEventListener('click', () => {
    document.getElementById('fi-scan-input').click();
  });
  document.getElementById('fi-scan-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) analyzeReceipt(file, 'fi');
    document.getElementById('fi-scan-input').value = '';
  });

  // ── 영수증 스캔 — 공용지출 ──
  document.getElementById('fe-scan-btn').addEventListener('click', () => {
    document.getElementById('fe-scan-input').click();
  });
  document.getElementById('fe-scan-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) analyzeReceipt(file, 'fe');
  });

  // ── 영수증 스캔 — 개인지출 ──
  document.getElementById('fp-scan-btn').addEventListener('click', () => {
    document.getElementById('fp-scan-input').click();
  });
  document.getElementById('fp-scan-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) analyzeReceipt(file, 'fp');
  });

  // ── 매출 폼 유형 토글 ──
  document.getElementById('fi-type-new').addEventListener('click', () => {
    incomeIsRenewal = false;
    document.getElementById('fi-type-new').classList.add('active');
    document.getElementById('fi-type-renewal').classList.remove('active');
  });
  document.getElementById('fi-type-renewal').addEventListener('click', () => {
    incomeIsRenewal = true;
    document.getElementById('fi-type-renewal').classList.add('active');
    document.getElementById('fi-type-new').classList.remove('active');
  });

  // ── 매출 추가 ──
  let fiAddBusy = false;
  document.getElementById('fi-add-btn').addEventListener('click', () => {
    if (fiAddBusy) return;
    const date      = document.getElementById('fi-date').value;
    const amount    = parseInt(document.getElementById('fi-amount').value, 10) || 0;
    const payMethod = document.getElementById('fi-pay').value;

    if (!date || !amount) { showToast('날짜와 금액을 입력하세요'); return; }

    fiAddBusy = true;
    SM.addIncome({
      date, amount,
      instructor: document.getElementById('fi-inst').value,
      name:       document.getElementById('fi-name').value.trim(),
      payMethod,
      isRenewal:  incomeIsRenewal,
      ...(fiIsAuto && { isAuto: true }),
    });
    fiIsAuto  = false;
    fiAddBusy = false;
    showToast('매출을 추가했습니다');

    document.getElementById('fi-amount').value = '';
    document.getElementById('fi-name').value   = '';
    renderFinanceData();
  });

  // ── 결제수단 변경 → 할부 필드 표시/숨김 (공용지출) ──
  document.getElementById('fe-pay').addEventListener('change', () => {
    const isCard       = document.getElementById('fe-pay').value === 'card';
    const installField = document.getElementById('fe-install-field');
    if (installField) installField.style.display = isCard ? '' : 'none';
    if (!isCard) document.getElementById('fe-install').value = '1';
  });

  // ── 공용지출 추가 (카드일 때만 할부) ──
  let feAddBusy = false;
  document.getElementById('fe-add-btn').addEventListener('click', () => {
    if (feAddBusy) return;
    const date      = document.getElementById('fe-date').value;
    const amount    = parseInt(document.getElementById('fe-amount').value, 10) || 0;
    const payMethod = document.getElementById('fe-pay').value;
    const install   = payMethod === 'card'
      ? (parseInt(document.getElementById('fe-install').value, 10) || 1)
      : 1;
    if (!date || !amount) { showToast('날짜와 금액을 입력하세요'); return; }

    feAddBusy = true;
    const base = {
      content:   document.getElementById('fe-content').value.trim(),
      payer:     document.getElementById('fe-payer').value,
      payMethod,
      ...(feIsAuto && { isAuto: true }),
    };

    if (payMethod === 'card' && install > 1) {
      const monthlyAmt = Math.round(amount / install);
      distributeExpenseInstallment(date, monthlyAmt, install, base, 'shared');
      feIsAuto = false;
      showToast(`${install}개월 할부로 등록했습니다 (월 ${fmtMoney(monthlyAmt)})`);
    } else {
      SM.addShared({ ...base, date, amount });
      feIsAuto = false;
      showToast('공용지출을 추가했습니다');
    }
    feAddBusy = false;

    document.getElementById('fe-amount').value  = '';
    document.getElementById('fe-content').value = '';
    document.getElementById('fe-pay').value      = 'cash';
    document.getElementById('fe-install').value  = '1';
    const installField = document.getElementById('fe-install-field');
    if (installField) installField.style.display = 'none';
    renderFinanceData();
  });

  // ── 결제수단 변경 → 할부 필드 표시/숨김 (개인지출) ──
  document.getElementById('fp-pay').addEventListener('change', () => {
    const isCard       = document.getElementById('fp-pay').value === 'card';
    const installField = document.getElementById('fp-install-field');
    if (installField) installField.style.display = isCard ? '' : 'none';
    if (!isCard) document.getElementById('fp-install').value = '1';
  });

  // ── 개인지출 추가 (카드일 때만 할부) ──
  let fpAddBusy = false;
  document.getElementById('fp-add-btn').addEventListener('click', () => {
    if (fpAddBusy) return;
    const date      = document.getElementById('fp-date').value;
    const amount    = parseInt(document.getElementById('fp-amount').value, 10) || 0;
    const payMethod = document.getElementById('fp-pay').value;
    const install   = payMethod === 'card'
      ? (parseInt(document.getElementById('fp-install').value, 10) || 1)
      : 1;
    if (!date || !amount) { showToast('날짜와 금액을 입력하세요'); return; }

    fpAddBusy = true;
    const base = {
      content:   document.getElementById('fp-content').value.trim(),
      payer:     document.getElementById('fp-payer').value,
      payMethod,
      ...(fpIsAuto && { isAuto: true }),
    };

    if (payMethod === 'card' && install > 1) {
      const monthlyAmt = Math.round(amount / install);
      distributeExpenseInstallment(date, monthlyAmt, install, base, 'private');
      fpIsAuto = false;
      showToast(`${install}개월 할부로 등록했습니다 (월 ${fmtMoney(monthlyAmt)})`);
    } else {
      SM.addPrivate({ ...base, date, amount });
      fpIsAuto = false;
      showToast('개인지출을 추가했습니다');
    }
    fpAddBusy = false;

    document.getElementById('fp-amount').value  = '';
    document.getElementById('fp-content').value = '';
    document.getElementById('fp-install').value = '1';
    renderFinanceData();
  });
}
