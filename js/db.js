/**
 * js/db.js — 데이터 접근 레이어 (Firebase Realtime Database)
 *
 * 구조: Firebase 에서 앱 시작 시 전체 데이터를 읽어 로컬 캐시(_d)에 저장.
 *       읽기는 캐시에서 동기로 처리 → 기존 페이지 모듈 변경 불필요.
 *       쓰기는 캐시 업데이트 + Firebase 비동기 write-through.
 *
 * 사용법: import DB from './db.js';
 *         await DB.init();   ← main.js에서 한 번만 호출
 */

import { showToast } from './utils.js';

// ── Firebase 초기화 (CDN compat SDK → index.html에서 로드됨) ──
const firebaseConfig = {
  apiKey:            'AIzaSyBGf8Y7Y_qnRez6PvEIfKuGE0zA8kjoLZA',
  authDomain:        'fitplan-2f629.firebaseapp.com',
  projectId:         'fitplan-2f629',
  storageBucket:     'fitplan-2f629.firebasestorage.app',
  messagingSenderId: '859220609129',
  appId:             '1:859220609129:web:d8bdfd02a545c003eabaf8',
  databaseURL:       'https://fitplan-2f629-default-rtdb.asia-southeast1.firebasedatabase.app',
};

firebase.initializeApp(firebaseConfig);
const _fbdb = firebase.database();

// Firebase object → JS array 변환 헬퍼
function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(v => v != null);
  return Object.values(val).filter(v => v != null);
}

const DB = {
  /** 로컬 캐시 */
  _d: null,

  /* ── 초기화 ─────────────────────────────────────────────
     Firebase에서 전체 데이터를 읽어 캐시에 적재합니다.
     main.js에서 앱 시작 시 한 번만 호출.
  ── */
  async init() {
    // Firebase CDN이 로드되지 않은 경우 (네트워크 차단 등) 오프라인 모드로 fallback
    if (typeof firebase === 'undefined' || !_fbdb) {
      console.warn('Firebase SDK 미로드 — 빈 데이터로 시작합니다.');
      this._d = this._empty();
      return this;
    }
    try {
      const snap = await _fbdb.ref('/').once('value');
      const raw  = snap.val() || {};
      this._d = {
        ...this._empty(),
        scheduler:   raw.scheduler   || {},
        customTypes: toArray(raw.customTypes),
        todos:       toArray(raw.todos),
        finance:     raw.finance     || {},
        salesLogs:   raw.salesLogs   || {},
        consults:    toArray(raw.consults ? Object.values(raw.consults) : []),
        callLogs:    toArray(raw.callLogs ? Object.values(raw.callLogs) : []),
        otLogs:      toArray(raw.otLogs   ? Object.values(raw.otLogs)   : []),
        notice:      raw.notice || '',
        instructors: raw.instructors || {},
        marketing:   raw.marketing   || { costs: {}, placeRanks: {}, content: {} },
      };
    } catch (e) {
      console.warn('Firebase 연결 실패 — 빈 데이터로 시작합니다.', e);
      this._d = this._empty();
    }
    return this;
  },

  _empty: () => ({
    version:     1,
    scheduler:   {},
    customTypes: [],
    todos:       [],
    finance:     {},
    salesLogs:   {},
    consults:    [],
    callLogs:    [],
    otLogs:      [],
    notice:      '',
    instructors: {},
    marketing:   { costs: {}, placeRanks: {}, content: {} },
  }),

  /** Firebase 비동기 쓰기 (실패 시 토스트 알림) */
  _fbSet(path, data) {
    _fbdb.ref(path).set(data).catch(e => {
      console.error('Firebase 쓰기 오류:', path, e);
      showToast('⚠️ 저장 실패 — 인터넷 연결을 확인해주세요.');
    });
  },
  _fbUpdate(path, patch) {
    _fbdb.ref(path).update(patch).catch(e => {
      console.error('Firebase 쓰기 오류:', path, e);
      showToast('⚠️ 저장 실패 — 인터넷 연결을 확인해주세요.');
    });
  },

  /**
   * 스케줄러·투두 실시간 리스너를 시작합니다.
   * main.js에서 init() 이후 한 번 호출.
   * @param {(node: 'scheduler'|'todos') => void} onUpdate - 변경 시 호출할 콜백
   */
  startRealTimeSync(onUpdate) {
    // 첫 번째 이벤트는 init()에서 이미 로드한 데이터이므로 건너뜀
    let skipSched = true, skipTodos = true, skipNotice = true, skipInstructors = true;

    _fbdb.ref('scheduler').on('value', snap => {
      if (skipSched) { skipSched = false; return; }
      this._d.scheduler = snap.val() || {};
      onUpdate('scheduler');
    }, () => showToast('⚠️ 스케줄러 실시간 동기화 연결이 끊겼습니다.'));

    _fbdb.ref('todos').on('value', snap => {
      if (skipTodos) { skipTodos = false; return; }
      this._d.todos = toArray(snap.val());
      onUpdate('todos');
    }, () => showToast('⚠️ 투두 실시간 동기화 연결이 끊겼습니다.'));

    _fbdb.ref('notice').on('value', snap => {
      if (skipNotice) { skipNotice = false; return; }
      this._d.notice = snap.val() || '';
      onUpdate('notice');
    }, () => showToast('⚠️ 공지사항 실시간 동기화 연결이 끊겼습니다.'));

    _fbdb.ref('instructors').on('value', snap => {
      if (skipInstructors) { skipInstructors = false; return; }
      this._d.instructors = snap.val() || {};
      onUpdate('instructors');
    }, () => showToast('⚠️ 마감 실시간 동기화 연결이 끊겼습니다.'));
  },

  /* ════════════════════════════════════════════════════════
     SCHEDULER
  ════════════════════════════════════════════════════════ */

  /* ════════════════════════════════════════════════════════
     DEADLINE  (경로: instructors/{instId}/isClosed)
  ════════════════════════════════════════════════════════ */

  /** 강사의 마감 상태를 반환합니다. */
  deadlineGet(instId) {
    return !!((this._d.instructors || {})[instId]?.isClosed);
  },

  /** 강사의 마감 상태를 Firebase에 저장합니다. */
  deadlineSet(instId, val) {
    if (!this._d.instructors) this._d.instructors = {};
    if (!this._d.instructors[instId]) this._d.instructors[instId] = {};
    this._d.instructors[instId].isClosed = val;
    this._fbSet(`instructors/${instId}/isClosed`, val);
  },

  /** 마감으로 채워진 셀(deadlineFilled: true)을 찾아 배경을 제거합니다. */
  schedClearDeadlineFilled(instId) {
    const sched = this._d.scheduler || {};
    Object.keys(sched).forEach(k => {
      if (!k.startsWith(instId + '|')) return;
      const cell = sched[k];
      if (!cell || !cell.deadlineFilled) return;
      const updated = { ...cell, bg: '', deadlineFilled: false };
      this._d.scheduler[k] = updated;
      this._fbSet(`scheduler/${k}`, updated);
    });
  },

  schedGet(instId, wKey, day, hour) {
    return (this._d.scheduler || {})[`${instId}|${wKey}|${day}|${hour}`] || {};
  },

  schedSet(instId, wKey, day, hour, patch) {
    const k = `${instId}|${wKey}|${day}|${hour}`;
    if (!this._d.scheduler) this._d.scheduler = {};
    this._d.scheduler[k] = { ...(this._d.scheduler[k] || {}), ...patch };
    this._fbSet(`scheduler/${k}`, this._d.scheduler[k]);
  },

  /* ════════════════════════════════════════════════════════
     CUSTOM TYPES
  ════════════════════════════════════════════════════════ */

  typesGet() { return this._d.customTypes || []; },

  typesAdd(type) {
    if (!this._d.customTypes) this._d.customTypes = [];
    this._d.customTypes.push(type);
    this._fbSet('customTypes', this._d.customTypes);
  },

  typesDel(idx) {
    (this._d.customTypes || []).splice(idx, 1);
    this._fbSet('customTypes', this._d.customTypes);
  },

  /* ════════════════════════════════════════════════════════
     TODOS
  ════════════════════════════════════════════════════════ */

  todosGet() { return this._d.todos || []; },

  todosAdd(todo) {
    if (!this._d.todos) this._d.todos = [];
    this._d.todos.push(todo);
    this._fbSet('todos', this._d.todos);
  },

  todosUpdate(id, patch) {
    const i = (this._d.todos || []).findIndex(t => t.id === id);
    if (i >= 0) {
      this._d.todos[i] = { ...this._d.todos[i], ...patch };
      this._fbSet('todos', this._d.todos);
    }
  },

  todosDel(id) {
    this._d.todos = (this._d.todos || []).filter(t => t.id !== id);
    this._fbSet('todos', this._d.todos);
  },

  /* ════════════════════════════════════════════════════════
     FINANCE
  ════════════════════════════════════════════════════════ */

  financeGet(monthKey) {
    const raw = (this._d.finance || {})[monthKey] || {};

    // backward compat: old expenses stored payer='ko'|'lee' inside expenses array
    const rawExp    = raw.expenses || [];
    const sharedExp = rawExp.filter(e => !e.payer || e.payer === 'shared');
    const migrExp   = rawExp.filter(e => e.payer && e.payer !== 'shared');

    return {
      incomes:         raw.incomes         || [],
      expenses:        sharedExp,
      privateExpenses: [...(raw.privateExpenses || []), ...migrExp],
      adjustments:     raw.adjustments     || {},
    };
  },

  financeSet(monthKey, data) {
    if (!this._d.finance) this._d.finance = {};
    this._d.finance[monthKey] = data;
    this._fbSet(`finance/${monthKey}`, data);
  },

  /** finance income 항목 추가 (salesLog 확정 시 사용) */
  financeAddIncome(monthKey, fields) {
    const d = this.financeGet(monthKey);
    const income = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...fields };
    d.incomes.push(income);
    this.financeSet(monthKey, d);
    return income;
  },

  /** finance income 항목 부분 업데이트 */
  financeUpdateIncome(monthKey, incomeId, patch) {
    const d = this.financeGet(monthKey);
    const i = d.incomes.findIndex(r => r.id === incomeId);
    if (i !== -1) d.incomes[i] = { ...d.incomes[i], ...patch };
    this.financeSet(monthKey, d);
  },

  /** finance income 항목 삭제 (salesLog 승인 취소 시 사용) */
  financeDelIncome(monthKey, incomeId) {
    const d = this.financeGet(monthKey);
    d.incomes = d.incomes.filter(r => r.id !== incomeId);
    this.financeSet(monthKey, d);
  },

  /** 공용지출 항목 추가 (할부 분산 저장용) */
  financeAddExpense(monthKey, fields) {
    const d     = this.financeGet(monthKey);
    const entry = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...fields };
    d.expenses.push(entry);
    this.financeSet(monthKey, d);
    return entry;
  },

  /** 개인지출 항목 추가 (할부 분산 저장용) */
  financeAddPrivateExpense(monthKey, fields) {
    const d     = this.financeGet(monthKey);
    const entry = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...fields };
    d.privateExpenses.push(entry);
    this.financeSet(monthKey, d);
    return entry;
  },

  /* ════════════════════════════════════════════════════════
     SALES LOG  (경로: salesLogs/{id})
     매출일지 항목은 ID 키로 평탄하게 저장 (월별 쿼리는 client 필터)
  ════════════════════════════════════════════════════════ */

  salesLogsGetByMonth(month) {
    return Object.values(this._d.salesLogs || {}).filter(e => e != null && e.month === month);
  },

  salesLogsGetById(id) {
    return (this._d.salesLogs || {})[id] || null;
  },

  salesLogsAdd(entry) {
    if (!this._d.salesLogs) this._d.salesLogs = {};
    const item = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...entry };
    this._d.salesLogs[item.id] = item;
    this._fbSet(`salesLogs/${item.id}`, item);
    return item;
  },

  salesLogsUpdate(id, patch) {
    const existing = (this._d.salesLogs || {})[id];
    if (!existing) return;
    this._d.salesLogs[id] = { ...existing, ...patch };
    this._fbUpdate(`salesLogs/${id}`, patch);
  },

  salesLogsDel(id) {
    if (this._d.salesLogs) delete this._d.salesLogs[id];
    this._fbSet(`salesLogs/${id}`, null);
  },

  /* ════════════════════════════════════════════════════════
     CONSULTS
  ════════════════════════════════════════════════════════ */

  consultsGet()      { return this._d.consults || []; },
  consultsGetOne(id) { return (this._d.consults || []).find(c => c.id === id) || null; },

  consultsAdd(consult) {
    if (!this._d.consults) this._d.consults = [];
    this._d.consults.push(consult);
    // 개별 ID 키로 저장 (canvas 데이터가 크므로 전체 배열 대신 개별 write)
    this._fbSet(`consults/${consult.id}`, consult);
  },

  consultsUpdate(id, patch) {
    const i = (this._d.consults || []).findIndex(c => c.id === id);
    if (i >= 0) {
      this._d.consults[i] = { ...this._d.consults[i], ...patch };
      this._fbUpdate(`consults/${id}`, patch);
    }
  },

  consultsDel(id) {
    this._d.consults = (this._d.consults || []).filter(c => c.id !== id);
    this._fbSet(`consults/${id}`, null);
  },

  /* ════════════════════════════════════════════════════════
     CALL LOGS
  ════════════════════════════════════════════════════════ */

  callLogsGet(month) {
    return (this._d.callLogs || []).filter(l => l.date.startsWith(month));
  },

  callLogsAdd(entry) {
    if (!this._d.callLogs) this._d.callLogs = [];
    const item = { id: crypto.randomUUID(), ...entry };
    this._d.callLogs.push(item);
    this._fbSet(`callLogs/${item.id}`, item);
  },

  callLogsDelete(id) {
    this._d.callLogs = (this._d.callLogs || []).filter(l => l.id !== id);
    this._fbSet(`callLogs/${id}`, null);
  },

  /* ════════════════════════════════════════════════════════
     OT LOGS
  ════════════════════════════════════════════════════════ */

  otLogsGet() { return this._d.otLogs || []; },

  otLogsAdd(entry) {
    if (!this._d.otLogs) this._d.otLogs = [];
    const item = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...entry };
    this._d.otLogs.push(item);
    this._fbSet(`otLogs/${item.id}`, item);
  },

  otLogsUpdate(id, patch) {
    const i = (this._d.otLogs || []).findIndex(l => l.id === id);
    if (i >= 0) {
      this._d.otLogs[i] = { ...this._d.otLogs[i], ...patch };
      this._fbUpdate(`otLogs/${id}`, patch);
    }
  },

  otLogsDel(id) {
    this._d.otLogs = (this._d.otLogs || []).filter(l => l.id !== id);
    this._fbSet(`otLogs/${id}`, null);
  },

  /* ════════════════════════════════════════════════════════
     NOTICE
  ════════════════════════════════════════════════════════ */

  noticeGet() { return this._d.notice || ''; },

  noticeSet(text) {
    this._d.notice = text;
    // _fbdb.ref('notice').set(text)
    _fbdb.ref('notice').set(text).catch(e => {
      console.error('Firebase 쓰기 오류: notice', e);
      showToast('⚠️ 저장 실패 — 인터넷 연결을 확인해주세요.');
    });
  },

  /* ════════════════════════════════════════════════════════
     MARKETING
     경로: marketing/{costs|placeRanks|content}/{id}
  ════════════════════════════════════════════════════════ */

  _mkt() {
    if (!this._d.marketing) this._d.marketing = { costs: {}, placeRanks: {}, content: {} };
    return this._d.marketing;
  },

  // 채널별 마케팅 비용 ─────────────────────────────────
  // { id, monthKey:'YYYY-MM', channel, amount, memo, createdAt }
  mktCostsGet(monthKey) {
    return Object.values(this._mkt().costs || {})
      .filter(e => e && e.monthKey === monthKey)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  mktCostsAdd(monthKey, fields) {
    const item = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), monthKey, ...fields };
    this._mkt().costs[item.id] = item;
    this._fbSet(`marketing/costs/${item.id}`, item);
    return item;
  },

  mktCostsDel(id) {
    delete this._mkt().costs[id];
    this._fbSet(`marketing/costs/${id}`, null);
  },

  // 네이버 플레이스 순위 기록 ──────────────────────────
  // { id, date:'YYYY-MM-DD', keyword, rank, memo, createdAt }
  mktPlaceRanksGet() {
    return Object.values(this._mkt().placeRanks || {})
      .filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  mktPlaceRanksAdd(fields) {
    const item = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...fields };
    this._mkt().placeRanks[item.id] = item;
    this._fbSet(`marketing/placeRanks/${item.id}`, item);
    return item;
  },

  mktPlaceRanksDel(id) {
    delete this._mkt().placeRanks[id];
    this._fbSet(`marketing/placeRanks/${id}`, null);
  },

  // 콘텐츠 생성 이력 ───────────────────────────────────
  // { id, topic, channels:[], drafts:{blog,place,insta,karrot}, createdAt }
  mktContentAdd(fields) {
    const item = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...fields };
    this._mkt().content[item.id] = item;
    this._fbSet(`marketing/content/${item.id}`, item);
    return item;
  },

  mktContentGetRecent(limit = 20) {
    return Object.values(this._mkt().content || {})
      .filter(Boolean)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  },

  mktContentDel(id) {
    delete this._mkt().content[id];
    this._fbSet(`marketing/content/${id}`, null);
  },

  /* ════════════════════════════════════════════════════════
     EXPORT / IMPORT
  ════════════════════════════════════════════════════════ */

  exportAll() {
    return JSON.parse(JSON.stringify(this._d));
  },

  importAll(data) {
    this._d = { ...this._empty(), ...data };
    // 전체 덮어쓰기
    this._fbSet('/', this._d);
  },
};

export default DB;
