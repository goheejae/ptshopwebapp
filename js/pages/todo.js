import DB from '../db.js';
import { showToast, escHtml } from '../utils.js';

let todoFilter   = 'all';
let todoAssignee = 'all';

export function renderTodo() {
  const pageContent = document.getElementById('page-content');
  const today = new Date().toISOString().slice(0, 10);

  pageContent.innerHTML = `
    <div class="page-header"><h1>✅ To-do & 퀵 메모</h1></div>

    <div class="todo-input-section">
      <div class="todo-input-row">
        <input type="text" id="todo-content" placeholder="할 일 또는 공지사항 입력..." />
        <select id="todo-assignee-select">
          <option value="all">공통</option>
          <option value="ko">고희재</option>
          <option value="lee">이건우</option>
        </select>
      </div>
      <div class="todo-input-row secondary">
        <label>시작: <input type="date" id="todo-start" value="${today}" /></label>
        <label>마감: <input type="date" id="todo-due" /></label>
        <button class="btn btn-export" id="todo-add-btn">등록</button>
      </div>
      <p class="input-tip">* 마감일을 비워두면 상단 '퀵 메모'로 고정됩니다.</p>
    </div>

    <div class="todo-filter-bar">
      <button class="todo-filter-btn ${todoFilter === 'all' ? 'active' : ''}" data-filter="all">전체</button>
      <button class="todo-filter-btn ${todoFilter === 'ko'  ? 'active' : ''}" data-filter="ko">고희재</button>
      <button class="todo-filter-btn ${todoFilter === 'lee' ? 'active' : ''}" data-filter="lee">이건우</button>
    </div>

    <ul id="todo-list" class="todo-list"></ul>
  `;

  bindTodoEvents();
  renderTodoList();
}

export function renderTodoList() {
  const listEl = document.getElementById('todo-list');
  if (!listEl) return;

  const now      = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  let todos = DB.todosGet();
  if (todoFilter !== 'all') {
    todos = todos.filter(t => t.assignee === todoFilter || t.assignee === 'all');
  }

  // 정렬: 완료 → 미완료 안에서 퀵메모 → stale → 일반(시작일/마감일 순)
  todos.sort((a, b) => {
    if (a.done !== b.done) return a.done - b.done;
    const aQuick = !a.dueDate, bQuick = !b.dueDate;
    if (aQuick !== bQuick) return aQuick ? -1 : 1;
    return (a.dueDate || a.startDate || '') > (b.dueDate || b.startDate || '') ? 1 : -1;
  });

  if (!todos.length) {
    listEl.innerHTML = '<li class="todo-empty">등록된 할 일이 없습니다</li>';
    return;
  }

  listEl.innerHTML = todos.map(t => {
    const diffDays   = Math.floor((now - new Date(t.createdAt)) / 86400000);
    const isQuick    = !t.dueDate;
    const isStale    = !t.done && t.dueDate && diffDays >= 3;
    const isFuture   = !t.done && t.startDate && t.startDate > todayStr;
    const aName      = t.assignee === 'ko' ? '고희재' : t.assignee === 'lee' ? '이건우' : '공통';
    const classes    = [
      t.done    ? 'done'   : '',
      isStale   ? 'stale'  : '',
      isQuick   ? 'memo'   : '',
      isFuture  ? 'future' : '',
    ].filter(Boolean).join(' ');

    return `
      <li class="todo-item ${classes}" data-id="${t.id}">
        <input type="checkbox" class="todo-check" data-id="${t.id}" ${t.done ? 'checked' : ''} />
        <div class="todo-body">
          <div class="todo-top">
            <span class="todo-assignee-badge ${t.assignee}">${aName}</span>
            ${isQuick  ? '<span class="memo-tag">📌 퀵메모</span>' : ''}
            ${isStale  ? `<span class="stale-tag">🔥 ${diffDays}일째 미루는 중</span>` : ''}
            ${isFuture ? '<span class="future-tag">⏳ 대기 중</span>' : ''}
          </div>
          <div class="todo-content">${escHtml(t.content)}</div>
          <div class="todo-meta">
            <span class="todo-due">${t.startDate || todayStr} ~ ${t.dueDate || '계속'}</span>
          </div>
        </div>
        <button class="todo-del-btn" data-id="${t.id}" title="삭제">✕</button>
      </li>`;
  }).join('');
}

function bindTodoEvents() {
  // ── 담당자 select 초기값 복원 ──
  const sel = document.getElementById('todo-assignee-select');
  sel.value = todoAssignee;
  sel.addEventListener('change', () => { todoAssignee = sel.value; });

  // ── 추가 ──
  function addTodo() {
    const content = document.getElementById('todo-content').value.trim();
    if (!content) { showToast('내용을 입력해주세요'); return; }

    DB.todosAdd({
      id:        crypto.randomUUID(),
      content,
      assignee:  todoAssignee,
      startDate: document.getElementById('todo-start').value || null,
      dueDate:   document.getElementById('todo-due').value   || null,
      done:      false,
      createdAt: new Date().toISOString(),
    });

    document.getElementById('todo-content').value = '';
    document.getElementById('todo-due').value     = new Date().toISOString().slice(0, 10);
    renderTodoList();
    showToast('추가했습니다');
  }

  document.getElementById('todo-add-btn').addEventListener('click', addTodo);
  document.getElementById('todo-content').addEventListener('keydown', e => {
    if (e.key === 'Enter') addTodo();
  });

  // ── 필터 ──
  document.querySelectorAll('.todo-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      todoFilter = btn.dataset.filter;
      document.querySelectorAll('.todo-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTodoList();
    });
  });

  // ── 체크 / 삭제 (이벤트 위임) ──
  document.getElementById('todo-list').addEventListener('click', e => {
    const check = e.target.closest('.todo-check');
    const del   = e.target.closest('.todo-del-btn');
    if (check) { DB.todosUpdate(check.dataset.id, { done: check.checked }); renderTodoList(); }
    if (del)   { DB.todosDel(del.dataset.id); renderTodoList(); showToast('삭제했습니다'); }
  });
}
