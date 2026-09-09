/**
 * AI adapter. Two providers:
 *  - "claude-cli": spawns the locally logged-in Claude Code CLI (`claude -p`). Uses the user's
 *    claude.ai subscription. Personal/local use only.
 *  - "anthropic-api": @anthropic-ai/sdk with ANTHROPIC_API_KEY (or key stored in settings).
 *
 * Exposes generateText, generateStream (token-by-token) and generateJson (schema-validated).
 *
 * generateJson is single-turn by default: the JSON Schema is embedded in the prompt and the model
 * answers with raw JSON in ONE model turn. The CLI's native `--json-schema` mode costs TWO turns
 * (prose answer + a StructuredOutput tool call that regenerates it), so it is only used as a
 * fallback when the single-turn output cannot be parsed/validated.
 */
import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { toJSONSchema, type z } from "zod";
import { appSettings } from "@/lib/repo";
import type { AiProvider } from "@/lib/types";
import { normalizeTierModels, resolveTask, effortForProvider, type AiTask, type AiEffort, type AiTier } from "@/lib/ai/policy";

export interface AiOptions {
  system: string;
  prompt: string;
  /**
   * 작업 이름. 등급 → 모델·노력은 설정(policy.ts)에서 결정된다. 새 호출은 model 대신 이것을 넘길 것.
   * model/effort 를 같이 주면 그 호출에 한해 정책을 덮어쓴다("이번만 낮춰서" 같은 예외용).
   */
  task?: AiTask;
  model?: string;
  effort?: AiEffort;
  provider?: AiProvider;
  maxTokens?: number;
  signal?: AbortSignal;
}
export interface AiResult<T> {
  data: T;
  raw: string;
  usage?: { input: number; output: number; costUsd?: number };
}
/** generateStream options: `onText` receives each text delta plus the full text so far. */
export type AiStreamOptions = AiOptions & { onText: (delta: string, full: string) => void };

const DEBUG = process.env.NODE_ENV !== "production" || !!process.env.PLANFAST_AI_DEBUG;
function dbg(...args: unknown[]) { if (DEBUG) console.debug("[ai]", ...args); }

function toProviderModel(m: string, provider: AiProvider): string {
  if (provider === "claude-cli") return m; // CLI accepts aliases (sonnet/opus/haiku) or full ids
  const alias: Record<string, string> = { sonnet: "claude-sonnet-5", opus: "claude-opus-5", haiku: "claude-haiku-4-5" };
  return alias[m] ?? m;
}

interface Run { provider: AiProvider; model: string; effort: AiEffort; tier?: AiTier }

/**
 * 호출 한 번에 쓸 {프로바이더, 모델, 노력} 결정.
 *   task 가 있으면 → 정책 표(등급별 설정)에서. model/effort 가 같이 오면 그것이 우선.
 *   task 가 없으면 → 옛 방식(전역 model 설정). 정책에 등록되지 않은 임시 호출용.
 */
function resolveRun(o: AiOptions): Run {
  const s = appSettings.get();
  const provider = o.provider ?? s.aiProvider;
  if (o.task) {
    const r = resolveTask(o.task, normalizeTierModels(s.tierModels), { model: o.model, effort: o.effort });
    return { provider, model: toProviderModel(r.model, provider), effort: r.effort, tier: r.tier };
  }
  return { provider, model: toProviderModel(o.model ?? s.model ?? "sonnet", provider), effort: o.effort ?? "medium" };
}

// ---------------------------------------------------------------- CLI provider
interface CliJson {
  type?: string;
  result?: string;
  structured_output?: unknown;
  is_error?: boolean;
  subtype?: string;
  api_error_status?: number | string | null;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}

interface CliStreamLine extends CliJson {
  event?: { type?: string; delta?: { type?: string; text?: string } };
}

function cliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE; // allow nesting when launched from inside Claude Code
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}

function cliErrorDetail(parsed: CliJson, err: string): string {
  return [parsed.result, parsed.subtype, parsed.api_error_status != null ? `api_error_status=${parsed.api_error_status}` : "", err.trim()]
    .filter(Boolean).join(" | ") || "unknown";
}

function runCli(args: string[], signal?: AbortSignal): Promise<CliJson> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, { env: cliEnv(), stdio: ["ignore", "pipe", "pipe"], signal });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      const start = out.indexOf("{");
      if (start < 0) return reject(new Error(`claude CLI exited ${code}: ${err || out}`.slice(0, 2000)));
      try {
        const parsed = JSON.parse(out.slice(start)) as CliJson;
        if (parsed.is_error) return reject(new Error(`claude CLI error: ${cliErrorDetail(parsed, err)}`.slice(0, 2000)));
        resolve(parsed);
      } catch (e) {
        reject(new Error(`claude CLI returned non-JSON (exit ${code}): ${(e as Error).message}\n${out.slice(0, 500)}`));
      }
    });
  });
}

function cliBaseArgs(system: string, run: Run, format: "json" | "stream" = "json"): string[] {
  const { cliEffort } = effortForProvider(run.effort, "claude-cli");
  return [
    "-p",
    ...(format === "stream" ? ["--output-format", "stream-json", "--verbose", "--include-partial-messages"] : ["--output-format", "json"]),
    "--model", run.model,
    ...(cliEffort ? ["--effort", cliEffort] : []),
    "--tools", "",
    "--no-session-persistence",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--permission-mode", "dontAsk",
    "--system-prompt", system,
  ];
}

async function cliText(o: AiOptions, run: Run): Promise<AiResult<string>> {
  const r = await runCli([...cliBaseArgs(o.system, run), o.prompt], o.signal);
  return { data: r.result ?? "", raw: r.result ?? "", usage: cliUsage(r) };
}
async function cliJson<T>(o: AiOptions, run: Run, jsonSchema: Record<string, unknown>): Promise<AiResult<T>> {
  const r = await runCli([...cliBaseArgs(o.system, run), "--json-schema", JSON.stringify(jsonSchema), o.prompt], o.signal);
  let data = r.structured_output as T | undefined;
  if (data === undefined && r.result) data = extractJson<T>(r.result);
  if (data === undefined) throw new Error("AI returned no structured output");
  return { data, raw: r.result ?? JSON.stringify(data), usage: cliUsage(r) };
}
/**
 * Streaming variant: `stream-json` NDJSON on stdout. Text arrives as
 * {type:"stream_event", event:{type:"content_block_delta", delta:{type:"text_delta", text}}} —
 * matched on delta.type, never on block index (index 0 is often a `thinking` block).
 * The final {type:"result"} line carries the complete text and usage.
 */
function runCliStream(args: string[], onText: (delta: string, full: string) => void, signal?: AbortSignal): Promise<CliJson & { streamed: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, { env: cliEnv(), stdio: ["ignore", "pipe", "pipe"], signal });
    let buf = "";
    let err = "";
    let full = "";
    let result: CliStreamLine | undefined;
    const handleLine = (line: string) => {
      const t = line.trim();
      if (!t.startsWith("{")) return;
      let msg: CliStreamLine;
      try { msg = JSON.parse(t) as CliStreamLine; } catch { return; }
      if (msg.type === "stream_event") {
        const ev = msg.event;
        if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
          full += ev.delta.text;
          try { onText(ev.delta.text, full); } catch { /* listener errors must not kill the stream */ }
        }
      } else if (msg.type === "result") result = msg;
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d: string) => {
      buf += d;
      let i = buf.indexOf("\n");
      while (i >= 0) { handleLine(buf.slice(0, i)); buf = buf.slice(i + 1); i = buf.indexOf("\n"); }
    });
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (buf.trim()) handleLine(buf);
      if (!result) return reject(new Error(`claude CLI stream ended without a result (exit ${code}): ${err || full}`.slice(0, 2000)));
      if (result.is_error) return reject(new Error(`claude CLI error: ${cliErrorDetail(result, err)}`.slice(0, 2000)));
      resolve({ ...result, streamed: full });
    });
  });
}

async function cliStream(o: AiStreamOptions, run: Run): Promise<AiResult<string>> {
  const r = await runCliStream([...cliBaseArgs(o.system, run, "stream"), o.prompt], o.onText, o.signal);
  const text = r.result ?? r.streamed;
  return { data: text, raw: text, usage: cliUsage(r) };
}

const cliUsage = (r: CliJson) => ({
  input: (r.usage?.input_tokens ?? 0) + (r.usage?.cache_read_input_tokens ?? 0) + (r.usage?.cache_creation_input_tokens ?? 0),
  output: r.usage?.output_tokens ?? 0,
  costUsd: r.total_cost_usd,
});

// ---------------------------------------------------------------- API provider
function apiClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY || appSettings.get().anthropicApiKey || undefined;
  return new Anthropic({ apiKey: key });
}
/** effort → thinking. low 는 thinking 없이, 그 외는 adaptive. */
function apiThinking(run: Run): { thinking?: { type: "adaptive" } } {
  return effortForProvider(run.effort, "anthropic-api").thinking ? { thinking: { type: "adaptive" } } : {};
}
async function apiText(o: AiOptions, run: Run): Promise<AiResult<string>> {
  const client = apiClient();
  const stream = client.messages.stream(
    { model: run.model, max_tokens: o.maxTokens ?? 16000, system: o.system, messages: [{ role: "user", content: o.prompt }], ...apiThinking(run) },
    { signal: o.signal },
  );
  const msg = await stream.finalMessage();
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  return { data: text, raw: text, usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens } };
}
async function apiStream(o: AiStreamOptions, run: Run): Promise<AiResult<string>> {
  const client = apiClient();
  const stream = client.messages.stream(
    { model: run.model, max_tokens: o.maxTokens ?? 16000, system: o.system, messages: [{ role: "user", content: o.prompt }], ...apiThinking(run) },
    { signal: o.signal },
  );
  let full = "";
  stream.on("text", (delta: string) => {
    full += delta;
    try { o.onText(delta, full); } catch { /* listener errors must not kill the stream */ }
  });
  const msg = await stream.finalMessage();
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("") || full;
  return { data: text, raw: text, usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens } };
}

async function apiJson<T>(o: AiOptions, run: Run, jsonSchema: Record<string, unknown>): Promise<AiResult<T>> {
  const client = apiClient();
  const stream = client.messages.stream(
    {
      model: run.model,
      ...apiThinking(run),
      max_tokens: o.maxTokens ?? 16000,
      system: o.system,
      messages: [{ role: "user", content: o.prompt }],
      output_config: { format: { type: "json_schema", schema: jsonSchema } },
    },
    { signal: o.signal },
  );
  const msg = await stream.finalMessage();
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  const data = extractJson<T>(text);
  if (data === undefined) throw new Error("AI returned invalid JSON");
  return { data, raw: text, usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens } };
}

/**
 * The local Claude Code CLI sometimes bleeds fragments of its own tool-call XML
 * (`<invoke>`/`<parameter>`/`<function_calls>`/`<...>`) into generated text or JSON string
 * fields, even with tools disabled (`--tools ""`). Strip those artifacts defensively; real content
 * (Korean planning text, HTML wireframes) never legitimately contains these exact tag names.
 */
const TOOL_ARTIFACT_RE = /<\/?(?:invoke|parameter|function_calls|antml:[a-zA-Z_]+)(?:\s[^>]*)?>/gi;
function stripToolArtifacts<T>(v: T): T {
  if (typeof v === "string") return v.replace(TOOL_ARTIFACT_RE, "").replace(/\n{3,}/g, "\n\n").trim() as unknown as T;
  if (Array.isArray(v)) return v.map(stripToolArtifacts) as unknown as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, vv]) => [k, stripToolArtifacts(vv)])) as T;
  return v;
}

// ---------------------------------------------------------------- run log
/**
 * 최근 AI 실행 기록. 설정 화면에서 "이 등급이 실제로 얼마나 걸리는지"를 실측으로 보여주고,
 * 등급을 올리고 내리는 판단을 감이 아니라 데이터로 하게 한다. 프로세스 메모리에만 있다(재시작 시 초기화).
 */
export interface AiRunRecord { at: string; task?: AiTask; tier?: AiTier; model: string; effort: AiEffort; ms: number; input: number; output: number }
const RUN_LOG_MAX = 200;
const runLog: AiRunRecord[] = [];
function logRun(o: AiOptions, run: Run, t0: number, r: AiResult<unknown>) {
  runLog.push({ at: new Date().toISOString(), task: o.task, tier: run.tier, model: run.model, effort: run.effort, ms: Date.now() - t0, input: r.usage?.input ?? 0, output: r.usage?.output ?? 0 });
  if (runLog.length > RUN_LOG_MAX) runLog.splice(0, runLog.length - RUN_LOG_MAX);
  dbg("run", { task: o.task, tier: run.tier, model: run.model, effort: run.effort, ms: Date.now() - t0 });
}
export function recentRuns(): AiRunRecord[] { return [...runLog].reverse(); }

// ---------------------------------------------------------------- public API
export async function generateText(o: AiOptions): Promise<AiResult<string>> {
  const run = resolveRun(o);
  const t0 = Date.now();
  const r = run.provider === "anthropic-api" ? await apiText(o, run) : await cliText(o, run);
  logRun(o, run, t0, r);
  return { ...r, data: stripToolArtifacts(r.data) };
}

/**
 * Streaming text generation. `onText(delta, full)` fires for every text delta.
 * Never pass a request-scoped AbortSignal here for background jobs — the child would be killed
 * as soon as the HTTP response flushes.
 */
export async function generateStream(o: AiStreamOptions): Promise<AiResult<string>> {
  const run = resolveRun(o);
  const t0 = Date.now();
  const r = run.provider === "anthropic-api" ? await apiStream(o, run) : await cliStream(o, run);
  logRun(o, run, t0, r);
  return { ...r, data: stripToolArtifacts(r.data) };
}

export const JSON_SYSTEM_SUFFIX = "이 요청에 대해서는 오직 JSON 하나만 출력합니다. 설명·인사·코드 펜스를 절대 붙이지 않습니다.";
/** 스키마를 프롬프트에 내장하는 단일 턴 지시문. 스트리밍 라우트도 같은 것을 써야 출력 형태가 같다. */
export function jsonOnlyInstruction(jsonSchema: Record<string, unknown>): string {
  return [
    "# 출력 형식 (반드시 지킬 것)",
    "아래 JSON Schema를 정확히 만족하는 JSON 값 **하나만** 출력하세요.",
    "설명 문장, 머리말, 맺음말, 코드 펜스(```), 주석을 절대 붙이지 마세요. 응답의 첫 글자는 `{`(또는 `[`), 마지막 글자는 `}`(또는 `]`) 여야 합니다.",
    "JSON Schema:",
    JSON.stringify(jsonSchema),
  ].join("\n");
}

/**
 * Schema-constrained generation. Pass a zod schema; it is converted to JSON Schema.
 *
 * Single-turn path: the schema is embedded in the prompt and the model replies with raw JSON
 * (1 model turn). If that cannot be extracted or fails zod validation, falls back **once** to the
 * provider's native structured-output mode (CLI `--json-schema`, which costs 2 turns).
 */
export async function generateJson<S extends z.ZodTypeAny>(o: AiOptions & { schema: S }): Promise<AiResult<z.infer<S>>> {
  const run = resolveRun(o);
  const { provider, model } = run;
  const jsonSchema = toJsonSchema(o.schema);
  const t0 = Date.now();

  let reason = "";
  try {
    const single: AiOptions = {
      ...o,
      system: `${o.system}\n\n${JSON_SYSTEM_SUFFIX}`,
      prompt: `${o.prompt}\n\n${jsonOnlyInstruction(jsonSchema)}`,
    };
    const res = provider === "anthropic-api" ? await apiText(single, run) : await cliText(single, run);
    const extracted = extractJson<unknown>(res.raw);
    if (extracted === undefined) reason = "no JSON found in reply";
    else {
      const parsed = o.schema.safeParse(stripToolArtifacts(extracted));
      if (parsed.success) {
        dbg("generateJson: single-turn ok", { provider, model, chars: res.raw.length });
        logRun(o, run, t0, res);
        return { ...res, data: parsed.data };
      }
      reason = `schema validation: ${parsed.error.message.slice(0, 200)}`;
    }
  } catch (e) {
    if (o.signal?.aborted) throw e;
    reason = `single-turn call failed: ${(e as Error).message.slice(0, 200)}`;
  }

  dbg("generateJson: falling back to native structured output —", reason);
  const res = provider === "anthropic-api" ? await apiJson<unknown>(o, run, jsonSchema) : await cliJson<unknown>(o, run, jsonSchema);
  const parsed = o.schema.safeParse(stripToolArtifacts(res.data));
  if (!parsed.success) throw new Error(`AI output failed schema validation: ${parsed.error.message.slice(0, 500)}`);
  logRun(o, run, t0, res);
  return { ...res, data: parsed.data };
}

export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const js = toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

export function extractJson<T>(text: string): T | undefined {
  try { return JSON.parse(text) as T; } catch { /* continue */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]) as T; } catch { /* continue */ } }
  const s = text.indexOf("{"); const e = text.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(text.slice(s, e + 1)) as T; } catch { /* continue */ } }
  const a = text.indexOf("["); const b = text.lastIndexOf("]");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)) as T; } catch { /* continue */ } }
  return undefined;
}

/** Quick health check for settings page */
export async function checkProvider(provider: AiProvider): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await generateText({ provider, system: "Reply with the single word OK.", prompt: "ping", model: "haiku" });
    return { ok: /ok/i.test(r.data), message: r.data.slice(0, 100) };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
