# PlanFast — 로컬 AI 기획 에디터

매니패스트(manyfast.io)의 기능·정보구조를 참고해 만든, 1인용 로컬 클론. Next.js 16 (App Router) + node:sqlite + React Flow + Claude.

## 실행
- `pnpm dev -p 3456` → http://localhost:3456
- DB: `./data/planfast.db` (자동 생성, gitignore)
- AI: 기본은 로컬 Claude Code CLI(`claude -p`, 구독 사용). 설정에서 Anthropic API 키로 전환 가능.

## 구조
- `src/lib/types.ts` — 모든 도메인 타입/상수/라벨. 새 필드는 여기 먼저.
- `src/lib/db.ts` — SQLite 싱글턴 + `all/get/run/tx/j` 헬퍼. 스키마는 `CREATE TABLE IF NOT EXISTS`로 자동.
- `src/lib/repo/*` — 테이블별 데이터 접근. 라우트 핸들러는 repo만 호출.
- `src/lib/ai/index.ts` — `generateText`, `generateJson({schema: zod})`, `generateStream`. 프로바이더 분기는 여기서만.
- `src/lib/ai/policy.ts` — **작업 등급(A 사고 / B 구조 / C 채우기 / D 다듬기) → 모델·노력** 정책. 새 AI 호출은 `model:` 대신 `task: "도메인.작업"` 을 넘기고, 작업은 여기 `AI_TASKS` 에 먼저 등록. 등급→모델은 설정에서 사용자가 바꾸며 기본값이 최적 배치.
- `src/lib/flow/autolayout.ts` — **자동 정렬 엔진**(정보구조도·기능명세서 트리·유저플로우 공용). 주 흐름 직선 · 분기 블록화 · 대량 분기 격자 접기 · cross edge 분리 · **기존 위치 유지**. 배치는 전부 이걸 쓴다(dagre 제거됨).
- `src/lib/ai/jsonStream.ts` + `src/lib/sse.ts` + `readSse()`(api.ts) — **AI 결과 스트리밍**. 모델이 JSON 을 쓰는 동안 점진 파서로 값을 꺼내 SSE 로 밀어주고, 화면은 항목이 생기는 대로 그린다. 기능명세서·정보구조도·유저플로우가 `ai/<domain>/stream` 라우트를 쓴다.
- `src/lib/ai/context.ts` — 프로젝트를 마크다운 컨텍스트로. `MANNY_SYSTEM` 시스템 프롬프트.
- `src/lib/http.ts` — 라우트 핸들러용 `handler/ok/bad/notFound/Params`.
- `src/lib/api.ts` — 클라이언트 fetch 헬퍼 `api()`, `debounce()`.
- `src/app/p/[id]/{prd,features,ia,flow,wireframe}` — 에디터 탭. `EditorShell`이 상단 탭·우측 도구 패널을 렌더.
- `src/components/editor/EditorContext.tsx` — `useEditor()`: `tick`(데이터 변경 신호), `refresh()`, `mention()`, `selection`. 데이터 바꾼 뒤엔 `broadcastChange(projectId)` 호출.
- `src/components/panels/*` — 우측 패널(매니/검토/버전/코멘트).
- 라우트: `src/app/api/projects/[id]/<domain>/...`

## 규칙
- UI 텍스트는 한국어. 라벨 상수는 types.ts의 `*_LABEL` 사용.
- 편집은 자동 저장(debounce 500~800ms). 저장 후 `broadcastChange`.
- AI가 문서를 바꾸는 경우 바로 쓰지 말고 "제안 → 반영/거절" UX (PRD 에디터 참고).
- AI 호출에 모델을 직접 박지 말 것(`model: "opus"` 금지). `task:` 로 등급을 타게 하고, 등급 판단은 "이게 틀리면 무엇이 같이 틀리는가"로. 예외적으로 이번 한 번만 바꿀 때만 `model/effort` 를 같이 넘긴다.
- 화면에 결과가 그려지는 AI 작업은 **스트리밍이 기본**이다(`ai/<domain>/stream` + `readSse`). 60초 스피너는 "일하는 척"이지 일하는 게 아니다 — 제목이 나오는 즉시 노드를 만들고(create), 객체가 닫히면 채운다(update). 한 번에 받는 라우트는 MCP·스크립트용으로만 남긴다. 스키마 프롬프트에는 "title/name 을 첫 키로" 지시를 넣는다.
- 자동 정렬은 `stableLayout` 하나만 쓴다. `previous` 를 주면 바뀐 가지만 움직이고(노드 추가·펼치기), 주지 않으면 전체 재배치("자동 정렬" 버튼). 이 구분이 UX 의 핵심 — 한 부분을 고쳤을 때 화면 전체가 재배치되면 안 된다.
- 새 컬럼을 추가하면 `INSERT INTO <table>` 전수 확인(생성·버전 복원·프로젝트 복제 3곳). 한 곳이라도 빠지면 조용히 값이 사라진다.
- 라우트 핸들러는 `handler()`로 감싸고 params는 `await params`.
- 새 의존성 추가 전에 package.json 확인. 무거운 라이브러리 지양.
