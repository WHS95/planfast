import { spawn } from "node:child_process";
import { handler, ok } from "@/lib/http";

export interface ClaudeCliStatus {
  /** claude 명령을 실행할 수 있는지 (설치 여부) */
  installed: boolean;
  loggedIn: boolean;
  email?: string;
  subscriptionType?: string;
  version?: string;
  error?: string;
}

function run(cmd: string, args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", () => resolve({ code: -1, out: "", err: "ENOENT" }));
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

/** GET → 로컬 Claude Code CLI 설치·로그인 상태 (비개발자용 연결 가이드에 표시) */
export const GET = handler(async () => {
  const auth = await run("claude", ["auth", "status"]);
  if (auth.code === -1) {
    const notInstalled: ClaudeCliStatus = { installed: false, loggedIn: false };
    return ok(notInstalled);
  }

  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(auth.out); } catch { /* fall through */ }

  const version = await run("claude", ["--version"]);
  const status: ClaudeCliStatus = {
    installed: true,
    loggedIn: !!parsed.loggedIn,
    email: typeof parsed.email === "string" ? parsed.email : undefined,
    subscriptionType: typeof parsed.subscriptionType === "string" ? parsed.subscriptionType : undefined,
    version: version.code === 0 ? version.out.trim() : undefined,
  };
  if (!status.loggedIn) status.error = (auth.err || auth.out).slice(0, 300);
  return ok(status);
});
