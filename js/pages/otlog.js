import DB from '../db.js';
import { showToast, escHtml } from '../utils.js';

// 'all' = 전체보기, 'YYYY-MM' = 달별
let viewMonth = new Date().toISOString().slice(0, 7);
let showAll   = false;
let editingId = null;

export function renderOtLog() {
  const pc   = document.getElementById('page-content');
  const all  = DB.otLogsGet();
  const logs = showAll ? all : all.filter(l => l.date.startsWith(viewMonth));

  // 수정 중인 항목 데이터
  const editing = editingId ? all.find(l => l.id === editingId) : null;

  pc.innerHTML = `
    <div class="page-header"><h1>🏋️ OT 일지</h1></div>

    <!-- 입력 폼 -->
    <div class="todo-input-section">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div>
          <label style="font-size:0.78rem;color:#7a829e;display:block;margin-bottom:3px">날짜</label>
          <input type="date" id="ot-date" value="${editing?.date ?? new Date().toISOString().slice(0, 10)}"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:0.88rem;font-family:inherit"/>
        </div>
        <div>
          <label style="font-size:0.78rem;color:#7a829e;display:block;margin-bottom:3px">상담자</label>
          <input type="text" id="ot-writer" placeholder="작성자 이름" value="${escHtml(editing?.writer ?? '')}"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:0.88rem;font-family:inherit"/>
        </div>
        <div>
          <label style="font-size:0.78rem;color:#7a829e;display:block;margin-bottom:3px">회원이름</label>
          <input type="text" id="ot-name" placeholder="회원 이름" value="${escHtml(editing?.name ?? '')}"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:0.88rem;font-family:inherit"/>
        </div>
        <div>
          <label style="font-size:0.78rem;color:#7a829e;display:block;margin-bottom:3px">전화번호</label>
          <input type="tel" id="ot-phone" placeholder="010-0000-0000" value="${escHtml(editing?.phone ?? '')}"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:0.88rem;font-family:inherit"/>
        </div>
      </div>
      <div>
        <label style="font-size:0.78rem;color:#7a829e;display:block;margin-bottom:3px">특이사항</label>
        <textarea id="ot-note" placeholder="OT 내용, 특이사항, 주의사항 등 자유롭게 기록하세요"
          style="width:100%;height:110px;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:0.9rem;font-family:inherit;resize:vertical">${escHtml(editing?.note ?? '')}</textarea>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        ${editing ? `<button class="btn btn-import" id="ot-cancel" style="flex:1">취소</button>` : ''}
        <button class="btn btn-export" id="ot-submit" style="flex:2">
          ${editing ? '✏️ 수정 저장' : '+ OT 일지 등록'}
        </button>
      </div>
    </div>

    <!-- 필터 바 -->
    <div class="todo-filter-bar" style="align-items:center;gap:8px;flex-wrap:wrap">
      <button class="btn ${!showAll ? 'btn-export' : 'btn-import'}" id="ot-month-mode">달별 보기</button>
      <button class="btn ${showAll ? 'btn-export' : 'btn-import'}" id="ot-all-mode">전체 보기</button>
      <div id="ot-month-nav" style="display:${showAll ? 'none' : 'flex'};align-items:center;gap:10px;margin-left:auto">
        <button class="btn" onclick="window.changeOtMonth(-1)">◀</button>
        <span style="font-weight:700;font-size:0.95rem">${viewMonth}</span>
        <button class="btn" onclick="window.changeOtMonth(1)">▶</button>
      </div>
    </div>

    <div style="padding:4px 0 2px;font-size:0.82rem;color:#888;text-align:right">
      총 ${logs.length}건
    </div>

    <!-- 목록 -->
    <ul class="todo-list">
      ${logs.length === 0
        ? '<li class="todo-empty">등록된 OT 일지가 없습니다</li>'
        : logs.slice().sort((a, b) => b.date.localeCompare(a.date)).map(l => `
          <li class="todo-item ot-item${editingId === l.id ? ' ot-editing' : ''}" data-id="${l.id}">
            <div class="todo-body" style="flex:1">
              <div class="todo-top" style="flex-wrap:wrap;gap:4px">
                <span class="ot-badge">${escHtml(l.writer || '—')}</span>
                <span style="font-weight:700;font-size:0.97rem">${escHtml(l.name || '(이름 없음)')}</span>
                <span style="font-size:0.88rem;color:#555">${escHtml(l.phone || '')}</span>
                <span style="font-size:0.78rem;color:#888;margin-left:auto">${l.date}</span>
              </div>
              ${l.note ? `<div class="todo-content" style="white-space:pre-wrap;margin-top:6px">${escHtml(l.note)}</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:center;flex-shrink:0;margin-left:8px">
              <button class="btn btn-import ot-edit-btn" data-edit="${l.id}" style="padding:4px 10px;font-size:0.78rem">수정</button>
              <button class="todo-del-btn" data-del="${l.id}" title="삭제">✕</button>
            </div>
          </li>`).join('')}
    </ul>
  `;

  // 등록 / 수정 저장
  document.getElementById('ot-submit').onclick = () => {
    const date   = document.getElementById('ot-date').value;
    const writer = document.getElementById('ot-writer').value.trim();
    const name   = document.getElementById('ot-name').value.trim();
    const phone  = document.getElementById('ot-phone').value.trim();
    const note   = document.getElementById('ot-note').value.trim();

    if (!name) { showToast('회원이름을 입력해주세요'); return; }

    if (editingId) {
      DB.otLogsUpdate(editingId, { date, writer, name, phone, note });
      editingId = null;
      showToast('수정했습니다');
    } else {
      DB.otLogsAdd({ date, writer, name, phone, note });
      showToast('등록했습니다');
    }
    renderOtLog();
  };

  // 취소
  document.getElementById('ot-cancel')?.addEventListener('click', () => {
    editingId = null;
    renderOtLog();
  });

  // 달별 / 전체 전환
  document.getElementById('ot-month-mode').onclick = () => { showAll = false; renderOtLog(); };
  document.getElementById('ot-all-mode').onclick   = () => { showAll = true;  renderOtLog(); };

  // 수정 버튼
  pc.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => {
      editingId = btn.dataset.edit;
      renderOtLog();
      // 폼으로 스크롤
      document.querySelector('.todo-input-section')?.scrollIntoView({ behavior: 'smooth' });
    };
  });

  // 삭제 버튼
  pc.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('이 OT 일지를 삭제할까요?')) return;
      if (editingId === btn.dataset.del) editingId = null;
      DB.otLogsDel(btn.dataset.del);
      showToast('삭제했습니다');
      renderOtLog();
    };
  });
}

window.changeOtMonth = (v) => {
  const d = new Date(viewMonth + '-01');
  d.setMonth(d.getMonth() + v);
  viewMonth = d.toISOString().slice(0, 7);
  renderOtLog();
};
