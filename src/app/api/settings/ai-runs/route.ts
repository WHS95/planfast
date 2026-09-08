import { handler, ok } from "@/lib/http";
import { recentRuns } from "@/lib/ai";

/** GET → 최근 AI 실행 기록(작업·등급·모델·소요시간). 설정 화면의 "실측" 근거. */
export const GET = handler(async () => ok(recentRuns()));
