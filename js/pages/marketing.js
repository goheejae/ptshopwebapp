import DB from '../db.js';
import { showToast, escHtml, fmtMoney } from '../utils.js';
import { callClaude, callClaudeVision, fileToBase64 } from '../api.js';

const CHANNELS = [
  { id: 'blog',      label: '네이버 블로그', icon: '📝' },
  { id: 'instagram', label: '인스타그램',     icon: '📸' },
  { id: 'karrot',    label: '당근마켓',       icon: '🥕' },
  { id: 'place',     label: '플레이스 소식',  icon: '📍' },
];

const COST_CHANNELS = ['네이버 블로그', '인스타그램', '당근마켓', '플레이스', '기타'];

let _state = {};

export function renderMarketing() {
  const now = new Date();
  _state = {
    costMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    activeTab: 'write',
    activeDraftTab: null,
    drafts: {},
    uploadedFile: null,
    generating: false,
  };

  document.getElementById('page-content').innerHTML = `
    <div class="mkt-shell">
      <div class="mkt-header">
        <h1 class="mkt-title">마케팅 에이전트</h1>
        <p class="mkt-subtitle">핏플랜PT · 채널 콘텐츠 생성 · 플레이스 순위 · 비용 관리</p>
      </div>
      <nav class="mkt-tab-nav">
        <button class="mkt-tab active" data-tab="write">✍️ 글쓰기</button>
        <button class="mkt-tab" data-tab="place">📍 플레이스</button>
        <button class="mkt-tab" data-tab="cost">💳 비용</button>
        <button class="mkt-tab" data-tab="insight">📊 인사이트</button>
      </nav>
      <div class="mkt-body">
        <div id="mkt-write"   class="mkt-panel active">${_writePanel()}</div>
        <div id="mkt-place"   class="mkt-panel">${_placePanel()}</div>
        <div id="mkt-cost"    class="mkt-panel">${_costPanelInner()}</div>
        <div id="mkt-insight" class="mkt-panel">${_insightPanel()}</div>
      </div>
    </div>
  `;

  _bindEvents();
}

/* ── Panel renderers ─────────────────────────────────── */

function _writePanel() {
  return `
    <div class="mkt-write-grid">
      <div class="mkt-card">
        <div class="mkt-card-title">콘텐츠 설정</div>

        <label class="mkt-label">주제 / 메시지</label>
        <textarea id="mkt-topic" class="mkt-textarea"
          placeholder="예: exbody 체형분석 후 PT 효과 변화, 압구정 프라이빗 스튜디오 소개..."
          rows="5"></textarea>

        <label class="mkt-label" style="margin-top:16px">채널 선택</label>
        <div class="mkt-channel-pills">
          ${CHANNELS.map(c => `
            <label class="mkt-pill-label">
              <input type="checkbox" name="mkt-channel" value="${c.id}" checked>
              ${c.icon} ${c.label}
            </label>
          `).join('')}
        </div>

        <label class="mkt-label">이미지 첨부
          <span style="color:#475569;font-weight:400"> (선택 · Vision 분석)</span>
        </label>
        <div class="mkt-upload-zone" id="mkt-upload-zone">
          <span id="mkt-upload-label">📎 클릭하여 이미지 선택</span>
        </div>
        <input type="file" id="mkt-file-input" accept="image/*" style="display:none">

        <button class="mkt-btn mkt-btn-primary" id="mkt-generate"
          style="width:100%;margin-top:16px;justify-content:center">
          ✨ 콘텐츠 생성
        </button>
      </div>

      <div class="mkt-card" id="mkt-output-card">
        <div class="mkt-empty">
          <span class="mkt-empty-icon">✨</span>
          주제를 입력하고 채널을 선택한 뒤<br>콘텐츠 생성 버튼을 누르세요
        </div>
      </div>
    </div>
  `;
}

function _placePanel() {
  const ranks = DB.mktPlaceRanksGet();
  return `
    <div class="mkt-two-col">
      <div class="mkt-card">
        <div class="mkt-card-title">순위 기록 추가</div>
        <form id="mkt-place-form">
          <label class="mkt-label">키워드</label>
          <input id="mkt-pk" class="mkt-input" placeholder="압구정PT" style="margin-bottom:12px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div>
              <label class="mkt-label">순위</label>
              <input id="mkt-pr" class="mkt-input" type="number" min="1" placeholder="1">
            </div>
            <div>
              <label class="mkt-label">날짜</label>
              <input id="mkt-pd" class="mkt-input" type="date"
                value="${new Date().toISOString().slice(0, 10)}">
            </div>
          </div>
          <label class="mkt-label">메모</label>
          <input id="mkt-pm" class="mkt-input" placeholder="메모 (선택)"
            style="margin-bottom:16px">
          <button type="submit"
            class="mkt-btn mkt-btn-primary" style="width:100%;justify-content:center">
            + 기록 추가
          </button>
        </form>
      </div>

      <div class="mkt-card">
        <div class="mkt-section-header">
          <span class="mkt-section-title">순위 기록</span>
          <span class="mkt-badge mkt-badge-purple">${ranks.length}건</span>
        </div>
        ${ranks.length === 0
          ? `<div class="mkt-empty"><span class="mkt-empty-icon">📍</span>기록된 순위가 없습니다</div>`
          : `<table class="mkt-table">
              <thead><tr>
                <th>날짜</th><th>키워드</th><th>순위</th><th>메모</th><th></th>
              </tr></thead>
              <tbody>${ranks.map(r => _placeRow(r, ranks)).join('')}</tbody>
            </table>`
        }
      </div>
    </div>
  `;
}

function _placeRow(r, all) {
  const prev = all.find(p => p.keyword === r.keyword && p.date < r.date);
  let trend = '';
  if (prev) {
    if (r.rank < prev.rank)      trend = `<span class="mkt-rank-up">▲${prev.rank - r.rank}</span>`;
    else if (r.rank > prev.rank) trend = `<span class="mkt-rank-down">▼${r.rank - prev.rank}</span>`;
    else                         trend = `<span class="mkt-rank-same">—</span>`;
  }
  return `<tr>
    <td style="color:#64748b">${r.date}</td>
    <td><strong style="color:#e2e8f0">${escHtml(r.keyword)}</strong></td>
    <td><strong style="color:#818cf8;font-size:15px">${r.rank}위</strong> ${trend}</td>
    <td style="color:#64748b">${escHtml(r.memo || '')}</td>
    <td><button class="mkt-btn mkt-btn-ghost" data-del-rank="${r.id}">✕</button></td>
  </tr>`;
}

function _costPanelInner() {
  const costs   = DB.mktCostsGet(_state.costMonth);
  const total   = costs.reduce((s, c) => s + (c.amount || 0), 0);
  const [yr, mo] = _state.costMonth.split('-');
  const byChannel = {};
  costs.forEach(c => { byChannel[c.channel] = (byChannel[c.channel] || 0) + (c.amount || 0); });

  return `
    <div class="mkt-month-nav">
      <button class="mkt-btn mkt-btn-outline" id="mkt-cost-prev">‹</button>
      <span class="mkt-month-label">${yr}년 ${parseInt(mo)}월</span>
      <button class="mkt-btn mkt-btn-outline" id="mkt-cost-next">›</button>
    </div>

    <div class="mkt-kpi-grid" style="margin-bottom:20px">
      <div class="mkt-kpi-card">
        <div class="mkt-kpi-label">총 지출</div>
        <div class="mkt-kpi-value" style="font-size:22px">${fmtMoney(total)}</div>
        <div class="mkt-kpi-sub">${costs.length}건</div>
      </div>
      ${Object.entries(byChannel).map(([ch, amt]) => `
        <div class="mkt-kpi-card">
          <div class="mkt-kpi-label">${escHtml(ch)}</div>
          <div class="mkt-kpi-value" style="font-size:18px">${fmtMoney(amt)}</div>
        </div>
      `).join('')}
    </div>

    <div class="mkt-two-col">
      <div class="mkt-card">
        <div class="mkt-card-title">비용 추가</div>
        <form id="mkt-cost-form">
          <label class="mkt-label">채널</label>
          <select id="mkt-cc" class="mkt-select" style="margin-bottom:12px">
            ${COST_CHANNELS.map(c => `<option>${c}</option>`).join('')}
          </select>
          <label class="mkt-label">금액</label>
          <input id="mkt-ca" class="mkt-input" type="number" min="0" placeholder="0"
            style="margin-bottom:12px">
          <label class="mkt-label">메모</label>
          <input id="mkt-cm" class="mkt-input" placeholder="메모 (선택)"
            style="margin-bottom:16px">
          <button type="submit"
            class="mkt-btn mkt-btn-primary" style="width:100%;justify-content:center">
            + 추가
          </button>
        </form>
      </div>

      <div class="mkt-card">
        <div class="mkt-section-header">
          <span class="mkt-section-title">지출 내역</span>
          <span class="mkt-badge mkt-badge-purple">${costs.length}건</span>
        </div>
        ${costs.length === 0
          ? `<div class="mkt-empty"><span class="mkt-empty-icon">💳</span>지출 내역이 없습니다</div>`
          : `<table class="mkt-table">
              <thead><tr>
                <th>채널</th><th>금액</th><th>메모</th><th>날짜</th><th></th>
              </tr></thead>
              <tbody>${costs.map(c => `<tr>
                <td><span class="mkt-badge mkt-badge-purple">${escHtml(c.channel)}</span></td>
                <td style="color:#e2e8f0;font-weight:600">${fmtMoney(c.amount)}</td>
                <td style="color:#64748b">${escHtml(c.memo || '')}</td>
                <td style="color:#64748b">${c.createdAt.slice(0, 10)}</td>
                <td><button class="mkt-btn mkt-btn-ghost" data-del-cost="${c.id}">✕</button></td>
              </tr>`).join('')}</tbody>
            </table>`
        }
      </div>
    </div>
  `;
}

function _insightPanel() {
  const now      = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const costs    = DB.mktCostsGet(monthKey);
  const total    = costs.reduce((s, c) => s + (c.amount || 0), 0);
  const allContent = DB.mktContentGetRecent(999);
  const recent   = allContent.slice(0, 10);
  const ranks    = DB.mktPlaceRanksGet();
  const bestRank = ranks.length ? Math.min(...ranks.map(r => r.rank)) : null;

  return `
    <div class="mkt-kpi-grid" style="margin-bottom:24px">
      <div class="mkt-kpi-card">
        <div class="mkt-kpi-label">이번 달 지출</div>
        <div class="mkt-kpi-value">${fmtMoney(total)}</div>
        <div class="mkt-kpi-sub">${costs.length}건 지출</div>
      </div>
      <div class="mkt-kpi-card">
        <div class="mkt-kpi-label">생성 콘텐츠</div>
        <div class="mkt-kpi-value">${allContent.length}</div>
        <div class="mkt-kpi-sub">총 누적</div>
      </div>
      <div class="mkt-kpi-card">
        <div class="mkt-kpi-label">최고 플레이스 순위</div>
        <div class="mkt-kpi-value">${bestRank !== null ? `${bestRank}위` : '—'}</div>
        <div class="mkt-kpi-sub">${ranks.length}건 기록</div>
      </div>
      <div class="mkt-kpi-card">
        <div class="mkt-kpi-label">비용 추적 채널</div>
        <div class="mkt-kpi-value">${new Set(costs.map(c => c.channel)).size}</div>
        <div class="mkt-kpi-sub">개 채널</div>
      </div>
    </div>

    <div class="mkt-card">
      <div class="mkt-section-header">
        <span class="mkt-section-title">최근 생성 콘텐츠</span>
      </div>
      ${recent.length === 0
        ? `<div class="mkt-empty"><span class="mkt-empty-icon">📝</span>생성된 콘텐츠가 없습니다</div>`
        : `<div style="display:flex;flex-direction:column;gap:8px">
            ${recent.map(c => `
              <div style="display:flex;align-items:flex-start;gap:12px;padding:12px;
                border-radius:8px;border:1px solid #1e293b">
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;color:#e2e8f0;font-weight:500;margin-bottom:6px">
                    ${escHtml(c.topic || '주제 없음')}
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${(c.channels || []).map(ch => {
                      const info = CHANNELS.find(x => x.id === ch);
                      return `<span class="mkt-badge mkt-badge-purple">
                        ${info ? info.icon + ' ' + info.label : escHtml(ch)}
                      </span>`;
                    }).join('')}
                  </div>
                </div>
                <div style="font-size:11px;color:#475569;white-space:nowrap">
                  ${c.createdAt.slice(0, 10)}
                </div>
                <button class="mkt-btn mkt-btn-ghost"
                  data-del-content="${c.id}">✕</button>
              </div>
            `).join('')}
          </div>`
      }
    </div>
  `;
}

/* ── Event binding ───────────────────────────────────── */

function _bindEvents() {
  // Tab switching
  document.querySelectorAll('.mkt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mkt-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.mkt-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`mkt-${btn.dataset.tab}`).classList.add('active');
      _state.activeTab = btn.dataset.tab;
    });
  });

  // Upload zone
  document.getElementById('mkt-upload-zone').addEventListener('click', () =>
    document.getElementById('mkt-file-input').click()
  );
  document.getElementById('mkt-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    _state.uploadedFile = file;
    document.getElementById('mkt-upload-zone').classList.add('has-file');
    document.getElementById('mkt-upload-label').textContent = `✅ ${file.name}`;
  });

  // Generate button
  document.getElementById('mkt-generate').addEventListener('click', _handleGenerate);

  // Place form
  document.getElementById('mkt-place-form').addEventListener('submit', e => {
    e.preventDefault();
    const keyword = document.getElementById('mkt-pk').value.trim();
    const rank    = parseInt(document.getElementById('mkt-pr').value);
    const date    = document.getElementById('mkt-pd').value;
    const memo    = document.getElementById('mkt-pm').value.trim();
    if (!keyword || !rank || !date) { showToast('⚠️ 키워드·순위·날짜를 입력하세요'); return; }
    DB.mktPlaceRanksAdd({ keyword, rank, date, memo });
    showToast('✅ 순위 기록됨');
    _rerenderPanel('place');
  });

  // Place delete (event delegation)
  document.getElementById('mkt-place').addEventListener('click', e => {
    const id = e.target.closest('[data-del-rank]')?.dataset.delRank;
    if (id && confirm('순위 기록을 삭제할까요?')) {
      DB.mktPlaceRanksDel(id);
      _rerenderPanel('place');
    }
  });

  // Cost panel — month nav + delete (event delegation)
  document.getElementById('mkt-cost').addEventListener('click', e => {
    if (e.target.id === 'mkt-cost-prev') { _adjustMonth(-1); return; }
    if (e.target.id === 'mkt-cost-next') { _adjustMonth(+1); return; }
    const id = e.target.closest('[data-del-cost]')?.dataset.delCost;
    if (id && confirm('비용 항목을 삭제할까요?')) {
      DB.mktCostsDel(id);
      _rerenderPanel('cost');
    }
  });

  // Cost form submit (event delegation — re-rendered on month nav)
  document.getElementById('mkt-cost').addEventListener('submit', e => {
    if (e.target.id !== 'mkt-cost-form') return;
    e.preventDefault();
    const channel = document.getElementById('mkt-cc').value;
    const amount  = parseInt(document.getElementById('mkt-ca').value);
    const memo    = document.getElementById('mkt-cm').value.trim();
    if (!amount || amount <= 0) { showToast('⚠️ 금액을 입력하세요'); return; }
    DB.mktCostsAdd(_state.costMonth, { channel, amount, memo });
    showToast('✅ 비용 추가됨');
    _rerenderPanel('cost');
  });

  // Insight delete (event delegation)
  document.getElementById('mkt-insight').addEventListener('click', e => {
    const id = e.target.closest('[data-del-content]')?.dataset.delContent;
    if (id && confirm('콘텐츠 기록을 삭제할까요?')) {
      DB.mktContentDel(id);
      _rerenderPanel('insight');
    }
  });
}

/* ── Helpers ─────────────────────────────────────────── */

function _adjustMonth(delta) {
  const [yr, mo] = _state.costMonth.split('-').map(Number);
  const d = new Date(yr, mo - 1 + delta, 1);
  _state.costMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  _rerenderPanel('cost');
}

function _rerenderPanel(tab) {
  const el = document.getElementById(`mkt-${tab}`);
  if (!el) return;
  if (tab === 'place')   el.innerHTML = _placePanel();
  if (tab === 'cost')    el.innerHTML = _costPanelInner();
  if (tab === 'insight') el.innerHTML = _insightPanel();
}

/* ── Writing agent ───────────────────────────────────── */

async function _handleGenerate() {
  const topic    = document.getElementById('mkt-topic').value.trim();
  const selected = [...document.querySelectorAll('[name="mkt-channel"]:checked')]
    .map(c => c.value);

  if (!topic)            { showToast('⚠️ 주제를 입력하세요'); return; }
  if (!selected.length)  { showToast('⚠️ 채널을 1개 이상 선택하세요'); return; }
  if (_state.generating) return;

  _state.generating = true;
  const btn = document.getElementById('mkt-generate');
  btn.disabled = true;
  btn.innerHTML = '<span class="mkt-spinner"></span> 생성 중...';

  const output = document.getElementById('mkt-output-card');
  output.innerHTML = `
    <div style="text-align:center;padding:60px;color:#64748b">
      <span class="mkt-spinner" style="width:28px;height:28px;border-width:3px"></span>
      <div style="margin-top:16px;font-size:13px">Claude가 콘텐츠를 생성하고 있습니다...</div>
    </div>`;

  try {
    const system = `당신은 핏플랜PT 마케팅 콘텐츠 전문 에이전트입니다.

[스튜디오 정보]
- 이름: 핏플랜PT
- 위치: 서울 강남구 압구정 로데오 2층, 30평대 프라이빗 PT 스튜디오
- 타겟: 30대 여성, 중장년 여성 (40~60대)
- 브랜드 키워드: Private · Expert · Serene
- 차별화: exbody 정밀 체형분석 · 1:1 프라이빗 · 발렛파킹 · 샤워시설 · 전문 강사진

[필수 규칙]
- 금지: 살빼기/땀빼기 → 체형교정/체성분 개선으로 대체
- 금지: 저렴한/싼/할인/이벤트가격 → 언급 자체 금지
- "다이어트" 단독 사용 금지 → "다이어트가 아닌 체형교정"으로 재프레이밍
- 경쟁사 이름 직접 언급 절대 금지
- 브랜드 톤: 전문적·신뢰감·프리미엄. 저렴한 느낌 절대 금지
- 모든 콘텐츠에 차별화 포인트 최소 1개 이상 포함

[채널별 규칙]
- 네이버 블로그(blog): 2500~3000자, 구조: 도입부(문제제기) → 본문(H2/H3 소제목) → 마무리(CTA), SEO 키워드 3회 이상(압구정PT·강남퍼스널트레이닝·체형교정)
- 인스타그램(instagram): 300자 내외, 감성적·애스피레이셔널, 해시태그 8~12개 (고정 5: #압구정PT #강남퍼스널트레이닝 #핏플랜PT #체형교정 #프라이빗PT)
- 당근마켓(karrot): 300자 이내, 신뢰감 있는 전문가 톤, 가격 직접 언급 금지
- 플레이스 소식(place): 200자 이내, 방문 유도 CTA 필수 ("예약 문의는 ▶" 등)

요청된 채널만 생성하고, 각 채널을 반드시 아래 형식으로 구분하세요:
=== 채널명 ===
(콘텐츠)`;

    const channelNames = selected
      .map(id => CHANNELS.find(c => c.id === id)?.label).join(', ');
    const userMsg = `주제: ${topic}\n생성 채널: ${channelNames}`;

    let text;
    if (_state.uploadedFile) {
      const { base64, mediaType } = await fileToBase64(_state.uploadedFile);
      text = await callClaudeVision(base64, mediaType, userMsg, system);
    } else {
      text = await callClaude({ system, messages: [{ role: 'user', content: userMsg }] });
    }

    // Parse by channel label separator
    const drafts = {};
    selected.forEach(id => {
      const label = CHANNELS.find(c => c.id === id)?.label;
      const re    = new RegExp(`===\\s*${label}\\s*===([\\s\\S]*?)(?====|$)`);
      const m     = text.match(re);
      drafts[id]  = m ? m[1].trim() : text.trim();
    });

    _state.drafts        = drafts;
    _state.activeDraftTab = selected[0];

    DB.mktContentAdd({ topic, channels: selected, drafts });
    _renderDraftOutput(selected);
    showToast('✅ 콘텐츠 생성 완료');

  } catch (err) {
    console.error(err);
    showToast('❌ 생성 실패 — API 키 또는 네트워크를 확인하세요');
    document.getElementById('mkt-output-card').innerHTML = `
      <div class="mkt-empty">
        <span class="mkt-empty-icon">❌</span>
        생성 실패<br>
        <span style="font-size:12px;color:#475569">${escHtml(err.message)}</span>
      </div>`;
  } finally {
    _state.generating = false;
    const b = document.getElementById('mkt-generate');
    if (b) { b.disabled = false; b.innerHTML = '✨ 콘텐츠 생성'; }
  }
}

function _renderDraftOutput(channels) {
  const output = document.getElementById('mkt-output-card');
  if (!output) return;
  const activeId = _state.activeDraftTab || channels[0];

  output.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <span class="mkt-card-title" style="margin:0">생성된 콘텐츠</span>
      <button class="mkt-btn mkt-btn-outline" id="mkt-copy-btn"
        style="font-size:12px;padding:6px 12px">📋 복사</button>
    </div>
    <div class="mkt-draft-tabs">
      ${channels.map(id => {
        const ch = CHANNELS.find(c => c.id === id);
        return `<button class="mkt-draft-tab ${id === activeId ? 'active' : ''}"
          data-draft-tab="${id}">${ch.icon} ${ch.label}</button>`;
      }).join('')}
    </div>
    <div id="mkt-draft-content"
      style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:16px;max-height:480px;overflow-y:auto">
      <pre class="mkt-pre">${escHtml(_state.drafts[activeId] || '')}</pre>
    </div>
  `;

  output.querySelectorAll('[data-draft-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      output.querySelectorAll('[data-draft-tab]').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      _state.activeDraftTab = btn.dataset.draftTab;
      output.querySelector('#mkt-draft-content').innerHTML =
        `<pre class="mkt-pre">${escHtml(_state.drafts[btn.dataset.draftTab] || '')}</pre>`;
    });
  });

  document.getElementById('mkt-copy-btn').addEventListener('click', () => {
    const text = _state.drafts[_state.activeDraftTab] || '';
    navigator.clipboard.writeText(text)
      .then(() => showToast('✅ 클립보드에 복사됨'))
      .catch(() => showToast('❌ 복사 실패'));
  });
}
