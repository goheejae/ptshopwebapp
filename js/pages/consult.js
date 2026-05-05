import DB from '../db.js';
import { showToast, escHtml, isMobile } from '../utils.js';

const FORM_IMG_SRC = 'consult_form.png';
const HISTORY_LIMIT = 60;
const AUTOSAVE_DELAY = 4000;

let view = 'list';
let editingId = null;
let drawer = null;
let autoSaveTimer = null;
let dirty = false;
let _kbdRegistered = false;
let _lifecycleRegistered = false;

// ── 자동 저장 ─────────────────────────────────────────────────
function _setStatus(state) {
  const el = document.getElementById('con-save-status');
  if (!el) return;
  if (state === 'saving') {
    el.textContent = '저장 중…';
    el.style.color = '#888';
  } else if (state === 'saved') {
    const hhmm = new Date().toTimeString().slice(0, 5);
    el.textContent = `저장됨 ${hhmm}`;
    el.style.color = '#16a34a';
  } else {
    el.textContent = '';
  }
}

function _scheduleAutoSave() {
  dirty = true;
  clearTimeout(autoSaveTimer);
  _setStatus('saving');
  autoSaveTimer = setTimeout(_doAutoSave, AUTOSAVE_DELAY);
}

function _doAutoSave() {
  if (!drawer) return;
  const nameEl = document.getElementById('cf-name');
  const dateEl = document.getElementById('cf-date');
  if (!nameEl || !dateEl) return;

  const name = nameEl.value.trim();
  const consultDate = dateEl.value;
  const canvasData = drawer.toDataURL();
  const savedAt = new Date().toISOString();

  if (editingId) {
    DB.consultsUpdate(editingId, { name, consultDate, canvasData, updatedAt: savedAt });
    localStorage.setItem(
      `consult_autosave_${editingId}`,
      JSON.stringify({ name, consultDate, canvasData, savedAt })
    );
  } else {
    localStorage.setItem(
      'consult_draft_new',
      JSON.stringify({ name, consultDate, canvasData, savedAt })
    );
  }
  dirty = false;
  _setStatus('saved');
}

function _flushSave() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  if (dirty) _doAutoSave();
}

function _registerLifecycle() {
  if (_lifecycleRegistered) return;
  _lifecycleRegistered = true;
  window.addEventListener('pagehide', _flushSave);
  window.addEventListener('beforeunload', _flushSave);
}

// ── Entry point ──────────────────────────────────────────────
export function renderConsult() {
  if (view === 'form')      _renderForm();
  else if (view === 'view') _renderViewer();
  else                       _renderList();
}

// ── List view ────────────────────────────────────────────────
function _renderList() {
  const pc = document.getElementById('page-content');
  const list = DB.consultsGet().slice().sort((a, b) =>
    (b.consultDate || '') > (a.consultDate || '') ? 1 : -1
  );
  const mobile = isMobile();

  pc.innerHTML = `
    <div style="max-width:760px;margin:0 auto;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:8px">
        <h2 style="font-size:1.1rem;font-weight:700">상담지 (${list.length})</h2>
        ${mobile
          ? '<span style="font-size:0.78rem;color:#888">읽기 전용</span>'
          : '<button class="btn btn-export" id="con-new">+ 새 상담지</button>'}
      </div>
      <div id="consult-list">
        ${list.length === 0
          ? '<p style="color:#888;text-align:center;padding:40px 0">저장된 상담지가 없습니다.</p>'
          : list.map(c => `
            <div class="consult-row" data-id="${c.id}"
                 style="background:#fff;border:1px solid #e2e6f0;border-radius:10px;padding:14px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;cursor:pointer">
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(c.name || '(이름 없음)')}</div>
                <div style="font-size:0.82rem;color:#888;margin-top:2px">${c.consultDate || ''}</div>
              </div>
              ${mobile ? `
                <span style="font-size:0.78rem;color:#888;flex-shrink:0">›</span>
              ` : `
                <div style="display:flex;gap:8px;flex-shrink:0">
                  <button class="btn btn-import" data-edit="${c.id}" style="padding:5px 10px;font-size:0.8rem">수정</button>
                  <button class="btn" data-del="${c.id}" style="padding:5px 10px;font-size:0.8rem;background:#fee2e2;color:#dc2626;border:none;border-radius:6px;cursor:pointer">삭제</button>
                </div>
              `}
            </div>`).join('')}
      </div>
    </div>`;

  if (!mobile) {
    document.getElementById('con-new').onclick = () => {
      editingId = null; view = 'form'; renderConsult();
    };
  }

  pc.querySelectorAll('.consult-row').forEach(row => {
    row.onclick = e => {
      if (e.target.closest('button')) return;
      editingId = row.dataset.id;
      view = mobile ? 'view' : 'form';
      renderConsult();
    };
  });

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

// ── Mobile viewer (read-only) ────────────────────────────────
function _renderViewer() {
  const pc = document.getElementById('page-content');
  const c = editingId ? DB.consultsGetOne(editingId) : null;
  if (!c) { view = 'list'; renderConsult(); return; }
  const src = c.canvasData || FORM_IMG_SRC;

  pc.innerHTML = `
    <div style="position:sticky;top:56px;z-index:50;background:#fff;border-bottom:1px solid #e2e6f0;padding:8px 12px;display:flex;gap:10px;align-items:center">
      <button class="btn btn-import" id="con-back">← 목록</button>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:0.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(c.name || '(이름 없음)')}</div>
        <div style="font-size:0.78rem;color:#888">${c.consultDate || ''}</div>
      </div>
    </div>
    <div class="consult-viewer-wrap">
      <img src="${src}" alt="상담지" class="consult-viewer-img"/>
    </div>`;

  document.getElementById('con-back').onclick = () => {
    view = 'list'; editingId = null; renderConsult();
  };
}

// ── Form view (desktop / tablet) ─────────────────────────────
function _renderForm() {
  _registerLifecycle();

  const pc = document.getElementById('page-content');

  let existing = editingId ? DB.consultsGetOne(editingId) : null;
  if (editingId) {
    try {
      const lsDraft = JSON.parse(localStorage.getItem(`consult_autosave_${editingId}`));
      if (lsDraft && lsDraft.savedAt && (!existing?.updatedAt || lsDraft.savedAt > existing.updatedAt)) {
        existing = { ...existing, ...lsDraft };
      }
    } catch { /* ignore */ }
  } else {
    try {
      const lsDraft = JSON.parse(localStorage.getItem('consult_draft_new'));
      if (lsDraft && lsDraft.savedAt) existing = lsDraft;
    } catch { /* ignore */ }
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  pc.innerHTML = `
    <div id="con-toolbar">
      <button class="btn btn-import" id="con-back">← 목록</button>
      <input id="cf-name" type="text" placeholder="회원 이름" value="${escHtml(existing?.name || '')}"
        style="border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:0.88rem;width:120px"/>
      <input id="cf-date" type="date" value="${existing?.consultDate || todayStr}"
        style="border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:0.88rem"/>
      <span class="ctool-sep"></span>
      <button class="ctool active" id="tool-black">검정</button>
      <button class="ctool" id="tool-red" style="color:#dc2626">빨강</button>
      <button class="ctool" id="tool-highlight" style="color:#b8860b">형광펜</button>
      <button class="ctool" id="tool-eraser">지우개</button>
      <span class="ctool-sep"></span>
      <label style="display:flex;align-items:center;gap:6px;font-size:0.78rem;color:#555">
        굵기
        <input id="tool-size" type="range" min="1" max="10" step="1" value="3" style="width:90px;accent-color:#3b82f6"/>
        <span id="tool-size-val" style="width:14px;text-align:right;color:#888">3</span>
      </label>
      <span class="ctool-sep"></span>
      <button class="ctool" id="con-undo" title="되돌리기 (⌘/Ctrl+Z)">↶</button>
      <button class="ctool" id="con-redo" title="다시 실행 (⌘/Ctrl+Shift+Z)">↷</button>
      <span class="ctool-sep"></span>
      <button class="ctool" id="tool-mode" title="OFF: 펜슬만 필기 / ON: 손가락도 필기">🖐 손가락 OFF</button>
      <span id="con-save-status" style="font-size:0.78rem;margin-left:auto;white-space:nowrap;color:#888"></span>
    </div>
    <div id="canvas-wrapper">
      <canvas id="con-canvas" style="display:block;width:100%;cursor:crosshair"></canvas>
    </div>`;

  const bgSrc = existing?.canvasData || FORM_IMG_SRC;
  drawer = new CanvasDrawer(document.getElementById('con-canvas'), bgSrc);
  drawer.onChange = _scheduleAutoSave;

  document.getElementById('con-back').onclick = () => {
    _flushSave();
    if (drawer) { drawer.destroy(); drawer = null; }
    view = 'list'; editingId = null;
    renderConsult();
  };

  document.getElementById('cf-name').addEventListener('input', _scheduleAutoSave);
  document.getElementById('cf-date').addEventListener('input', _scheduleAutoSave);

  // 도구 선택
  const toolBtns = [
    { id: 'tool-black',     tool: 'pen',    color: '#111111', alpha: 1   },
    { id: 'tool-red',       tool: 'pen',    color: '#e5414a', alpha: 1   },
    { id: 'tool-highlight', tool: 'pen',    color: '#ffff00', alpha: 0.3, fixed: 18 },
    { id: 'tool-eraser',    tool: 'eraser', color: null,      alpha: 1,   fixed: 6  },
  ];
  const setActive = id => {
    toolBtns.forEach(t => document.getElementById(t.id).classList.remove('active'));
    document.getElementById(id).classList.add('active');
  };
  toolBtns.forEach(({ id, tool, color, alpha, fixed }) => {
    document.getElementById(id).onclick = () => {
      setActive(id);
      const w = fixed ?? +document.getElementById('tool-size').value;
      drawer.setTool(tool, color, w, alpha);
      if (fixed) {
        document.getElementById('tool-size').value = fixed;
        document.getElementById('tool-size-val').textContent = fixed;
      }
    };
  });

  // 굵기 슬라이더
  const sizeInput = document.getElementById('tool-size');
  const sizeVal = document.getElementById('tool-size-val');
  sizeInput.oninput = () => {
    drawer.lineWidth = +sizeInput.value;
    sizeVal.textContent = sizeInput.value;
  };

  // 손가락 필기 ON/OFF
  const canvas = document.getElementById('con-canvas');
  let fingerOn = false;
  function applyDrawMode(active) {
    fingerOn = active;
    drawer.setManualDraw(active);
    canvas.style.touchAction = active ? 'none' : 'pan-y';
    const btn = document.getElementById('tool-mode');
    btn.textContent = active ? '✏️ 손가락 ON' : '🖐 손가락 OFF';
    btn.classList.toggle('active', active);
  }
  applyDrawMode(false);
  document.getElementById('tool-mode').onclick = () => applyDrawMode(!fingerOn);

  document.getElementById('con-undo').onclick = () => drawer.undo();
  document.getElementById('con-redo').onclick = () => drawer.redo();

  // 키보드 단축키 (한 번만 등록, drawer 존재 여부로 가드)
  if (!_kbdRegistered) {
    _kbdRegistered = true;
    window.addEventListener('keydown', e => {
      if (!drawer) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) drawer.redo();
        else drawer.undo();
      }
    });
  }
}

// ── Canvas Drawer ────────────────────────────────────────────
class CanvasDrawer {
  constructor(canvas, bgSrc) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.tool = 'pen';
    this.color = '#111111';
    this.lineWidth = 3;
    this.alpha = 1;
    this.drawing = false;
    this.manualDraw = false;
    this.bgImg = null;
    this.ready = false;
    this.activePointerId = null;
    this.activePointerType = null;
    this.onChange = null;

    this.history = [];   // 확정된 stroke 목록
    this.redoStack = []; // undo한 stroke 보관
    this.current = null; // 진행 중인 stroke
    this.lastPoint = null;
    this._rect = null;

    this._onScrollOrResize = () => this._invalidateRect();

    this._load(bgSrc);
  }

  _load(src) {
    const img = new Image();
    img.onload = () => {
      const isDataURL = src.startsWith('data:');
      const extraH = isDataURL ? 0 : 1000;
      this.c.width = img.naturalWidth;
      this.c.height = img.naturalHeight + extraH;
      this.bgImg = img;
      this._redrawAll();
      this._bind();
      this.ready = true;
    };
    img.onerror = () => {
      showToast('상담지 이미지를 불러오지 못했습니다.');
    };
    img.src = src;
  }

  destroy() {
    window.removeEventListener('scroll', this._onScrollOrResize, true);
    window.removeEventListener('resize', this._onScrollOrResize);
  }

  setManualDraw(active) { this.manualDraw = active; }

  setTool(tool, color, lineWidth, alpha) {
    this.tool = tool;
    if (color !== null && color !== undefined) this.color = color;
    if (lineWidth) this.lineWidth = lineWidth;
    if (alpha !== undefined) this.alpha = alpha;
  }

  toDataURL() { return this.c.toDataURL('image/png'); }

  // ── 렌더 ─────────────────────────────────────
  _drawBackground() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.c.width, this.c.height);
    if (this.bgImg) this.ctx.drawImage(this.bgImg, 0, 0);
  }

  _replayStroke(s) {
    if (!s.points || s.points.length === 0) return;
    if (s.tool === 'eraser') {
      for (const p of s.points) this._eraseAt(p.x, p.y, s.lineWidth);
      return;
    }
    this.ctx.save();
    this.ctx.strokeStyle = s.color;
    this.ctx.fillStyle = s.color;
    this.ctx.lineWidth = s.lineWidth;
    this.ctx.globalAlpha = s.alpha;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    if (s.points.length === 1) {
      const p = s.points[0];
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, s.lineWidth / 2, 0, Math.PI * 2);
      this.ctx.fill();
    } else {
      this.ctx.beginPath();
      this.ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) {
        this.ctx.lineTo(s.points[i].x, s.points[i].y);
      }
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  _redrawAll() {
    this._drawBackground();
    for (const s of this.history) this._replayStroke(s);
  }

  // ── Undo / Redo ──────────────────────────────
  undo() {
    if (this.history.length === 0) { showToast('되돌릴 게 없습니다.'); return; }
    const s = this.history.pop();
    this.redoStack.push(s);
    this._redrawAll();
    this.onChange?.();
  }

  redo() {
    if (this.redoStack.length === 0) { showToast('다시 실행할 게 없습니다.'); return; }
    const s = this.redoStack.pop();
    this.history.push(s);
    this._replayStroke(s);
    this.onChange?.();
  }

  // ── 좌표 ─────────────────────────────────────
  _ensureRect() {
    if (!this._rect) this._rect = this.c.getBoundingClientRect();
    return this._rect;
  }
  _invalidateRect() { this._rect = null; }

  _pos(e) {
    const rect = this._ensureRect();
    const sx = this.c.width / rect.width;
    const sy = this.c.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    };
  }

  // ── Stroke ───────────────────────────────────
  _startStroke(x, y) {
    this.current = {
      tool: this.tool,
      color: this.color,
      lineWidth: this.lineWidth,
      alpha: this.alpha,
      points: [{ x, y }],
    };
    if (this.tool === 'eraser') {
      this._eraseAt(x, y, this.lineWidth);
    } else {
      // 첫 점은 작은 원으로 표시 (짧은 탭도 흔적이 남도록)
      this.ctx.save();
      this.ctx.globalAlpha = this.alpha;
      this.ctx.fillStyle = this.color;
      this.ctx.beginPath();
      this.ctx.arc(x, y, this.lineWidth / 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
    this.lastPoint = { x, y };
    this.drawing = true;
  }

  _drawTo(x, y) {
    if (!this.current) return;
    this.current.points.push({ x, y });
    if (this.current.tool === 'eraser') {
      this._eraseAt(x, y, this.current.lineWidth);
    } else {
      // segment 단위로만 그려서 stroke가 길어져도 O(n) 유지
      this.ctx.save();
      this.ctx.strokeStyle = this.current.color;
      this.ctx.lineWidth = this.current.lineWidth;
      this.ctx.globalAlpha = this.current.alpha;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
      this.ctx.lineTo(x, y);
      this.ctx.stroke();
      this.ctx.restore();
    }
    this.lastPoint = { x, y };
  }

  _eraseAt(x, y, w) {
    const r = w * 4 + 10;
    this.ctx.save();
    this.ctx.globalAlpha = 1;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.clip();
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(x - r, y - r, r * 2, r * 2);
    if (this.bgImg && y - r < this.bgImg.naturalHeight) {
      this.ctx.drawImage(this.bgImg,
        x - r, y - r, r * 2, r * 2,
        x - r, y - r, r * 2, r * 2);
    }
    this.ctx.restore();
  }

  _endStroke() {
    if (!this.drawing) return;
    this.drawing = false;
    this.activePointerId = null;
    this.activePointerType = null;
    if (this.current) {
      this.history.push(this.current);
      if (this.history.length > HISTORY_LIMIT) this.history.shift();
      this.redoStack.length = 0;
      this.current = null;
      this.onChange?.();
    }
    this.lastPoint = null;
  }

  _cancelStroke() {
    if (!this.drawing) return;
    this.drawing = false;
    this.activePointerId = null;
    this.activePointerType = null;
    this.current = null;
    this.lastPoint = null;
    this._redrawAll(); // 진행 중이던 획을 화면에서 제거
  }

  // ── 입력 바인딩 ───────────────────────────────
  _bind() {
    const c = this.c;

    window.addEventListener('scroll', this._onScrollOrResize, true);
    window.addEventListener('resize', this._onScrollOrResize);

    c.addEventListener('pointerdown', e => {
      if (!this.ready) return;
      const isPen = e.pointerType === 'pen';

      // 펜 우선 정책: 진행 중이라도 펜이 들어오면 인계
      if (this.drawing) {
        if (isPen && this.activePointerType !== 'pen') {
          this._cancelStroke();
        } else {
          return; // 같은 종류 추가 포인터 = palm/추가 손가락
        }
      }

      // 펜 외 입력은 손가락 모드일 때만
      if (!isPen && !this.manualDraw) return;

      e.preventDefault();
      this.activePointerId = e.pointerId;
      this.activePointerType = e.pointerType;
      try { c.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const { x, y } = this._pos(e);
      this._startStroke(x, y);
    }, { passive: false });

    c.addEventListener('pointermove', e => {
      if (!this.drawing || e.pointerId !== this.activePointerId) return;
      e.preventDefault();
      // 합쳐진 이벤트(coalesced)도 모두 처리해서 곡선이 부드러워짐
      const events = (typeof e.getCoalescedEvents === 'function')
        ? e.getCoalescedEvents()
        : null;
      if (events && events.length) {
        for (const ev of events) {
          const { x, y } = this._pos(ev);
          this._drawTo(x, y);
        }
      } else {
        const { x, y } = this._pos(e);
        this._drawTo(x, y);
      }
    }, { passive: false });

    const finish = e => {
      if (e.pointerId !== this.activePointerId) return;
      this._endStroke();
    };
    c.addEventListener('pointerup', finish);
    c.addEventListener('pointercancel', finish);
  }
}
