# CLAUDE.md

---

## 행동 규칙 (필수 준수)

- 파일 삭제 · 구조 변경 · DB 수정 등 되돌리기 어려운 작업 전 반드시 확인
- 복잡한 작업은 단계 나누어 제안 후 승인받고 진행
- 한 번에 너무 많이 바꾸지 말 것 — 나눠서, 단계별로 테스트 후 진행
- **Git push는 명시적으로 요청받기 전까지 하지 말 것** (커밋만 하고 대기)

**자율 진행 ("자율로 해줘") 시**
- 해당 작업 범위 내 완전 자율 — 중간에 권한 묻지 말 것, 선택지 제시 금지
- 완료 후 결과만 보고

---

## 메모리 · 컨텍스트 관리

- **메모리는 이 파일(CLAUDE.md)만 사용** — `~/.claude/memory` 또는 로컬 파일 저장 절대 금지
- 모든 컨텍스트는 CLAUDE.md → GitHub commit으로만 관리
- 작업환경: **Windows 11 + MacBook 번갈아 사용** — 경로는 항상 상대경로 또는 프로젝트 루트 기준으로 표기

---

## ⚠️ 미완료 작업 목록

### 구글 드라이브 마케팅 폴더
- 내 드라이브 최상위에 `핏플랜PT_마케팅` 폴더 생성 (직접 만들기로 함)
- 하위: `insta/` · `reviews/` · `competitor/` · `exbody/`
- 목적: 윈도우·맥북 양쪽에서 마케팅 이미지·캡처 공유 → 나에게 분석 요청
- 구글 드라이브 MCP 인증 완료 (세션마다 재인증 필요할 수 있음)

---

## ⚠️ 미완료 — Netlify 환경변수 등록 필요

Netlify 대시보드 → Site configuration → Environment variables:

| 변수명 | 값 | 상태 |
|--------|-----|------|
| `ANTHROPIC_API_KEY` | Claude API 키 | **미등록** |
| `NAVER_CLIENT_ID` | 네이버 Open API | 나중에 (DataLab 쓸 때) |
| `NAVER_CLIENT_SECRET` | 네이버 Open API | 나중에 (DataLab 쓸 때) |

> `ANTHROPIC_API_KEY` 미등록 시 글쓰기 에이전트 동작 안 함.

---

## 프로젝트 개요

핏플랜PT 스튜디오 통합 관리 웹앱.
HTML5 / CSS3 / Vanilla JS (ES Modules). No build tools. Firebase Realtime Database + Netlify 배포.

브랜드 컨텍스트 · 채널별 톤앤매너 → **[MARKETING.md](MARKETING.md)** 참조.

---

## 파일 구조

```
index.html                   ← HTML shell only. JS/CSS 로직 넣지 말 것.
style.css                    ← 전체 CSS (변수, 레이아웃, 컴포넌트)
netlify.toml                 ← /api/* → /.netlify/functions/* 리다이렉트
.env.example                 ← 환경변수 템플릿 (.env는 gitignore)
netlify/functions/
  claude-proxy.js            ← Claude API 프록시 (ANTHROPIC_API_KEY)
  naver-proxy.js             ← 네이버 DataLab 프록시 (NAVER_CLIENT_ID/SECRET)
js/
  api.js                     ← callClaude / callClaudeVision / callNaverDataLab / fileToBase64
  db.js                      ← DB 객체 — 유일한 읽기/쓰기 인터페이스
  utils.js                   ← showToast, escHtml, fmtMoney, isMobile, comingSoon
  main.js                    ← 라우터(navigate), 사이드바, export/import
  pages/
    dashboard.js / scheduler.js / todo.js / finance.js
    consult.js / calllog.js / otlog.js / stats.js
    salesLog.js / notice.js
    marketing.js             ← 마케팅 에이전트 (글쓰기·플레이스·비용·인사이트)
```

---

## 아키텍처

1. **`db.js`** — Firebase + 로컬 캐시(`_d`). 외부에서 `_d` 직접 접근 금지.
2. **`pages/*.js`** — `render*()` → `#page-content` innerHTML 세팅 → `bind*Events()` 호출.
3. **`main.js`** — `navigate(page)` 라우터. `window.navigate` 전역 노출.
4. **`api.js`** — Netlify Functions 경유 Claude/네이버 API 클라이언트. 키는 서버에만.

---

## DB 네임스페이스

| 네임스페이스 | 주요 메서드 |
|---|---|
| Scheduler | `schedGet` · `schedSet` |
| CustomTypes | `typesGet` · `typesAdd` · `typesDel` |
| Todos | `todosGet` · `todosAdd` · `todosUpdate` · `todosDel` |
| Finance | `financeGet` · `financeSet` · `financeAddIncome` 등 |
| SalesLog | `salesLogsGetByMonth` · `salesLogsAdd` · `salesLogsUpdate` · `salesLogsDel` |
| Consults | `consultsGet` · `consultsGetOne` · `consultsAdd` · `consultsUpdate` · `consultsDel` |
| CallLogs | `callLogsGet` · `callLogsAdd` · `callLogsDelete` |
| OtLogs | `otLogsGet` · `otLogsAdd` · `otLogsUpdate` · `otLogsDel` |
| Notice | `noticeGet` · `noticeSet` |
| **Marketing** | `mktCostsGet` · `mktCostsAdd` · `mktCostsDel` · `mktPlaceRanksGet` · `mktPlaceRanksAdd` · `mktContentAdd` · `mktContentGetRecent` |
| I/O | `exportAll` · `importAll` |

Firebase 경로: `/marketing/{costs·placeRanks·content}/{id}`

---

## API 클라이언트 사용법

```js
import { callClaude, callClaudeVision, callNaverDataLab, fileToBase64 } from '../api.js';

const text = await callClaude({ system: '...', messages: [{ role: 'user', content: '...' }] });

const { base64, mediaType } = await fileToBase64(file);
const result = await callClaudeVision(base64, mediaType, '분석해줘', systemPrompt);
```

---

## 새 페이지 추가 방법

1. `js/pages/foo.js` — `export function renderFoo()` 작성
2. `js/main.js` — import 추가, `pages` 맵에 `foo: renderFoo` 등록
3. `index.html` — 사이드바에 `<button class="nav-item" data-page="foo">` 추가

---

## 마케팅 에이전트 구현 단계

| 단계 | 내용 | 상태 |
|------|------|------|
| 0단계 | Netlify Functions 셋업 (claude-proxy, naver-proxy, netlify.toml) | ✅ 완료 |
| 1단계 | CLAUDE.md 브랜드 컨텍스트 + db.js 마케팅 네임스페이스 | ✅ 완료 |
| 2단계 | 마케팅 탭 UI (글쓰기·플레이스·비용·인사이트) 다크 네이비 테마 | ✅ 완료 |
| 3단계 | 글쓰기 에이전트 — 4채널 초안·Vision·**Sensor 자동 검증 UI** | ✅ 완료 |
| 4단계 | 플레이스 에이전트 — 추이 그래프·소식 문구·리뷰 답글·썸네일 멘트 | ✅ 완료 |
| 5단계 | 비용관리·인사이트 — 추이 그래프·AI 인사이트·재등록 감지·일일 브리핑 | ✅ 완료 |

> 단계 완료 시 상태를 ✅ 완료로 업데이트할 것.

---

## 스케줄러 drag/dblclick 규칙

`document.mouseup` 리스너는 `scheduler.js` 모듈 init에 **딱 한 번**만 등록. 절대 중복 추가 금지.
