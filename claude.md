# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 스튜디오 정보 (브랜드 컨텍스트)

| 항목 | 내용 |
|------|------|
| 이름 | 핏플랜PT |
| 위치 | 서울 강남구 압구정 로데오 2층, 30평대 프라이빗 PT 스튜디오 |
| 타겟 | 30대 여성, 인근 중장년 여성 (40~60대) |
| 브랜드 키워드 | **Private · Expert · Serene** |
| 차별화 포인트 | exbody 정밀 체형분석, 1:1 프라이빗, 발렛파킹, 샤워시설, 전문 강사진 |

### 콘텐츠 규칙

**필수 포함 요소** (콘텐츠 3개 중 최소 1개 이상)
- exbody 정밀 체형분석
- 1:1 프라이빗
- 발렛파킹
- 샤워시설
- 전문 강사진

**절대 사용 금지 단어**
- 살빼기, 땀빼기, 저렴한, 싼, 할인, 이벤트가격
- "다이어트" 단독 사용 금지 → "체형교정", "건강한 체형 관리", "다이어트가 아닌 체형교정" 으로 대체
- 경쟁사 이름 직접 언급 금지

**브랜드 톤** : 전문적 · 신뢰감 · 프리미엄. 친근하되 저렴한 느낌 절대 금지.

---

## 채널별 톤앤매너 & 포맷 규칙

### 네이버 블로그
- **분량**: 2500~3000자 + 이미지 5장 이상 권장
- **톤**: 정보성, SEO 최적화, 전문적
- **구조**: 도입부(문제 제기) → 본문(소제목 H2/H3) → 마무리(CTA)
- **SEO**: 핵심 키워드 자연스럽게 3회 이상 삽입 (압구정PT, 강남퍼스널트레이닝, 체형교정 등)
- **금지**: 과도한 줄바꿈, 의미없는 반복, 저품질 패턴

### 네이버 플레이스 소식
- **분량**: 200자 이내
- **톤**: 짧고 임팩트, 방문 유도
- **필수**: CTA 포함 ("예약 문의는 ▶", "지금 바로 ▶")
- **업로드 주기**: 주 2~3회 이상 (플레이스 순위 유지 핵심)

### 인스타그램
- **캡션**: 감성적, 300자 내외, 저장 유도 문구 포함
- **해시태그**: 8~12개 (고정 5개 + 콘텐츠별 3~7개)
  - 고정: #압구정PT #강남퍼스널트레이닝 #핏플랜PT #체형교정 #프라이빗PT
  - 콘텐츠별: 주제에 맞게 선택
- **톤**: 라이프스타일 감성, 애스피레이셔널(aspirational)

### 당근마켓
- **분량**: 300자 이내
- **톤**: 신뢰감 있는 전문가 톤 + 간결함. 친근하되 저렴한 느낌 절대 금지
- **금지**: 가격 직접 언급, 지나친 구어체
- **핵심**: 프리미엄 시설 + 전문성 + 접근성(압구정 로데오 2층, 발렛파킹)

---

## Project Overview

Fitness studio management app — built with HTML5 / CSS3 / Vanilla JS using **ES Modules (ESM)**. No build tools. Firebase Realtime Database 연동 완료. Netlify 배포.

`index.html` is a minimal HTML shell only — **do not put JS or CSS logic back into it**.

---

## Running the App

**Requires a local HTTP server** (ESM cannot load over `file://` due to CORS).

```bash
# 옵션 1: Netlify CLI (함수 로컬 테스트 포함)
npx netlify dev

# 옵션 2: Python 단순 서버 (함수 없이 UI만)
python3 -m http.server 8080
```

VS Code Live Server extension도 가능 (함수 미포함).

---

## File Structure

```
index.html              ← HTML shell only (topbar, sidebar, #page-content, <script type="module">)
style.css               ← All CSS (variables, layout, per-feature component styles)
netlify.toml            ← Netlify 빌드/함수/리다이렉트 설정
.env.example            ← 환경변수 템플릿 (실제 .env는 gitignore)
netlify/
  functions/
    claude-proxy.js     ← Claude API 서버사이드 프록시 (ANTHROPIC_API_KEY)
    naver-proxy.js      ← 네이버 DataLab API 프록시 (NAVER_CLIENT_ID/SECRET)
js/
  api.js                ← 프론트엔드 API 클라이언트 (callClaude, callNaverDataLab, fileToBase64)
  db.js                 ← Data access layer (DB object) — Firebase + 로컬 캐시
  utils.js              ← Shared utilities: showToast, escHtml, fmtMoney, isMobile, comingSoon
  main.js               ← App entry point: router (navigate), sidebar toggle, export/import
  pages/
    dashboard.js        ← Dashboard page
    scheduler.js        ← Weekly scheduler (drag, dblclick, custom types)
    todo.js             ← To-do list
    finance.js          ← Settlement system (SettlementManager + render)
    consult.js          ← Consult manager
    calllog.js          ← 전화 일지
    otlog.js            ← OT 일지
    stats.js            ← 통계
    salesLog.js         ← 매출일지
    notice.js           ← 공지사항
    marketing.js        ← [예정] 마케팅 총괄 에이전트
```

---

## Architecture

Three logical layers:

1. **`js/db.js` — Data layer**: The sole read/write interface. All reads/writes go through `DB.*` methods. Firebase Realtime Database + 로컬 캐시(`_d`). Never access `DB._d` directly from outside `DB`.

2. **`js/pages/*.js` — Page modules**: Each file exports a `render*()` function that sets `#page-content` innerHTML then calls its own `bind*Events()`. Module-level variables hold page state.

3. **`js/main.js` — Router & shell**: Imports all page modules, owns the `navigate(page)` function. Exposes `window.navigate` for inline `onclick` handlers.

4. **`js/api.js` — API client**: `callClaude()` / `callClaudeVision()` / `callNaverDataLab()` — 모두 Netlify Functions 프록시 경유. API 키는 서버에만 보관.

---

## API 클라이언트 사용법

```js
import { callClaude, callClaudeVision, callNaverDataLab, fileToBase64 } from '../api.js';

// 텍스트 생성
const text = await callClaude({
  system: '시스템 프롬프트',
  messages: [{ role: 'user', content: '질문' }],
});

// 이미지 분석
const { base64, mediaType } = await fileToBase64(file);
const analysis = await callClaudeVision(base64, mediaType, '이 사진을 분석해줘', systemPrompt);

// 네이버 DataLab 검색 트렌드
const trend = await callNaverDataLab([
  { groupName: '압구정PT', keywords: ['압구정PT', '압구정 퍼스널트레이닝'] },
]);
```

---

## Data Layer (DB object)

| Namespace | Methods |
|---|---|
| Scheduler | `DB.schedGet(instId, wKey, day, hour)` · `DB.schedSet(…, patch)` |
| Custom Types | `DB.typesGet()` · `DB.typesAdd(type)` · `DB.typesDel(idx)` |
| Todos | `DB.todosGet()` · `DB.todosAdd()` · `DB.todosUpdate(id, patch)` · `DB.todosDel(id)` |
| Finance | `DB.financeGet(monthKey)` · `DB.financeSet(monthKey, data)` |
| Consults | `DB.consultsGet()` · `DB.consultsGetOne(id)` · `DB.consultsAdd()` · `DB.consultsUpdate(id, patch)` |
| Marketing | `DB.marketingGet(key)` · `DB.marketingSet(key, data)` ← [예정] |
| I/O | `DB.exportAll()` · `DB.importAll(data)` |

Firebase 경로: `/marketing/{key}` (마케팅 데이터)

---

## Netlify Functions 환경변수

Netlify 대시보드 → Site configuration → Environment variables 에 등록:

| 변수명 | 용도 |
|--------|------|
| `ANTHROPIC_API_KEY` | Claude API 인증 |
| `NAVER_CLIENT_ID` | 네이버 Open API Client ID |
| `NAVER_CLIENT_SECRET` | 네이버 Open API Client Secret |

로컬 개발 시 `.env` 파일 생성 후 `npx netlify dev` 실행.

---

## Adding a New Page

1. Create `js/pages/foo.js` — export `renderFoo()` which sets `#page-content` innerHTML then calls `bindFooEvents()`.
2. In `js/main.js`: `import { renderFoo } from './pages/foo.js';` and add `foo: renderFoo` to the `pages` map.
3. In `index.html`: add `<button class="nav-item" data-page="foo">` in the sidebar `<nav>`.

---

## Scheduler Drag/DblClick Conflict Rule

- `mousedown` sets `isDragging = true`; `document.mouseup` (registered **once** at module init) sets it `false`.
- Never add another `document.mouseup` listener.
