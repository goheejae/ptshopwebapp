# PRD — 핏플랜 스튜디오 통합 관리 시스템

> 새 채팅 세션에서 이 파일을 첨부하면 지금까지의 모든 기획·구현 맥락을 즉시 복원할 수 있습니다.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 서비스명 | 핏플랜 스튜디오 통합 관리 시스템 |
| 사용자 | 피트니스 센터 동업자 2인 (고희재, 이건우) |
| 목적 | 스케쥴, 업무, 매출 정산, 상담지를 하나의 화면에서 협업 관리 |
| 배포 | Netlify (정적 호스팅) |
| DB | Supabase (실시간 공유) — 현재는 localStorage로 오프라인 동작 |

---

## 2. 기술 스택

```
HTML5 + CSS3 + Vanilla JavaScript (ES Modules)
모듈형 아키텍처: index.html(셸) + style.css + js/ 디렉터리 (빌드 도구 없음)
  js/db.js          — 데이터 레이어
  js/utils.js       — 공통 유틸리티
  js/main.js        — 라우터 & 진입점
  js/pages/*.js     — 페이지별 독립 모듈
데이터 저장: localStorage → Supabase JS SDK v2 로 교체 예정
배포: Netlify (git push → 자동 배포)
DB: Supabase PostgreSQL + Realtime
```

> **실행 방법**: ESM은 `file://`에서 동작하지 않습니다. `python3 -m http.server 8080` 또는 VS Code Live Server로 열어야 합니다.

### Supabase 마이그레이션 원칙

`index.html` 내 `DB` 객체의 각 메서드 **내부**만 교체하면 됨.  
메서드 시그니처·UI 호출부는 변경 불필요.

```js
// 현재 (localStorage)
schedGet(instId, wKey, day, hour) {
  return (this._d.scheduler || {})[`${instId}|${wKey}|${day}|${hour}`] || {};
}

// 교체 후 (Supabase)
async schedGet(instId, wKey, day, hour) {
  const { data } = await supabase.from('scheduler')
    .select().match({ inst_id: instId, week_key: wKey, day, hour }).single();
  return data || {};
}
```

---

## 3. 데이터 스키마

### 3-1. localStorage JSON 전체 구조

```jsonc
{
  "version": 1,

  // 스케쥴러 셀 데이터
  "scheduler": {
    "ko|2026-04-07|0|9": {
      "text": "김철수 상담",
      "bg": "resident",          // "resident" | "non-resident" | ""
      "typeColor": "#e5414a"
    }
    // key 형식: "instId|YYYY-MM-DD(월요일)|dayIndex(0=월)|hour(7~22)"
  },

  // 사용자 정의 유형
  "customTypes": [
    { "name": "수업", "color": "#ff6b35" }
  ],

  // To-do
  "todos": [
    {
      "id": "uuid-v4",
      "content": "계약서 검토",
      "assignee": "ko",          // "ko" | "lee" | "all"
      "dueDate": "2026-04-10T18:00:00.000Z",
      "done": false,
      "createdAt": "2026-04-07T09:00:00.000Z"
    }
  ],

  // 결산
  "finance": {
    "2026-04": {
      "incomes": [
        {
          "id": "uuid-v4",
          "instructor": "ko",    // "ko" | "lee"
          "amount": 1500000,
          "description": "PT 매출",
          "date": "2026-04-01"
        }
      ],
      "expenses": [
        {
          "id": "uuid-v4",
          "category": "shared",  // "shared" | "ko_personal" | "lee_personal"
          "amount": 200000,
          "description": "운동용품 구매",
          "date": "2026-04-05"
        }
      ]
    }
  },

  // 상담지
  "consults": [
    {
      "id": "uuid-v4",
      "date": "2026-04-07",
      "time": "14:00",
      "name": "홍길동",
      "canvasData": "data:image/png;base64,...",  // Canvas toDataURL()
      "checkboxes": {
        "goal_diet": true,
        "goal_muscle": false,
        "experience_none": true
      },
      "note": "공개 메모",
      "privateNote": "강사 전용 특이사항 (슬라이드로 노출)",
      "visitPath": "sns",        // "sns" | "referral" | "walk-in" | "etc"
      "unregiReason": "",        // 미등록 사유 (통계 수집용)
      "createdAt": "2026-04-07T14:00:00.000Z"
    }
  ]
}
```

### 3-2. Supabase 테이블 설계 (SQL)

```sql
-- 스케쥴러
CREATE TABLE scheduler (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inst_id     text NOT NULL,          -- 'ko' | 'lee'
  week_key    date NOT NULL,          -- 해당 주의 월요일 날짜
  day         smallint NOT NULL,      -- 0=월 … 6=일
  hour        smallint NOT NULL,      -- 7 ~ 22
  text        text,
  bg          text,                   -- 'resident' | 'non-resident' | ''
  type_color  text,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (inst_id, week_key, day, hour)
);

-- 사용자 정의 유형
CREATE TABLE custom_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  color      text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- To-do
CREATE TABLE todos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content     text NOT NULL,
  assignee    text NOT NULL,   -- 'ko' | 'lee' | 'all'
  due_date    timestamptz,
  done        boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

-- 결산 항목
CREATE TABLE finance_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key   text NOT NULL,   -- 'YYYY-MM'
  type        text NOT NULL,   -- 'income' | 'expense'
  category    text,            -- 'shared' | 'ko_personal' | 'lee_personal'
  instructor  text,            -- 'ko' | 'lee' (income일 때)
  amount      integer NOT NULL,
  description text,
  date        date,
  created_at  timestamptz DEFAULT now()
);

-- 상담지
CREATE TABLE consults (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date          date NOT NULL,
  time          text,
  name          text NOT NULL,
  canvas_data   text,          -- base64 PNG (or Supabase Storage URL)
  checkboxes    jsonb,
  note          text,
  private_note  text,
  visit_path    text,
  unregi_reason text,
  created_at    timestamptz DEFAULT now()
);
```

---

## 4. 구현 현황 및 기능 상세 스펙

### ✅ [기능 1] 주간 스케쥴러 — **구현 완료**

**구조**
- 고희재 / 이건우 강사별 독립 테이블 2개
- 시간 축: 07:00 ~ 22:00 (1시간 간격, 16행)
- 요일 축: 월 ~ 일 (7열), 주간 단위 네비게이션

**조작**
| 동작 | 결과 |
|---|---|
| 셀 mousedown → drag | 파란색 outline + 반투명 배경으로 범위 선택 |
| 범위 선택 후 [상주] | 배경색 `#ffffff` 적용 |
| 범위 선택 후 [비상주] | 배경색 `#ebebeb` 적용 |
| 범위 선택 후 [지우기] | 배경 초기화 |
| 범위 선택 후 유형 버튼 | 폰트 색상만 변경 (배경 불변) |
| 셀 더블클릭 | 인라인 input 활성화 → Enter/Esc/포커스아웃 시 저장 |
| [+] 버튼 | 모달로 유형 이름 + 색상 추가, ✕로 삭제 |
| ‹ / › | 이전/다음 주 이동 |
| [오늘] | 현재 주로 복귀 |

**충돌 방지 로직**
- `mousedown` → `dragInfo` 설정, `isDragging = true`
- `document.mouseup` → `isDragging = false` (전역 단일 핸들러, 중복 등록 없음)
- `dblclick`은 mouseup×2 이후 발생 → `isDragging` 항상 false 보장
- input 내부 `mousedown`에서 `e.stopPropagation()` → 드래그 재시작 방지

---

### ⬜ [기능 2] 협업형 To-do 리스트 — **미구현**

**등록 필드**
- 내용 (text)
- 담당자: [고] [이] [모두]
- 마감일시 (datetime-local)

**표시 규칙**
- 마감 24시간 미만(D-1): 리스트 최상단 고정 + 빨간 깜빡임 애니메이션
- 완료 체크 시 취소선 + 하단 이동
- 담당자별 필터 버튼

**DB 메서드**: `DB.todosGet()` · `DB.todosAdd()` · `DB.todosUpdate()` · `DB.todosDel()`

---

### ⬜ [기능 3] 개별 매출 기반 결산 시스템 — **미구현**

**정산 수식**

```
강사 A의 순수익 =
  A 개인 매출
  - (공용 지출 합계 × 50%)
  - (B 사비 지출 합계 × 50%)
  + (A 사비 지출 합계 × 50%)
```

**UI**
- 월간 슬라이드 (< 2026년 4월 >)
- 수입 입력 테이블 (강사별)
- 지출 입력 테이블 (공용 / 고희재 사비 / 이건우 사비)
- 강사별 최종 정산 결과 카드 (자동 계산)

**DB 메서드**: `DB.financeGet(monthKey)` · `DB.financeSet(monthKey, data)`

---

### ⬜ [기능 4] 디지털 상담지 매니저 — **미구현**

**상담지 작성**
- Canvas 위 직접 필기 (터치/마우스 모두 지원)
- 체크박스 항목 V자 체크 (click toggle)
- 실시간 자동 저장 (debounce 1s)
- [완료] 버튼 → 최종 저장

**상담 리스트**
- 날짜 / 시간 / 이름으로 정렬된 카드 리스트
- 클릭 시 기존 데이터 그대로 복원하여 편집 가능

**비공개 영역**
- 아래로 스와이프/슬라이드 시 노출
- 강사 전용 특이사항 (`privateNote`)
- 미등록 사유 (`unregiReason`) — 통계 데이터 원천

**DB 메서드**: `DB.consultsGet()` · `DB.consultsGetOne(id)` · `DB.consultsAdd()` · `DB.consultsUpdate()`

---

### ⬜ [기능 5] 통계 — **미구현 (데이터 수집 단계)**

**목적**
- 기능 4에서 수집한 `visitPath`(방문 경로), `unregiReason`(미등록 사유)를 집계·시각화

**데이터 항목**
```
visitPath 분류: sns | referral | walk-in | etc
unregiReason 분류: price | schedule | need_time | other | (자유 텍스트)
```

**OCR 연동 대비 설계**
- `canvasData`는 base64 PNG로 저장 → OCR API(예: Google Vision)에 그대로 전달 가능
- `checkboxes`는 JSONB로 저장 → OCR 결과와 병합 가능
- 추후 `ocr_raw_text` 컬럼 추가만으로 확장 가능

---

## 5. UI/UX 공통 규칙

| 요소 | 규격 |
|---|---|
| 사이드바 | 좌측 고정, 토글 버튼으로 숨김/펼치기 |
| 모바일 사이드바 | 오버레이 방식, 외부 클릭 시 닫힘 |
| 스케쥴러 레이아웃 | PC: 고희재·이건우 테이블 좌우 나란히 (`display: flex; gap`). 모바일: 세로 스택 (`flex-direction: column`) |
| 데이터 내보내기 | 상단 우측 버튼 → `fitplan_backup_YYYY-MM-DD.json` 다운로드 |
| 데이터 가져오기 | JSON 파일 선택 → `DB.importAll()` → 현재 페이지 리렌더 |
| Toast 알림 | 우측 하단 슬라이드업, 2.5초 후 자동 소멸 |
| 색상 변수 | `--accent: #4f7cff` / `--bg: #f4f6fb` / `--card: #fff` |

---

## 6. 개발 로드맵

| 순서 | 기능 | 상태 |
|---|---|---|
| 1 | 레이아웃 + 내보내기/가져오기 + DB 레이어 | ✅ 완료 |
| 2 | 주간 스케쥴러 (드래그·더블클릭·유형) | ✅ 완료 |
| 2-R | ESM 모듈화 리팩토링 (js/pages/, db.js, utils.js, main.js 분리) | ✅ 완료 |
| 3 | To-do 리스트 | ⬜ 다음 |
| 4 | 결산 시스템 | ⬜ |
| 5 | 상담지 매니저 | ⬜ |
| 6 | 통계 | ⬜ |
| 7 | Supabase 연동 (DB 메서드 교체) | ⬜ |
| 8 | Netlify 배포 | ⬜ |

---

## 7. 다음 세션 시작 스크립트 (복붙용)

### 기능 2 — To-do 리스트

```
PRD.md를 참고해줘.
현재까지 구현된 것: 기능 1(주간 스케쥴러)까지 완료.
오늘은 기능 2(To-do 리스트)를 구현할 거야.
기존 index.html의 renderTodo() 함수를 교체하는 방식으로 작업해줘.
DB 레이어(DB.todosGet/Add/Update/Del)는 이미 정의되어 있으니 그대로 활용해.
```

### 기능 3 — 결산 시스템

```
PRD.md를 참고해줘.
기능 1·2 완료. 오늘은 기능 3(결산 시스템)을 구현할 거야.
renderFinance() 함수를 교체하는 방식으로 작업해줘.
DB 레이어(DB.financeGet/Set)는 이미 정의되어 있으니 그대로 활용해.
```

### 기능 4 — 상담지 매니저

```
PRD.md를 참고해줘.
기능 1·2·3 완료. 오늘은 기능 4(상담지 매니저)를 구현할 거야.
renderConsult() 함수를 교체하는 방식으로 작업해줘.
DB 레이어(DB.consultsGet/GetOne/Add/Update)는 이미 정의되어 있으니 그대로 활용해.
```

### 기능 5 — 통계

```
PRD.md를 참고해줘.
기능 1~4 완료. 오늘은 기능 5(통계)를 구현할 거야.
renderStats() 함수를 교체하는 방식으로 작업해줘.
데이터 원천: DB.consultsGet()의 visitPath · unregiReason 필드.
```
