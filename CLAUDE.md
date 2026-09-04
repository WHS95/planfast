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
- `src/lib/ai/index.ts` — `generateText`, `generateJson({schema: zod})`. 프로바이더 분기는 여기서만.
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
- 라우트 핸들러는 `handler()`로 감싸고 params는 `await params`.
- 새 의존성 추가 전에 package.json 확인. 무거운 라이브러리 지양.
