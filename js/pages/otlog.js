import DB from '../db.js';
import { showToast, escHtml } from '../utils.js';

// 'all' = 전체보기 (기본), 'YYYY-MM' = 달별
let viewMonth   = new Date().toISOString().slice(0, 7);
let showAll     = true;            // 기본 전체 보기
let regFilter   = 'all';           // 'all' | 'registered' | 'unregistered'
let editingId   = null;

export function renderOtLog() {
  const pc  = document.getElementById('page-content');
  const all = DB.otLogsGet();

  // 달 / 등록상태 두 단계 필터
  let logs = showAll ? all : all.filter(l => (l.date || '').startsWith(viewMonth));
  if (regFilter === 'registered')   logs = logs.filter(l =>  l.isRegistered);
  if (regFilter === 'unregistered') logs = logs.filter(l => !l.isRegistered);

  const editing = editingId ? all.find(l => l.id === editingId) : null;

  pc.innerHTML = `
    <div class="page-header"><h1>🏋️ OT 일지</h1></div>

    <!-- 입력 폼 -->
    <div class="todo-input-section">
      <label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;color:#555;margin-bottom:10px;cursor:pointer">
        <input type="checkbox" id="ot-referral" ${editing?.isReferral ? 'checked' : ''}/>
        지인소개 (통계 집계 제외)
      </label>
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
      <!-- 기간 필터 -->
      <button class="btn ${showAll ? 'btn-export' : 'btn-import'}" id="ot-all-mode">전체 보기</button>
      <button class="btn ${!showAll ? 'btn-export' : 'btn-import'}" id="ot-month-mode">달별 보기</button>
      <input type="month" id="ot-month-picker" value="${viewMonth}"
        style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:0.88rem;font-family:inherit;${showAll ? 'opacity:0.45' : ''}"/>

      <!-- 등록/미등록 필터 -->
      <span style="margin-left:14px;font-size:0.78rem;color:#7a829e">상태</span>
      <button class="btn ${regFilter === 'all'          ? 'btn-export' : 'btn-import'}" data-reg-filter="all">전체</button>
      <button class="btn ${regFilter === 'registered'   ? 'btn-export' : 'btn-import'}" data-reg-filter="registered">✓ 등록</button>
      <button class="btn ${regFilter === 'unregistered' ? 'btn-export' : 'btn-import'}" data-reg-filter="unregistered">○ 미등록</button>
    </div>

    <div style="padding:4px 0 2px;font-size:0.82rem;color:#888;text-align:right">
      총 상담 <strong style="color:#444">${logs.filter(l => !l.isReferral).length}명</strong>
      · 고희재 <strong style="color:#444">${logs.filter(l => l.writer === '고희재' && !l.isReferral).length}명</strong>
      · 이건우 <strong style="color:#444">${logs.filter(l => l.writer === '이건우' && !l.isReferral).length}명</strong>
      ${logs.some(l => l.isReferral) ? ` · 지인소개 ${logs.filter(l => l.isReferral).length}명 (통계 제외)` : ''}
    </div>

    <!-- 목록 -->
    <ul class="todo-list">
      ${logs.length === 0
        ? '<li class="todo-empty">조건에 맞는 OT 일지가 없습니다</li>'
        : logs.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(l => `
          <li class="todo-item ot-item${editingId === l.id ? ' ot-editing' : ''}${l.isRegistered ? ' ot-registered' : ''}" data-id="${l.id}">
            <div class="todo-body" style="flex:1">
              <div class="todo-top" style="flex-wrap:wrap;gap:4px">
                <span class="ot-badge ${l.writer === '고희재' ? 'ot-badge-ko' : l.writer === '이건우' ? 'ot-badge-lee' : ''}">${escHtml(l.writer || '—')}</span>
                <span style="font-weight:700;font-size:0.97rem">${escHtml(l.name || '(이름 없음)')}</span>
                ${l.isReferral ? '<span style="font-size:0.72rem;font-weight:700;color:#fff;background:#f0a020;border-radius:10px;padding:2px 8px">지인소개</span>' : ''}
                <span style="font-size:0.88rem;color:#555">${escHtml(l.phone || '')}</span>
                <span style="font-size:0.78rem;color:#888;margin-left:auto">${l.date}</span>
              </div>
              ${l.note ? `<div class="todo-content" style="white-space:pre-wrap;margin-top:6px">${escHtml(l.note)}</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:stretch;flex-shrink:0;margin-left:8px">
              <button class="ot-reg-toggle ${l.isRegistered ? 'is-registered' : ''}" data-toggle="${l.id}"
                title="클릭으로 등록/미등록 전환">${l.isRegistered ? '✓ 등록' : '○ 미등록'}</button>
              <button class="btn btn-import ot-edit-btn" data-edit="${l.id}" style="padding:4px 10px;font-size:0.78rem">수정</button>
              <button class="todo-del-btn" data-del="${l.id}" title="삭제">✕</button>
            </div>
          </li>`).join('')}
    </ul>
  `;

  // ── 등록 / 수정 저장 ──
  document.getElementById('ot-submit').onclick = () => {
    const date   = document.getElementById('ot-date').value;
    const writer = document.getElementById('ot-writer').value.trim();
    const name   = document.getElementById('ot-name').value.trim();
    const phone  = document.getElementById('ot-phone').value.trim();
    const note      = document.getElementById('ot-note').value.trim();
    const isReferral = document.getElementById('ot-referral').checked;

    if (!name) { showToast('회원이름을 입력해주세요'); return; }

    if (editingId) {
      DB.otLogsUpdate(editingId, { date, writer, name, phone, note, isReferral });
      editingId = null;
      showToast('수정했습니다');
    } else {
      DB.otLogsAdd({ date, writer, name, phone, note, isReferral, isRegistered: false });
      showToast('등록했습니다');
    }
    renderOtLog();
  };

  // 취소 (편집 모드 해제)
  document.getElementById('ot-cancel')?.addEventListener('click', () => {
    editingId = null;
    renderOtLog();
  });

  // ── 기간 필터 ──
  document.getElementById('ot-all-mode').onclick   = () => { showAll = true;  renderOtLog(); };
  document.getElementById('ot-month-mode').onclick = () => { showAll = false; renderOtLog(); };
  document.getElementById('ot-month-picker').onchange = e => {
    const v = e.target.value;
    if (!v) return;
    viewMonth = v;
    showAll   = false;   // 달 선택 시 자동으로 달별 모드 전환
    renderOtLog();
  };

  // ── 등록/미등록 필터 ──
  pc.querySelectorAll('[data-reg-filter]').forEach(btn => {
    btn.onclick = () => { regFilter = btn.dataset.regFilter; renderOtLog(); };
  });

  // ── 목록 — 등록/미등록 토글 ──
  pc.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.onclick = ev => {
      ev.stopPropagation();
      const id = btn.dataset.toggle;
      const cur = all.find(l => l.id === id);
      if (!cur) return;
      DB.otLogsUpdate(id, { isRegistered: !cur.isRegistered });
      showToast(cur.isRegistered ? '미등록으로 전환' : '✓ 등록 처리');
      renderOtLog();
    };
  });

  // 수정 버튼
  pc.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => {
      editingId = btn.dataset.edit;
      renderOtLog();
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
