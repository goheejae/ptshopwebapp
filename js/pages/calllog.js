import DB from '../db.js';
import { showToast, escHtml } from '../utils.js';

let currentMonth = new Date().toISOString().slice(0, 7);

export function renderCallLog() {
  const pc   = document.getElementById('page-content');
  const logs = DB.callLogsGet(currentMonth);

  pc.innerHTML = `
    <div class="page-header"><h1>📞 전화 상담 일지</h1></div>

    <div class="todo-input-section">
      <div class="todo-input-row">
        <input type="date" id="call-date" value="${new Date().toISOString().slice(0,10)}"
          title="전화 받은 날짜" style="border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:0.88rem;font-family:inherit"/>
        <input type="text" id="call-num" placeholder="전화번호" style="flex:1" />
        <select id="call-inst" style="border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:0.88rem">
          <option value="ko">고희재</option>
          <option value="lee">이건우</option>
        </select>
      </div>
      <textarea id="call-note" placeholder="상담 특이사항"
        style="width:100%;margin-top:8px;height:72px;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:0.9rem;font-family:inherit;resize:vertical"></textarea>
      <button class="btn btn-export" id="call-add-btn" style="width:100%;margin-top:8px">일지 등록</button>
    </div>

    <div class="todo-filter-bar" style="justify-content:center;align-items:center;gap:16px">
      <button class="btn" onclick="window.changeCallMonth(-1)">◀ 이전</button>
      <span style="font-weight:700;font-size:1rem">${currentMonth}</span>
      <button class="btn" onclick="window.changeCallMonth(1)">다음 ▶</button>
    </div>

    <div style="padding:4px 0 2px;font-size:0.82rem;color:#888;text-align:right">총 ${logs.length}건</div>

    <ul class="todo-list">
      ${logs.length === 0
        ? '<li class="todo-empty">이 달 전화 일지가 없습니다</li>'
        : logs.slice().reverse().map(l => `
          <li class="todo-item" data-id="${l.id}">
            <div class="todo-body">
              <div class="todo-top">
                <span class="todo-assignee-badge ${l.inst}">${l.inst === 'ko' ? '고희재' : '이건우'}</span>
                <span style="font-weight:700;font-size:0.95rem">${escHtml(l.num)}</span>
                <span style="font-size:0.78rem;color:#888;margin-left:auto">${l.date}</span>
              </div>
              ${l.note ? `<div class="todo-content" style="white-space:pre-wrap">${escHtml(l.note)}</div>` : ''}
            </div>
            <button class="todo-del-btn" data-del="${l.id}" title="삭제">✕</button>
          </li>`).join('')}
    </ul>
  `;

  document.getElementById('call-add-btn').onclick = () => {
    const num  = document.getElementById('call-num').value.trim();
    const note = document.getElementById('call-note').value.trim();
    const inst = document.getElementById('call-inst').value;
    const date = document.getElementById('call-date').value || new Date().toISOString().slice(0, 10);
    if (!num) { showToast('전화번호를 입력해주세요'); return; }

    DB.callLogsAdd({ num, note, inst, date });
    document.getElementById('call-num').value  = '';
    document.getElementById('call-note').value = '';
    showToast('등록했습니다');
    renderCallLog();
  };

  pc.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('이 일지를 삭제할까요?')) return;
      DB.callLogsDelete(btn.dataset.del);
      showToast('삭제했습니다');
      renderCallLog();
    };
  });
}

window.changeCallMonth = (v) => {
  const d = new Date(currentMonth + '-01');
  d.setMonth(d.getMonth() + v);
  currentMonth = d.toISOString().slice(0, 7);
  renderCallLog();
};
