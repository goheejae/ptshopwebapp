import DB from '../db.js';
import { showToast, escHtml, fmtMoney } from '../utils.js';
import { callClaude, callClaudeVision, fileToBase64 } from '../api.js';

const CHANNELS = [
  { id: 'blog',      label: '네이버 블로그', icon: '📝' },
  { id: 'instagram', label: '인스타그램',     icon: '📸' },
  { id: 'reels',     label: '인스타 릴스',    icon: '🎬' },
  { id: 'karrot',    label: '당근마켓',       icon: '🥕' },
  { id: 'place',     label: '플레이스 소식',  icon: '📍' },
  { id: 'google',    label: '구글 비즈니스',  icon: '🗺️' },
];

const COST_CHANNELS = ['네이버 블로그', '인스타그램', '당근마켓', '플레이스', '기타'];

// Sensor 검증 상수
const SENSOR_FORBIDDEN = ['살빼기', '땀빼기', '저렴한', '할인', '이벤트가격'];
const SENSOR_BRAND_KW  = ['핏플랜', '압구정PT', '압구정 PT', '체형교정', '프라이빗', 'exbody', 'EXBODY'];
const SENSOR_SEO_KW    = ['압구정PT', '압구정 PT', '강남퍼스널트레이닝', '강남 퍼스널트레이닝', '체형교정'];
const SENSOR_LENGTH    = { blog: { min: 2500, max: 3000, label: '2500~3000자' }, instagram: { max: 300, label: '300자 이내' }, reels: { max: 150, label: '150자 이내' }, karrot: { max: 300, label: '300자 이내' }, place: { max: 200, label: '200자 이내' }, google: { max: 300, label: '300자 이내' } };

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
    aiHistory:    [],
    briefingDone: false,
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
        <button class="mkt-tab" data-tab="ai">🤖 마케팅 AI</button>
      </nav>
      <div class="mkt-body">
        <div id="mkt-write"   class="mkt-panel active">${_writePanel()}</div>
        <div id="mkt-place"   class="mkt-panel">${_placePanel()}</div>
        <div id="mkt-cost"    class="mkt-panel">${_costPanelInner()}</div>
        <div id="mkt-insight" class="mkt-panel">${_insightPanel()}</div>
        <div id="mkt-ai"      class="mkt-panel">${_aiPanel()}</div>
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
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
          <button class="mkt-btn mkt-btn-ghost mkt-preset" style="font-size:11px;padding:4px 10px"
            data-preset="exbody 체형분석 전후 변화 사례 — 체성분·자세 개선 스토리">📊 체형 사례</button>
          <button class="mkt-btn mkt-btn-ghost mkt-preset" style="font-size:11px;padding:4px 10px"
            data-preset="압구정 프라이빗 PT 스튜디오 시설 소개 — 30평대 프리미엄 공간·exbody·발렛파킹">🏢 시설 소개</button>
          <button class="mkt-btn mkt-btn-ghost mkt-preset" style="font-size:11px;padding:4px 10px"
            data-preset="1:1 퍼스널트레이닝 효과 — 자세교정·체성분 개선·운동 습관 만들기">💪 PT 효과</button>
          <button class="mkt-btn mkt-btn-ghost mkt-preset" style="font-size:11px;padding:4px 10px"
            data-preset="신규 회원 체험 세션 안내 — 첫 방문 exbody 분석 + 무료 체험 PT">🎯 신규 모집</button>
        </div>
        <textarea id="mkt-topic" class="mkt-textarea"
          placeholder="예: exbody 체형분석 후 PT 효과 변화, 압구정 프라이빗 스튜디오 소개..."
          rows="4"></textarea>

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
    <div class="mkt-card" style="margin-bottom:20px">
      <div class="mkt-card-title">📈 순위 추이</div>
      ${_svgRankChart(ranks)}
    </div>

    <div class="mkt-two-col" style="margin-bottom:20px">
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
          <input id="mkt-pm" class="mkt-input" placeholder="메모 (선택)" style="margin-bottom:16px">
          <button type="submit" class="mkt-btn mkt-btn-primary" style="width:100%;justify-content:center">+ 기록 추가</button>
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
              <thead><tr><th>날짜</th><th>키워드</th><th>순위</th><th>메모</th><th></th></tr></thead>
              <tbody>${ranks.map(r => _placeRow(r, ranks)).join('')}</tbody>
            </table>`
        }
      </div>
    </div>

    <div class="mkt-card">
      <div class="mkt-card-title">🤖 AI 플레이스 도구</div>
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <button class="mkt-btn mkt-btn-primary place-tool-btn" data-tool="news">📢 소식 문구</button>
        <button class="mkt-btn mkt-btn-outline place-tool-btn" data-tool="review">💬 리뷰 답글</button>
        <button class="mkt-btn mkt-btn-outline place-tool-btn" data-tool="thumb">🖼 썸네일 멘트</button>
      </div>
      <div id="place-tool-news" class="place-tool-section">
        <textarea id="place-news-input" class="mkt-textarea" rows="3"
          placeholder="소식 주제 (예: 5월 신규 회원 모집, exbody 체형분석 도입)"></textarea>
        <button class="mkt-btn mkt-btn-primary" id="place-news-gen" style="margin-top:10px">✨ 문구 생성</button>
      </div>
      <div id="place-tool-review" class="place-tool-section" style="display:none">
        <textarea id="place-review-input" class="mkt-textarea" rows="4"
          placeholder="리뷰 내용을 붙여넣으세요..."></textarea>
        <button class="mkt-btn mkt-btn-primary" id="place-review-gen" style="margin-top:10px">✨ 답글 초안 생성</button>
      </div>
      <div id="place-tool-thumb" class="place-tool-section" style="display:none">
        <textarea id="place-thumb-input" class="mkt-textarea" rows="3"
          placeholder="이미지 컨텍스트 (예: 압구정 로데오 프라이빗 스튜디오 내부, exbody 분석 중)"></textarea>
        <button class="mkt-btn mkt-btn-primary" id="place-thumb-gen" style="margin-top:10px">✨ 멘트 추천</button>
      </div>
      <div id="place-ai-output" style="display:none;margin-top:16px;background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:16px;position:relative">
        <button id="place-ai-copy" class="mkt-btn mkt-btn-ghost" style="position:absolute;top:10px;right:10px;font-size:11px">📋 복사</button>
        <pre class="mkt-pre" id="place-ai-text" style="margin:0;white-space:pre-wrap;padding-right:60px"></pre>
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

function _svgRankChart(ranks) {
  const keywords = [...new Set(ranks.map(r => r.keyword))];
  if (!keywords.length)
    return `<div class="mkt-empty" style="padding:24px"><span class="mkt-empty-icon">📈</span>순위 기록이 없습니다</div>`;
  const dates = [...new Set(ranks.map(r => r.date))].sort();
  if (dates.length < 2)
    return `<div style="color:#64748b;font-size:13px;padding:12px;text-align:center">날짜가 2개 이상 기록되면 추이 그래프가 표시됩니다</div>`;

  const colors = ['#818cf8','#34d399','#f97316','#f43f5e','#60a5fa'];
  const W=560,H=180,pL=36,pR=16,pT=12,pB=28,cW=W-pL-pR,cH=H-pT-pB;
  const allR = ranks.map(r=>r.rank);
  const rMin=Math.min(...allR), rMax=Math.max(...allR), rRange=rMax-rMin||1;
  const xOf = d => pL+(dates.indexOf(d)/(dates.length-1))*cW;
  const yOf = r => pT+((r-rMin)/rRange)*cH;

  const grid = [0,1,2,3,4].map(i => {
    const rank=Math.round(rMin+(i/4)*rRange), y=yOf(rank);
    return `<line x1="${pL}" y1="${y}" x2="${W-pR}" y2="${y}" stroke="#1e293b" stroke-width="1"/>
      <text x="${pL-4}" y="${y+4}" text-anchor="end" fill="#475569" font-size="9">${rank}</text>`;
  });
  const step=Math.max(1,Math.floor(dates.length/5));
  const xLbls=dates.filter((_,i)=>i%step===0||i===dates.length-1)
    .map(d=>`<text x="${xOf(d)}" y="${H-4}" text-anchor="middle" fill="#475569" font-size="9">${d.slice(5)}</text>`);
  const series=keywords.map((kw,ki)=>{
    const col=colors[ki%colors.length];
    const pts=ranks.filter(r=>r.keyword===kw).sort((a,b)=>a.date.localeCompare(b.date));
    const poly=pts.length>=2?`<polyline points="${pts.map(r=>`${xOf(r.date)},${yOf(r.rank)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>`:'';
    const dots=pts.map(r=>`<circle cx="${xOf(r.date)}" cy="${yOf(r.rank)}" r="4" fill="${col}"><title>${kw} ${r.date}: ${r.rank}위</title></circle>`).join('');
    return poly+dots;
  });
  const legend=keywords.map((kw,ki)=>`<span style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;font-size:12px"><span style="width:18px;height:3px;background:${colors[ki%colors.length]};border-radius:2px;display:inline-block"></span><span style="color:#cbd5e1">${escHtml(kw)}</span></span>`).join('');
  return `<div style="margin-bottom:8px;display:flex;flex-wrap:wrap">${legend}</div>
    <div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:280px;display:block">
      ${grid.join('')}${xLbls.join('')}${series.join('')}
    </svg></div>`;
}

function _svgCostChart() {
  const now=new Date();
  const months=Array.from({length:6},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-(5-i),1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;});
  const data=months.map(m=>({m,total:DB.mktCostsGet(m).reduce((s,c)=>s+(c.amount||0),0)}));
  if(!data.some(d=>d.total>0))
    return `<div class="mkt-empty" style="padding:24px"><span class="mkt-empty-icon">💳</span>비용 데이터가 없습니다</div>`;
  const W=560,H=140,pL=52,pR=16,pT=12,pB=28,cW=W-pL-pR,cH=H-pT-pB;
  const maxV=Math.max(...data.map(d=>d.total),1);
  const barW=cW/6*0.6, gap=cW/6;
  const bars=data.map((d,i)=>{
    const bH=(d.total/maxV)*cH||0, x=pL+i*gap+(gap-barW)/2, y=pT+cH-bH;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(bH,0).toFixed(1)}" fill="#818cf8" rx="3" opacity="0.85"/>
      <text x="${(x+barW/2).toFixed(1)}" y="${H-4}" text-anchor="middle" fill="#475569" font-size="9">${d.m.slice(5)}월</text>
      ${d.total>0?`<text x="${(x+barW/2).toFixed(1)}" y="${(y-4).toFixed(1)}" text-anchor="middle" fill="#a5b4fc" font-size="9">${(d.total/10000).toFixed(0)}만</text>`:''}`;
  });
  const yLbls=[0,0.5,1].map(r=>{const v=maxV*r,y=pT+cH-r*cH;return `<text x="${pL-4}" y="${y+4}" text-anchor="end" fill="#475569" font-size="9">${(v/10000).toFixed(0)}만</text><line x1="${pL}" y1="${y}" x2="${W-pR}" y2="${y}" stroke="#1e293b" stroke-width="1"/>`;});
  return `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:280px;display:block">
    ${yLbls.join('')}${bars.join('')}
  </svg></div>`;
}

function _detectRenewal() {
  const now=new Date();
  const allSales=[];
  for(let i=0;i<8;i++){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const mk=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;allSales.push(...DB.salesLogsGetByMonth(mk));}
  const byMember={};
  allSales.forEach(s=>{if(!s.memberName||!s.date)return;if(!byMember[s.memberName]||s.date>byMember[s.memberName].date)byMember[s.memberName]=s;});
  return Object.values(byMember).filter(s=>{const diff=(now-new Date(s.date))/86400000;return diff>=75&&diff<=110;}).sort((a,b)=>a.date.localeCompare(b.date));
}

function _renewalHtml(candidates) {
  if(!candidates.length) return `<div style="color:#64748b;font-size:13px;padding:12px">재등록 임박 회원 없음</div>`;
  return `<div style="display:flex;flex-direction:column;gap:8px">${candidates.map(s=>{
    const days=Math.floor((new Date()-new Date(s.date))/86400000);
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:8px;border:1px solid #1e293b">
      <div><strong style="color:#e2e8f0">${escHtml(s.memberName)}</strong><span style="color:#64748b;font-size:12px;margin-left:8px">등록 ${days}일 경과</span></div>
      <button class="mkt-btn mkt-btn-outline renewal-sms-btn" data-member="${escHtml(s.memberName)}" data-date="${s.date}" style="font-size:12px;padding:5px 10px">📱 문자 초안</button>
    </div>`;
  }).join('')}</div>`;
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
  const ranks    = DB.mktPlaceRanksGet();
  const bestRank = ranks.length ? Math.min(...ranks.map(r => r.rank)) : null;
  const renewals = _detectRenewal();

  return `
    <div class="mkt-kpi-grid" style="margin-bottom:20px">
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
        <div class="mkt-kpi-label">재등록 임박</div>
        <div class="mkt-kpi-value">${renewals.length}명</div>
        <div class="mkt-kpi-sub">75~110일 경과</div>
      </div>
    </div>

    <div class="mkt-card" style="margin-bottom:20px">
      <div class="mkt-card-title">월별 마케팅 비용 추이</div>
      ${_svgCostChart()}
    </div>

    <div class="mkt-card" style="margin-bottom:20px">
      <div class="mkt-section-header">
        <span class="mkt-section-title">📊 AI 인사이트 & 일일 브리핑</span>
        <button class="mkt-btn mkt-btn-primary" id="insight-ai-gen"
          style="font-size:12px;padding:6px 14px">✨ 분석</button>
      </div>
      <div id="insight-ai-output">
        <div class="mkt-empty" style="padding:32px">
          <span class="mkt-empty-icon">🧠</span>
          매출·마케팅·상담 데이터를 종합 분석합니다
        </div>
      </div>
    </div>

    <div class="mkt-card" style="margin-bottom:20px">
      <div class="mkt-section-header">
        <span class="mkt-section-title">🔔 재등록 임박 회원</span>
        <span class="mkt-badge mkt-badge-purple">${renewals.length}명</span>
      </div>
      <div id="renewal-sms-output" style="display:none;margin-bottom:12px;
        background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:14px">
        <pre class="mkt-pre" id="renewal-sms-text" style="white-space:pre-wrap;margin:0"></pre>
      </div>
      ${_renewalHtml(renewals)}
    </div>

    <div class="mkt-card">
      <div class="mkt-section-header">
        <span class="mkt-section-title">최근 생성 콘텐츠</span>
      </div>
      ${allContent.slice(0, 10).length === 0
        ? `<div class="mkt-empty"><span class="mkt-empty-icon">📝</span>생성된 콘텐츠가 없습니다</div>`
        : `<div style="display:flex;flex-direction:column;gap:8px">
            ${allContent.slice(0, 10).map(c => `
              <div style="display:flex;align-items:flex-start;gap:12px;padding:12px;border-radius:8px;border:1px solid #1e293b">
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;color:#e2e8f0;font-weight:500;margin-bottom:6px">${escHtml(c.topic || '주제 없음')}</div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${(c.channels || []).map(ch => {
                      const info = CHANNELS.find(x => x.id === ch);
                      return `<span class="mkt-badge mkt-badge-purple">${info ? info.icon + ' ' + info.label : escHtml(ch)}</span>`;
                    }).join('')}
                  </div>
                </div>
                <div style="font-size:11px;color:#475569;white-space:nowrap">${c.createdAt.slice(0, 10)}</div>
                <button class="mkt-btn mkt-btn-ghost" data-del-content="${c.id}">✕</button>
              </div>
            `).join('')}
          </div>`
      }
    </div>
  `;
}

function _aiPanel() {
  return `
    <div class="mkt-ai-shell">
      <div class="mkt-ai-messages" id="mkt-ai-messages">
        <div class="mkt-ai-row mkt-ai-row--bot">
          <div class="mkt-ai-avatar">📣</div>
          <div class="mkt-ai-bubble">
            <strong>핏마스터</strong>입니다.<br>
            PT·필라테스 전문 마케터로 현황 분석·채널 전략·콘텐츠 방향 잡아드립니다.<br><br>
            <span style="color:#475569;font-size:12px">
              "이번 달 뭐가 문제야?" · "플레이스 순위 왜 안 오르지?" · "당근 효과 있어?"
            </span>
          </div>
        </div>
      </div>
      <div class="mkt-ai-input-row">
        <textarea id="mkt-ai-input" class="mkt-input mkt-ai-input"
          placeholder="마케팅 관련 질문을 입력하세요..." rows="2"></textarea>
        <button class="mkt-btn mkt-btn-primary" id="mkt-ai-send" style="padding:10px 20px">전송</button>
      </div>
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
      if (btn.dataset.tab === 'insight' && !_state.briefingDone) {
        _state.briefingDone = true;
        setTimeout(_handleInsightAi, 200);
      }
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

  // Preset topic buttons
  document.getElementById('mkt-write').addEventListener('click', e => {
    const preset = e.target.closest('.mkt-preset');
    if (preset) document.getElementById('mkt-topic').value = preset.dataset.preset;
  });

  // Generate button
  document.getElementById('mkt-generate').addEventListener('click', _handleGenerate);

  // Place form (event delegation — re-rendered after add)
  document.getElementById('mkt-place').addEventListener('submit', e => {
    if (e.target.id !== 'mkt-place-form') return;
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

  // Place click delegation (delete rank + AI tool tabs + generate + copy)
  document.getElementById('mkt-place').addEventListener('click', e => {
    const delId = e.target.closest('[data-del-rank]')?.dataset.delRank;
    if (delId && confirm('순위 기록을 삭제할까요?')) {
      DB.mktPlaceRanksDel(delId);
      _rerenderPanel('place');
      return;
    }
    // AI tool tab switching
    const toolBtn = e.target.closest('.place-tool-btn');
    if (toolBtn) {
      document.querySelectorAll('.place-tool-btn').forEach(b => b.className = 'mkt-btn mkt-btn-outline place-tool-btn');
      toolBtn.className = 'mkt-btn mkt-btn-primary place-tool-btn';
      document.querySelectorAll('.place-tool-section').forEach(s => s.style.display = 'none');
      document.getElementById(`place-tool-${toolBtn.dataset.tool}`).style.display = '';
      return;
    }
    // Generate buttons
    if (e.target.id === 'place-news-gen')   { _handlePlaceAi('news',   document.getElementById('place-news-input').value);   return; }
    if (e.target.id === 'place-review-gen') { _handlePlaceAi('review', document.getElementById('place-review-input').value); return; }
    if (e.target.id === 'place-thumb-gen')  { _handlePlaceAi('thumb',  document.getElementById('place-thumb-input').value);  return; }
    // Copy
    if (e.target.id === 'place-ai-copy') {
      navigator.clipboard.writeText(document.getElementById('place-ai-text').textContent || '')
        .then(() => showToast('✅ 복사됨')).catch(() => showToast('❌ 복사 실패'));
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

  // Insight click delegation (delete content + AI generate + renewal SMS)
  document.getElementById('mkt-insight').addEventListener('click', e => {
    const delId = e.target.closest('[data-del-content]')?.dataset.delContent;
    if (delId && confirm('콘텐츠 기록을 삭제할까요?')) {
      DB.mktContentDel(delId);
      _rerenderPanel('insight');
      return;
    }
    if (e.target.id === 'insight-ai-gen') { _handleInsightAi(); return; }
    const smsBtn = e.target.closest('.renewal-sms-btn');
    if (smsBtn) _handleRenewalSms(smsBtn.dataset.member, smsBtn.dataset.date);
  });

  // Marketing AI send
  document.getElementById('mkt-ai-send').addEventListener('click', _handleMktAiChat);
  document.getElementById('mkt-ai-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _handleMktAiChat(); }
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
- 경쟁사 이름 직접 언급 절대 금지
- 브랜드 톤: 전문적·신뢰감·프리미엄. 저렴한 느낌 절대 금지
- 모든 콘텐츠에 차별화 포인트 최소 1개 이상 포함

[채널별 규칙]
- 네이버 블로그(blog): 2500~3000자, 구조: 도입부(문제제기) → 본문(H2/H3 소제목) → 마무리(CTA), SEO 키워드 3회 이상(압구정PT·강남퍼스널트레이닝·체형교정), 내부링크 삽입 위치를 [INTERNAL_LINK: "관련 글 제목"] 형식으로 표시
- 인스타그램(instagram): 300자 내외, 감성적·애스피레이셔널, 저장 유도 문구 포함, 해시태그 8~12개 (고정 5: #압구정PT #강남퍼스널트레이닝 #핏플랜PT #체형교정 #프라이빗PT)
- 인스타 릴스(reels): 훅 문장(첫 1초, 10자 내외로 강렬하게) + 본문 3~5단계 스토리 구성 + CTA. 자막용 텍스트 형식. 캡션 150자 이내. 해시태그 8~12개.
- 당근마켓(karrot): 300자 이내, 신뢰감 있는 전문가 톤, 가격 직접 언급 금지, 무료 체험 세션·상담 예약 CTA 허용
- 플레이스 소식(place): 200자 이내, 방문 유도 CTA 필수 ("예약 문의는 ▶" 등)
- 구글 비즈니스(google): 300자 이내, 한국어 위주 + 영문 키워드 병기 가능, 외국인 고객 고려. 방문 유도 CTA 필수.

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

/* ── Marketing AI chat ───────────────────────────────── */

function _appendMktAiMsg(role, html, id) {
  const msgs = document.getElementById('mkt-ai-messages');
  if (!msgs) return;
  const row = document.createElement('div');
  row.className = `mkt-ai-row mkt-ai-row--${role}`;
  if (id) row.id = id;
  row.innerHTML = role === 'bot'
    ? `<div class="mkt-ai-avatar">📣</div><div class="mkt-ai-bubble">${html}</div>`
    : `<div class="mkt-ai-bubble mkt-ai-bubble--user">${html}</div>`;
  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

function _buildMktAiSystemPrompt() {
  const now       = new Date();
  const today     = now.toISOString().slice(0, 10);
  const monthKey  = today.slice(0, 7);
  const costs     = DB.mktCostsGet(monthKey);
  const total     = costs.reduce((s, c) => s + (c.amount || 0), 0);
  const ranks     = DB.mktPlaceRanksGet().slice(0, 10);
  const content   = DB.mktContentGetRecent(10);
  const byChannel = {};
  costs.forEach(c => { byChannel[c.channel] = (byChannel[c.channel] || 0) + (c.amount || 0); });

  return `너는 핏마스터 — 헬스장·피티샵·필라테스 전문 마케터 경력 15년. 핏플랜PT 전담.

[말투 규칙]
- 짧고 단도직입적으로. "~것 같습니다" 금지.
- 숫자와 행동 중심으로 답변.
- 문제 발견 시 즉시 직접 지적. 칭찬 먼저 하지 말 것.
- 필요하면 적극적으로 반문해서 상황 파악.

[스튜디오]
핏플랜PT / 압구정 로데오 2층 30평대 프라이빗 PT / 타겟: 30~60대 여성
차별화: exbody 정밀 체형분석 · 1:1 프라이빗 · 발렛파킹
채널: 네이버 블로그 · 인스타(피드+릴스) · 당근마켓 · 네이버 플레이스 · 구글 비즈니스

[이번 달(${monthKey}) 마케팅 현황]
총 비용: ${total.toLocaleString()}원 (${costs.length}건)
채널별: ${Object.entries(byChannel).map(([ch, amt]) => `${ch} ${amt.toLocaleString()}원`).join(' / ') || '없음'}

[네이버 플레이스 순위]
${ranks.length ? ranks.map(r => `${r.date} "${r.keyword}" ${r.rank}위`).join('\n') : '기록 없음'}

[최근 콘텐츠]
${content.length ? content.map(c => `${c.createdAt.slice(0, 10)} [${(c.channels || []).join('/')}] ${c.topic || ''}`).join('\n') : '없음'}

[금기어] 살빼기 / 저렴한 / 할인 / 이벤트가격 — 절대 제안하지 말 것.`;
}

async function _handleMktAiChat() {
  const input = document.getElementById('mkt-ai-input');
  const msg   = input.value.trim();
  if (!msg || _state.generating) return;

  input.value = '';
  _appendMktAiMsg('user', escHtml(msg));
  _state.aiHistory.push({ role: 'user', content: msg });

  const sendBtn = document.getElementById('mkt-ai-send');
  sendBtn.disabled = true;
  sendBtn.textContent = '...';

  const loadId = 'mkt-ai-load-' + Date.now();
  _appendMktAiMsg('bot', '<span class="mkt-spinner" style="width:16px;height:16px;border-width:2px;vertical-align:middle"></span> 분석 중...', loadId);

  try {
    const text = await callClaude({
      system:   _buildMktAiSystemPrompt(),
      messages: _state.aiHistory,
    });
    document.getElementById(loadId)?.remove();
    _state.aiHistory.push({ role: 'assistant', content: text });
    _appendMktAiMsg('bot', escHtml(text).replace(/\n/g, '<br>'));
  } catch (err) {
    document.getElementById(loadId)?.remove();
    _appendMktAiMsg('bot', '❌ 오류가 발생했습니다. API 키 또는 네트워크를 확인하세요.');
    console.error(err);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = '전송';
  }
}

function _runSensor(channelId, text) {
  const results = [];

  // 1. 금지 단어
  const found = SENSOR_FORBIDDEN.filter(w => text.includes(w));
  const forbidOk  = found.length === 0;
  results.push({
    label: '금지 단어',
    ok:    forbidOk,
    detail: forbidOk ? '없음' : `발견: ${found.join(', ')}`,
  });

  // 2. 브랜드 키워드
  const hasBrand = SENSOR_BRAND_KW.some(kw => text.toLowerCase().includes(kw.toLowerCase()));
  results.push({
    label: '브랜드 키워드',
    ok:    hasBrand,
    detail: hasBrand ? '포함' : '미포함 — 핏플랜/압구정PT/체형교정 등 추가 필요',
  });

  // 3. 분량
  const rule = SENSOR_LENGTH[channelId];
  if (rule) {
    const len   = text.length;
    const lenOk = (!rule.min || len >= rule.min) && len <= rule.max;
    results.push({ label: '분량', ok: lenOk, detail: `${len.toLocaleString()}자 (기준: ${rule.label})` });
  }

  // 4. SEO 키워드 (블로그만)
  if (channelId === 'blog') {
    const seoFound = SENSOR_SEO_KW.filter(kw => text.includes(kw));
    const seoOk    = seoFound.length >= 2;
    results.push({
      label: 'SEO 키워드',
      ok:    seoOk,
      detail: seoOk ? `포함 (${seoFound.join(' · ')})` : '부족 — 압구정PT · 강남퍼스널트레이닝 · 체형교정 각 1회 이상',
    });
  }

  return results;
}

function _sensorHtml(channelId) {
  const results = _runSensor(channelId, _state.drafts[channelId] || '');
  const allOk   = results.every(r => r.ok);
  return `
    <div class="mkt-sensor">
      <div class="mkt-sensor-header">
        <span class="mkt-sensor-title">🔍 Sensor 검증</span>
        <span class="mkt-badge ${allOk ? 'mkt-badge-green' : 'mkt-badge-warn'}">
          ${allOk ? '✅ 통과' : '⚠️ 수정 필요'}
        </span>
      </div>
      <div class="mkt-sensor-list">
        ${results.map(r => `
          <div class="mkt-sensor-item">
            <span>${r.ok ? '✅' : '❌'}</span>
            <span class="mkt-sensor-label">${r.label}</span>
            <span class="mkt-sensor-detail ${r.ok ? '' : 'fail'}">${escHtml(r.detail)}</span>
          </div>`).join('')}
      </div>
    </div>`;
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
      style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:16px;max-height:340px;overflow-y:auto;margin-bottom:12px">
      <pre class="mkt-pre">${escHtml(_state.drafts[activeId] || '')}</pre>
    </div>
    <div id="mkt-sensor">${_sensorHtml(activeId)}</div>
  `;

  output.querySelectorAll('[data-draft-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      output.querySelectorAll('[data-draft-tab]').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const id = btn.dataset.draftTab;
      _state.activeDraftTab = id;
      output.querySelector('#mkt-draft-content').innerHTML =
        `<pre class="mkt-pre">${escHtml(_state.drafts[id] || '')}</pre>`;
      output.querySelector('#mkt-sensor').innerHTML = _sensorHtml(id);
    });
  });

  document.getElementById('mkt-copy-btn').addEventListener('click', () => {
    const text = _state.drafts[_state.activeDraftTab] || '';
    navigator.clipboard.writeText(text)
      .then(() => showToast('✅ 클립보드에 복사됨'))
      .catch(() => showToast('❌ 복사 실패'));
  });
}

/* ── Place AI tools ──────────────────────────────────── */

async function _handlePlaceAi(type, input) {
  if (!input.trim()) { showToast('⚠️ 내용을 입력하세요'); return; }
  const output = document.getElementById('place-ai-output');
  const textEl = document.getElementById('place-ai-text');
  output.style.display = 'block';
  textEl.textContent = '생성 중...';

  const sys = {
    news:   `핏플랜PT 네이버 플레이스 소식 문구 전문가야. 200자 이내, 방문 유도 CTA 필수. 브랜드 톤: 전문적·신뢰감·프리미엄. 스튜디오: 서울 강남구 압구정 로데오 2층 30평대 프라이빗 PT. 차별화: exbody 체형분석·1:1 프라이빗·발렛파킹. 금지: 저렴한/할인/이벤트가격/살빼기.`,
    review: `핏플랜PT 리뷰 답글 전문가야. 진심 어린 감사 + 브랜드 포지셔닝 자연스럽게. 100~150자 내외. 브랜드 톤: 전문적·따뜻한 신뢰감. 과도한 광고 문구 금지.`,
    thumb:  `핏플랜PT 네이버 플레이스 썸네일 멘트 전문가야. 이미지 컨텍스트를 받아 3가지 옵션 제공. 각 20자 내외. 감성적이고 프리미엄한 톤. 금지: 저렴한/할인/이벤트.`,
  };
  const prompt = {
    news:   `소식 주제: ${input}\n\n네이버 플레이스 소식 문구를 작성해줘. 200자 이내, CTA 포함.`,
    review: `다음 리뷰에 대한 답글 초안을 작성해줘:\n\n${input}`,
    thumb:  `이미지 컨텍스트: ${input}\n\n썸네일 멘트 3가지 옵션을 제안해줘. 각 20자 내외.`,
  };

  try {
    const text = await callClaude({ system: sys[type], messages: [{ role: 'user', content: prompt[type] }] });
    textEl.textContent = text;
  } catch (err) {
    textEl.textContent = '❌ 생성 실패 — API 키 또는 네트워크 확인';
    console.error(err);
  }
}

/* ── Insight AI & Renewal SMS ────────────────────────── */

async function _handleInsightAi() {
  const output = document.getElementById('insight-ai-output');
  if (!output) return;
  output.innerHTML = `<div style="text-align:center;padding:32px;color:#64748b">
    <span class="mkt-spinner" style="width:24px;height:24px;border-width:3px"></span>
    <div style="margin-top:12px;font-size:13px">데이터 분석 중...</div>
  </div>`;

  try {
    const text = await callClaude({
      system:   _buildInsightSystemPrompt(),
      messages: [{ role: 'user', content: '이번 달 마케팅·매출·운영 현황을 종합 분석하고 실행 가능한 인사이트를 제공해줘.' }],
    });
    output.innerHTML = `<div style="padding:4px;color:#cbd5e1;font-size:13px;line-height:1.8">${escHtml(text).replace(/\n/g, '<br>')}</div>`;
  } catch (err) {
    output.innerHTML = `<div style="color:#ef4444;font-size:13px;padding:12px">❌ 분석 실패 — API 키 또는 네트워크 확인</div>`;
    console.error(err);
  }
}

async function _handleRenewalSms(memberName, lastDate) {
  const outputDiv = document.getElementById('renewal-sms-output');
  const textEl    = document.getElementById('renewal-sms-text');
  if (!outputDiv || !textEl) return;
  outputDiv.style.display = 'block';
  textEl.textContent = '문자 초안 생성 중...';
  const days = Math.floor((new Date() - new Date(lastDate)) / 86400000);

  try {
    const text = await callClaude({
      system:   `핏플랜PT 팔로업 문자 메시지 전문가야. 짧고 자연스럽고 부담 없는 톤. 80자 내외. 브랜드: 압구정 로데오 프라이빗 PT. 금지: 할인/이벤트/저렴한/광고 느낌.`,
      messages: [{ role: 'user', content: `${memberName}님, 마지막 등록 ${days}일 경과. 재등록 유도 문자 초안 3가지 옵션 작성.` }],
    });
    textEl.textContent = text;
  } catch (err) {
    textEl.textContent = '❌ 생성 실패';
    console.error(err);
  }
}

function _buildInsightSystemPrompt() {
  const now      = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const salesByMonth = [];
  for (let i = 2; i >= 0; i--) {
    const d  = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const s  = DB.salesLogsGetByMonth(mk);
    const rev = s.reduce((sum, x) => sum + (x.amount || 0), 0);
    salesByMonth.push(`  ${mk}: 총 ${rev.toLocaleString()}원 (신규 ${s.filter(x=>x.type==='new').length}건, 재등록 ${s.filter(x=>x.type==='renewal').length}건)`);
  }

  const costs    = DB.mktCostsGet(thisMonth);
  const totalCost = costs.reduce((s, c) => s + (c.amount || 0), 0);
  const byCh = {};
  costs.forEach(c => { byCh[c.channel] = (byCh[c.channel] || 0) + (c.amount || 0); });

  const ranks    = DB.mktPlaceRanksGet().slice(0, 10);
  const consults = DB.consultsGet().filter(c => (c.createdAt || '').startsWith(thisMonth));
  const calls    = DB.callLogsGet(thisMonth);
  const renewals = _detectRenewal();

  return `너는 핏마스터 — 헬스장·피티샵 전문 마케터 15년. 핏플랜PT 일일 브리핑 담당.

[브리핑 형식 — 반드시 이 순서로]
🎯 오늘 할 것 1가지 (1문장. 가장 임팩트 있는 행동 하나만.)
💰 매출 현황 (3줄 이내. 수치 중심.)
📣 마케팅 상태 (2줄 이내. 잘되는 것/문제 하나씩.)
⚠️ 이번 주 놓치면 안 되는 것 (1~2줄.)

[말투] 짧고 직접적. 숫자 중심. 군더더기 없이. "~것 같습니다" 금지.

[스튜디오] 압구정 로데오 2층 30평대 프라이빗 PT / 타겟: 30~60대 여성 / exbody·1:1·발렛파킹

[최근 3개월 매출]
${salesByMonth.join('\n')}

[이번 달(${thisMonth}) 마케팅 비용] 총 ${totalCost.toLocaleString()}원
${Object.entries(byCh).map(([ch, amt]) => `  ${ch}: ${amt.toLocaleString()}원`).join('\n') || '  없음'}

[플레이스 순위]
${ranks.length ? ranks.map(r => `${r.date} "${r.keyword}" ${r.rank}위`).join('\n') : '기록 없음'}

[이번 달] 신규 상담: ${consults.length}건 / 전화 일지: ${calls.length}건
[재등록 임박] ${renewals.length ? renewals.map(r => `${r.memberName}(${Math.floor((now - new Date(r.date)) / 86400000)}일)`).join(', ') : '없음'}`;
}
