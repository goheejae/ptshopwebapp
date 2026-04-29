import DB from '../db.js';
import { showToast, escHtml } from '../utils.js';

const FORM_IMG_SRC = 'consult_form.png';
const UNDO_LIMIT = 20;

let view = 'list';
let editingId = null;
let drawer = null;

// ── 자동 저장 상태 ───────────────────────────────────────────
let autoSaveTimer = null;

function _setStatus(state) {
  const el = document.getElementById('con-save-status');
  if (!el) return;
  if (state === 'saving') {
    el.textContent = '⏳ 저장 중...';
    el.style.color = '#888';
  } else if (state === 'saved') {
    const hhmm = new Date().toTimeString().slice(0, 5);
    el.textContent = `✅ 자동 저장됨 ${hhmm}`;
    el.style.color = '#16a34a';
  } else {
    el.textContent = '';
  }
}

function _scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  _setStatus('saving');
  autoSaveTimer = setTimeout(_doAutoSave, 2000);
}

function _doAutoSave() {
  const nameEl = document.getElementById('cf-name');
  const dateEl = document.getElementById('cf-date');
  if (!nameEl || !dateEl || !drawer) return;

  const name        = nameEl.value.trim();
  const consultDate = dateEl.value;
  const canvasData  = drawer.toDataURL();
  const savedAt     = new Date().toISOString();

  if (editingId) {
    // 기존 상담지: Firebase + localStorage 동시 저장
    DB.consultsUpdate(editingId, { name, consultDate, canvasData, updatedAt: savedAt });
    localStorage.setItem(
      `consult_autosave_${editingId}`,
      JSON.stringify({ name, consultDate, canvasData, savedAt })
    );
  } else {
    // 신규 상담지: localStorage에만 임시 저장 (Firebase 오염 방지)
    localStorage.setItem(
      'consult_draft_new',
      JSON.stringify({ name, consultDate, canvasData, savedAt })
    );
  }

  _setStatus('saved');
}

// ── Entry point ──────────────────────────────────────────────
export function renderConsult() {
  view === 'form' ? _renderForm() : _renderList();
}

// ── List view ────────────────────────────────────────────────
function _renderList() {
  const pc = document.getElementById('page-content');
  const list = DB.consultsGet().slice().sort((a, b) => (b.consultDate || '') > (a.consultDate || '') ? 1 : -1);

  pc.innerHTML = `
    <div style="max-width:700px;margin:0 auto;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="font-size:1.1rem;font-weight:700">상담지 목록 (${list.length})</h2>
        <button class="btn btn-export" id="con-new">+ 새 상담지</button>
      </div>
      <div id="consult-list">
        ${list.length === 0
          ? '<p style="color:#888;text-align:center;padding:40px 0">저장된 상담지가 없습니다.</p>'
          : list.map(c => `
            <div style="background:#fff;border:1px solid #e2e6f0;border-radius:10px;padding:14px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:600">${escHtml(c.name || '(이름 없음)')}</div>
                <div style="font-size:0.82rem;color:#888;margin-top:2px">${c.consultDate || ''}</div>
              </div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-import" data-edit="${c.id}" style="padding:5px 10px;font-size:0.8rem">수정</button>
                <button class="btn" data-del="${c.id}" style="padding:5px 10px;font-size:0.8rem;background:#fee2e2;color:#dc2626;border:none;border-radius:6px;cursor:pointer">삭제</button>
              </div>
            </div>`).join('')}
      </div>
    </div>`;

  document.getElementById('con-new').onclick = () => {
    editingId = null;
    view = 'form';
    renderConsult();
  };

  pc.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      editingId = btn.dataset.edit;
      view = 'form';
      renderConsult();
    };
  });

  pc.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      if (!confirm('이 상담지를 삭제할까요?')) return;
      localStorage.removeItem(`consult_autosave_${btn.dataset.del}`);
      DB.consultsDel(btn.dataset.del);
      showToast('삭제했습니다.');
      renderConsult();
    };
  });
}

// ── Form view ────────────────────────────────────────────────
function _renderForm() {
  const pc = document.getElementById('page-content');

  // 기존 상담지: Firebase 데이터와 localStorage 백업 중 최신본 사용
  let existing = editingId ? DB.consultsGetOne(editingId) : null;
  if (editingId) {
    try {
      const lsDraft = JSON.parse(localStorage.getItem(`consult_autosave_${editingId}`));
      if (lsDraft && lsDraft.savedAt && (!existing?.updatedAt || lsDraft.savedAt > existing.updatedAt)) {
        existing = { ...existing, ...lsDraft };
      }
    } catch { /* localStorage 파싱 실패 무시 */ }
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  pc.innerHTML = `
    <div id="con-toolbar" style="position:sticky;top:56px;z-index:50;background:#fff;border-bottom:1px solid #e2e6f0;padding:8px 12px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-import" id="con-back">← 목록</button>
      <input id="cf-name" type="text" placeholder="회원 이름" value="${escHtml(existing?.name || '')}"
        style="border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:0.88rem;width:120px"/>
      <input id="cf-date" type="date" value="${existing?.consultDate || todayStr}"
        style="border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:0.88rem"/>
      <span class="ctool-sep"></span>
      <button class="ctool" id="tool-mode" title="OFF: 펜슬만 필기·손가락은 스크롤 / ON: 손가락도 필기">🖐 손가락 필기 OFF</button>
      <span class="ctool-sep"></span>
      <button class="ctool active" id="tool-black">✏️ 검정</button>
      <button class="ctool" id="tool-red" style="color:#dc2626">✏️ 빨강</button>
      <button class="ctool" id="tool-highlight" style="color:#b8860b">🖊 형광펜</button>
      <button class="ctool" id="tool-eraser">⌫ 지우개</button>
      <span class="ctool-sep"></span>
      <button class="ctool" id="tool-sz-1" title="굵기 1">가</button>
      <button class="ctool active" id="tool-sz-3" title="굵기 3" style="font-weight:900">가</button>
      <button class="ctool" id="tool-sz-8" title="굵기 8" style="font-size:1.1rem;font-weight:900">가</button>
      <span class="ctool-sep"></span>
      <button class="ctool" id="con-undo">↩ 되돌리기</button>
      <button class="ctool" id="con-clear">🗑 초기화</button>
      <span id="con-save-status" style="font-size:0.78rem;margin-left:4px;white-space:nowrap"></span>
      <button class="btn btn-export" id="con-save" style="margin-left:auto">💾 저장</button>
    </div>
    <div id="canvas-wrapper" style="height:75vh;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;line-height:0">
      <canvas id="con-canvas" style="display:block;width:100%;cursor:crosshair"></canvas>
    </div>`;

  const bgSrc = existing?.canvasData || FORM_IMG_SRC;
  drawer = new CanvasDrawer(document.getElementById('con-canvas'), bgSrc);

  // 획 완료 시 자동 저장 예약
  drawer.onStrokeEnd = _scheduleAutoSave;

  document.getElementById('con-back').onclick = () => {
    clearTimeout(autoSaveTimer);
    view = 'list'; editingId = null; drawer = null;
    renderConsult();
  };

  // 텍스트 입력 변경 시 자동 저장 예약
  document.getElementById('cf-name').addEventListener('input', _scheduleAutoSave);
  document.getElementById('cf-date').addEventListener('input', _scheduleAutoSave);

  const toolBtns = [
    { id: 'tool-black',     tool: 'pen',    color: '#111111', lineWidth: null, alpha: 1 },
    { id: 'tool-red',       tool: 'pen',    color: '#e5414a', lineWidth: null, alpha: 1 },
    { id: 'tool-highlight', tool: 'pen',    color: '#ffff00', lineWidth: 20,   alpha: 0.3 },
    { id: 'tool-eraser',    tool: 'eraser', color: null,      lineWidth: null, alpha: 1 },
  ];
  toolBtns.forEach(({ id, tool, color, lineWidth, alpha }) => {
    document.getElementById(id).onclick = () => {
      toolBtns.forEach(t => document.getElementById(t.id).classList.remove('active'));
      document.getElementById(id).classList.add('active');
      drawer.setTool(tool, color, lineWidth, alpha);
    };
  });

  const szBtns = ['1', '3', '8'];
  szBtns.forEach(sz => {
    document.getElementById(`tool-sz-${sz}`).onclick = () => {
      szBtns.forEach(s => document.getElementById(`tool-sz-${s}`).classList.remove('active'));
      document.getElementById(`tool-sz-${sz}`).classList.add('active');
      drawer.lineWidth = +sz;
    };
  });

  // ── 손가락 필기 ON/OFF ─────────────────────────────────────
  // 펜슬은 항상 필기 가능(palm rejection 적용).
  // 손가락은 OFF: 페이지 스크롤 / ON: 필기 (touch-action 차이).
  const canvas    = document.getElementById('con-canvas');
  let   fingerOn  = false;

  function applyDrawMode(active) {
    fingerOn = active;
    drawer.setManualDraw(active);
    canvas.style.touchAction = active ? 'none' : 'pan-y';
    const btn = document.getElementById('tool-mode');
    if (active) {
      btn.textContent = '✏️ 손가락 필기 ON';
      btn.classList.add('active');
    } else {
      btn.textContent = '🖐 손가락 필기 OFF';
      btn.classList.remove('active');
    }
  }
  applyDrawMode(false);
  document.getElementById('tool-mode').onclick = () => applyDrawMode(!fingerOn);

  document.getElementById('con-undo').onclick  = () => drawer.undo();
  document.getElementById('con-clear').onclick = () => { if (confirm('캔버스를 초기화할까요?')) drawer.clear(); };

  document.getElementById('con-save').onclick = () => {
    clearTimeout(autoSaveTimer);
    const name = document.getElementById('cf-name').value.trim();
    const consultDate = document.getElementById('cf-date').value;
    if (!name) { showToast('회원 이름을 입력해주세요.'); return; }

    const canvasData = drawer.toDataURL();
    const savedId = editingId;
    if (editingId) {
      DB.consultsUpdate(editingId, { name, consultDate, canvasData });
    } else {
      DB.consultsAdd({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        name,
        consultDate,
        canvasData,
      });
    }
    // 수동 저장 완료 → localStorage 백업 제거
    if (savedId) localStorage.removeItem(`consult_autosave_${savedId}`);
    else         localStorage.removeItem('consult_draft_new');

    showToast('저장했습니다.');
    view = 'list'; editingId = null; drawer = null;
    renderConsult();
  };
}

// ── Canvas Drawer ────────────────────────────────────────────
class CanvasDrawer {
  constructor(canvas, bgSrc) {
    this.c           = canvas;
    this.ctx         = canvas.getContext('2d');
    this.tool            = 'pen';
    this.color           = '#111111';
    this.lineWidth       = 3;
    this.alpha           = 1;
    this.drawing         = false;
    this.manualDraw      = false;
    this.history         = [];
    this.bgImg           = null;
    this.ready           = false;
    this.activePointerId = null; // palm rejection: 활성 포인터 외 무시
    this.onStrokeEnd     = null; // 획 완료 콜백 (자동 저장용)
    this._load(bgSrc);
  }

  _load(src) {
    const img = new Image();
    const isDataURL = src.startsWith('data:');
    img.onload = () => {
      const extraH = isDataURL ? 0 : 1000;
      this.c.width  = img.naturalWidth;
      this.c.height = img.naturalHeight + extraH;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, this.c.width, this.c.height);
      this.ctx.drawImage(img, 0, 0);
      this.bgImg = img;
      this._push();
      this._bind();
      this.ready = true;
    };
    img.src = src;
  }

  setManualDraw(active) {
    this.manualDraw = active;
  }

  setTool(tool, color, lineWidth, alpha) {
    this.tool = tool;
    if (color !== null && color !== undefined) this.color = color;
    if (lineWidth) this.lineWidth = lineWidth;
    if (alpha !== undefined) this.alpha = alpha;
  }

  _push() {
    this.history.push(this.ctx.getImageData(0, 0, this.c.width, this.c.height));
    if (this.history.length > UNDO_LIMIT) this.history.shift();
  }

  undo() {
    if (this.history.length <= 1) { showToast('더 이상 되돌릴 수 없습니다.'); return; }
    this.history.pop();
    this.ctx.putImageData(this.history[this.history.length - 1], 0, 0);
  }

  clear() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.c.width, this.c.height);
    this.ctx.drawImage(this.bgImg, 0, 0);
    this._push();
  }

  toDataURL() {
    return this.c.toDataURL('image/png');
  }

  _pos(e) {
    const rect  = this.c.getBoundingClientRect();
    const scaleX = this.c.width  / rect.width;
    const scaleY = this.c.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  }

  _startStroke(x, y) {
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth   = this.lineWidth;
    this.ctx.globalAlpha = this.alpha;
    this.ctx.lineCap     = 'round';
    this.ctx.lineJoin    = 'round';
    this.drawing = true;
  }

  _draw(x, y) {
    if (this.tool === 'eraser') {
      const r = this.lineWidth * 6 + 12;
      this.ctx.save();
      this.ctx.globalAlpha = 1;
      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, Math.PI * 2);
      this.ctx.clip();
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(x - r, y - r, r * 2, r * 2);
      if (y - r < this.bgImg.naturalHeight) {
        this.ctx.drawImage(this.bgImg,
          x - r, y - r, r * 2, r * 2,
          x - r, y - r, r * 2, r * 2
        );
      }
      this.ctx.restore();
    } else {
      this.ctx.lineTo(x, y);
      this.ctx.stroke();
    }
  }

  _endStroke() {
    if (!this.drawing) return;
    this.drawing = false;
    this.activePointerId = null;
    this.ctx.globalAlpha = 1;
    this._push();
    this.onStrokeEnd?.(); // 자동 저장 콜백 호출
  }

  _bind() {
    const c = this.c;

    c.addEventListener('pointerdown', e => {
      if (!this.ready) return;
      const isPen = e.pointerType === 'pen';
      // 펜은 항상 그리기. 손가락/마우스는 manualDraw일 때만.
      if (!isPen && !this.manualDraw) return;
      // 이미 다른 포인터로 그리는 중이면 무시 (palm 첫 접촉 차단)
      if (this.drawing) return;
      e.preventDefault();
      this.activePointerId = e.pointerId;
      try { c.setPointerCapture(e.pointerId); } catch {}
      const { x, y } = this._pos(e);
      this._startStroke(x, y);
      this._draw(x, y);
    }, { passive: false });

    c.addEventListener('pointermove', e => {
      // 활성 포인터의 이벤트만 처리 (palm/추가 손가락 무시)
      if (!this.drawing || e.pointerId !== this.activePointerId) return;
      e.preventDefault();
      const { x, y } = this._pos(e);
      this._draw(x, y);
    }, { passive: false });

    const finish = e => {
      if (e.pointerId !== this.activePointerId) return;
      this._endStroke();
    };
    c.addEventListener('pointerup',     finish);
    c.addEventListener('pointercancel', finish);
  }
}
