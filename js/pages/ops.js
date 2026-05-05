import DB from '../db.js';
import { showToast, escHtml } from '../utils.js';
import { callClaude } from '../api.js';

let _history        = [];
let _pendingActions = null;

const ACTION_HANDLERS = {
  otLogsAdd:    data => { DB.otLogsAdd(data);                                                           return `OT일지 — ${data.name}`; },
  salesLogsAdd: data => { DB.salesLogsAdd({ status: 'pending', ...data });                              return `매출일지 — ${data.memberName} ${(data.amount || 0).toLocaleString()}원`; },
  callLogsAdd:  data => { DB.callLogsAdd(data);                                                         return `전화일지 — ${data.name}`; },
  todosAdd:     data => { DB.todosAdd({ id: crypto.randomUUID(), done: false, createdAt: new Date().toISOString(), ...data }); return `할 일 — ${data.text}`; },
};

export function renderOps() {
  _history        = [];
  _pendingActions = null;

  document.getElementById('page-content').innerHTML = `
    <div class="mkt-shell ops-shell">
      <div class="mkt-header">
        <h1 class="mkt-title">운영 어시스턴트</h1>
        <p class="mkt-subtitle">자연어로 말씀하시면 OT일지 · 매출 · 전화일지 · 할 일을 자동으로 기록합니다</p>
      </div>
      <div class="ops-chat-wrap">
        <div class="mkt-ai-messages" id="ops-messages">
          <div class="mkt-ai-row mkt-ai-row--bot">
            <div class="mkt-ai-avatar">🏋️</div>
            <div class="mkt-ai-bubble">
              안녕하세요! <strong>운영 어시스턴트</strong>입니다.<br>
              말씀하시면 OT일지 · 매출일지 · 전화일지 · 할 일을 자동으로 기록해드릴게요.<br><br>
              <span style="color:#475569;font-size:12px">
                예: "오늘 김지연님 OT했어, 체중 58kg 체지방 28%"<br>
                예: "박민서님 PT 신규등록 80만원, 고희재 강사"<br>
                예: "홍길동님 오늘 전화옴, 상담 예약"<br>
                예: "내일까지 청소기 필터 교체 할 일 추가"
              </span>
            </div>
          </div>
        </div>
        <div class="mkt-ai-input-row">
          <textarea id="ops-input" class="mkt-input mkt-ai-input"
            placeholder="자유롭게 말씀하세요..." rows="2"></textarea>
          <button class="mkt-btn mkt-btn-primary" id="ops-send" style="padding:10px 20px">전송</button>
        </div>
      </div>
    </div>
  `;

  _bindEvents();
}

function _bindEvents() {
  document.getElementById('ops-send').addEventListener('click', _handleChat);
  document.getElementById('ops-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _handleChat(); }
  });
  // confirm / cancel 은 동적 생성 요소 → 부모에 delegation
  document.getElementById('ops-messages').addEventListener('click', e => {
    if (e.target.id === 'ops-confirm') _executeActions();
    if (e.target.id === 'ops-cancel')  _cancelActions();
  });
}

async function _handleChat() {
  const input = document.getElementById('ops-input');
  const msg   = input.value.trim();
  if (!msg) return;

  input.value = '';
  _appendMsg('user', escHtml(msg));
  _history.push({ role: 'user', content: msg });

  const sendBtn = document.getElementById('ops-send');
  sendBtn.disabled = true;

  const loadId = 'ops-load-' + Date.now();
  _appendMsg('bot', '<span class="mkt-spinner" style="width:16px;height:16px;border-width:2px;vertical-align:middle"></span> 처리 중...', loadId);

  try {
    const raw  = await callClaude({ system: _buildSystemPrompt(), messages: _history });
    document.getElementById(loadId)?.remove();
    _history.push({ role: 'assistant', content: raw });

    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { reply: raw, actions: [] }; }

    const reply   = parsed.reply   || '';
    const actions = Array.isArray(parsed.actions) ? parsed.actions : [];

    _appendMsg('bot', escHtml(reply).replace(/\n/g, '<br>'));

    if (actions.length > 0) {
      _pendingActions = actions;
      _appendPreview(actions);
    }
  } catch (err) {
    document.getElementById(loadId)?.remove();
    _appendMsg('bot', '❌ 오류: API 키 또는 네트워크를 확인하세요.');
    console.error(err);
  } finally {
    sendBtn.disabled = false;
  }
}

function _appendMsg(role, html, id) {
  const msgs = document.getElementById('ops-messages');
  const row  = document.createElement('div');
  row.className = `mkt-ai-row mkt-ai-row--${role}`;
  if (id) row.id = id;
  row.innerHTML = role === 'bot'
    ? `<div class="mkt-ai-avatar">🏋️</div><div class="mkt-ai-bubble">${html}</div>`
    : `<div class="mkt-ai-bubble mkt-ai-bubble--user">${html}</div>`;
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

function _appendPreview(actions) {
  const msgs = document.getElementById('ops-messages');
  const card = document.createElement('div');
  card.className = 'mkt-ai-row mkt-ai-row--bot';
  card.id = 'ops-preview';
  card.innerHTML = `
    <div class="mkt-ai-avatar">📋</div>
    <div class="ops-preview-card">
      <div class="ops-preview-title">저장 예정 항목</div>
      <ul class="ops-preview-list">
        ${actions.map(a => `<li class="ops-preview-item">${escHtml(a.label || a.type)}</li>`).join('')}
      </ul>
      <div class="ops-preview-actions">
        <button class="mkt-btn mkt-btn-primary" id="ops-confirm" style="flex:1;justify-content:center">저장하기</button>
        <button class="mkt-btn mkt-btn-outline" id="ops-cancel"  style="justify-content:center">취소</button>
      </div>
    </div>
  `;
  msgs.appendChild(card);
  msgs.scrollTop = msgs.scrollHeight;
}

function _executeActions() {
  if (!_pendingActions) return;
  const results = [];
  for (const action of _pendingActions) {
    const handler = ACTION_HANDLERS[action.type];
    if (handler) {
      try   { results.push(handler(action.data || {})); }
      catch (e) { console.error(action.type, e); results.push(`❌ ${action.type} 실패`); }
    } else {
      results.push(`❓ 알 수 없는 작업: ${action.type}`);
    }
  }
  document.getElementById('ops-preview')?.remove();
  _pendingActions = null;
  _appendMsg('bot', `저장 완료!<br>${results.map(r => `✅ ${escHtml(r)}`).join('<br>')}`);
  showToast(`✅ ${results.length}건 저장 완료`);
}

function _cancelActions() {
  document.getElementById('ops-preview')?.remove();
  _pendingActions = null;
  _appendMsg('bot', '취소했습니다. 다른 내용을 말씀해주세요.');
}

function _buildSystemPrompt() {
  const today      = new Date().toISOString().slice(0, 10);
  const thisMonth  = today.slice(0, 7);
  const recentOt   = DB.otLogsGet().slice(-5).reverse();
  const recentSale = DB.salesLogsGetByMonth(thisMonth).slice(-5).reverse();
  const recentCall = DB.callLogsGet(thisMonth).slice(-5).reverse();
  const todos      = DB.todosGet().filter(t => !t.done).slice(0, 5);

  const ctx = [
    `오늘: ${today} / 이번 달: ${thisMonth}`,
    '',
    '최근 OT 일지(5건):',
    recentOt.length   ? recentOt.map(l   => `  ${l.date} ${l.name}(${l.writer || ''})`).join('\n')                     : '  없음',
    '',
    `이번 달 매출(${thisMonth}, 5건):`,
    recentSale.length ? recentSale.map(l => `  ${l.date} ${l.memberName} ${(l.amount||0).toLocaleString()}원(${l.instructor})`).join('\n') : '  없음',
    '',
    '이번 달 전화일지(5건):',
    recentCall.length ? recentCall.map(l  => `  ${l.date} ${l.name}`).join('\n')                                        : '  없음',
    '',
    '미완료 할 일:',
    todos.length      ? todos.map(t       => `  - ${t.text}`).join('\n')                                                 : '  없음',
  ].join('\n');

  return `너는 핏플랜PT 운영 어시스턴트야. 원장님이 자연어로 말하면 의도를 파악해 Firebase에 기록해줘.

[현재 데이터]
${ctx}

[저장 가능한 컬렉션 & 필드]

1. otLogsAdd — OT일지/수업일지
   { name:"회원이름", date:"YYYY-MM-DD", writer:"상담자", phone:"010-...", note:"특이사항" }

2. salesLogsAdd — 매출일지
   { memberName:"이름", month:"YYYY-MM", date:"YYYY-MM-DD",
     type:"new"|"renewal", amount:숫자, instructor:"ko"|"lee", memo:"메모" }
   instructor: ko=고희재, lee=이건우. 명시 없으면 ko.

3. callLogsAdd — 전화일지
   { name:"이름", phone:"010-...", date:"YYYY-MM-DD", result:"결과", memo:"메모" }

4. todosAdd — 할 일
   { text:"할 일 내용" }

[응답 규칙]
- 반드시 JSON만 응답. 다른 텍스트 절대 금지.
- 형식:
  { "reply": "한국어 메시지", "actions": [{ "type": "otLogsAdd", "data": {...}, "label": "OT일지 — 김지연 (2026-05-05)" }] }
- 저장 없으면 actions: []
- 핵심 정보(이름·금액 등) 불명확하면 actions: [], reply로 질문
- label은 사람이 읽기 쉽게 한국어 요약
- 날짜 명시 없으면 오늘(${today}) 기준
- 금액은 숫자만 (예: 800000)`;
}
