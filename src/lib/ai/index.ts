/**
 * AI adapter. Two providers:
 *  - "claude-cli": spawns the locally logged-in Claude Code CLI (`claude -p`). Uses the user's
 *    claude.ai subscription. Personal/local use only.
 *  - "anthropic-api": @anthropic-ai/sdk with ANTHROPIC_API_KEY (or key stored in settings).
 *
 * Both expose the same two calls: generateText and generateJson (schema-constrained).
 */
import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { toJSONSchema, type z } from "zod";
import { appSettings } from "@/lib/repo";
import type { AiProvider } from "@/lib/types";

export interface AiOptions {
  system: string;
  prompt: string;
  model?: string;
  provider?: AiProvider;
  maxTokens?: number;
  signal?: AbortSignal;
}
export interface AiResult<T> {
  data: T;
  raw: string;
  usage?: { input: number; output: number; costUsd?: number };
}

function resolveModel(model: string | undefined, provider: AiProvider): string {
  const m = model ?? appSettings.get().model ?? "sonnet";
  if (provider === "claude-cli") return m; // CLI accepts aliases (sonnet/opus/haiku) or full ids
  const alias: Record<string, string> = { sonnet: "claude-sonnet-5", opus: "claude-opus-5", haiku: "claude-haiku-4-5" };
  return alias[m] ?? m;
}

// ---------------------------------------------------------------- CLI provider
interface CliJson {
  result?: string;
  structured_output?: unknown;
  is_error?: boolean;
  subtype?: string;
  api_error_status?: number | string | null;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}

function runCli(args: string[], signal?: AbortSignal): Promise<CliJson> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE; // allow nesting when launched from inside Claude Code
    delete env.CLAUDE_CODE_ENTRYPOINT;
    const child = spawn("claude", args, { env, stdio: ["ignore", "pipe", "pipe"], signal });
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
        if (parsed.is_error) {
          const detail = [parsed.result, parsed.subtype, parsed.api_error_status != null ? `api_error_status=${parsed.api_error_status}` : "", err.trim()].filter(Boolean).join(" | ") || "unknown";
          return reject(new Error(`claude CLI error: ${detail}`.slice(0, 2000)));
        }
        resolve(parsed);
      } catch (e) {
        reject(new Error(`claude CLI returned non-JSON (exit ${code}): ${(e as Error).message}\n${out.slice(0, 500)}`));
      }
    });
  });
}

function cliBaseArgs(system: string, model: string): string[] {
  return [
    "-p",
    "--output-format", "json",
    "--model", model,
    "--tools", "",
    "--no-session-persistence",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--permission-mode", "dontAsk",
    "--system-prompt", system,
  ];
}

async function cliText(o: AiOptions, model: string): Promise<AiResult<string>> {
  const r = await runCli([...cliBaseArgs(o.system, model), o.prompt], o.signal);
  return { data: r.result ?? "", raw: r.result ?? "", usage: cliUsage(r) };
}
async function cliJson<T>(o: AiOptions, model: string, jsonSchema: Record<string, unknown>): Promise<AiResult<T>> {
  const r = await runCli([...cliBaseArgs(o.system, model), "--json-schema", JSON.stringify(jsonSchema), o.prompt], o.signal);
  let data = r.structured_output as T | undefined;
  if (data === undefined && r.result) data = extractJson<T>(r.result);
  if (data === undefined) throw new Error("AI returned no structured output");
  return { data, raw: r.result ?? JSON.stringify(data), usage: cliUsage(r) };
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
async function apiText(o: AiOptions, model: string): Promise<AiResult<string>> {
  const client = apiClient();
  const stream = client.messages.stream(
    { model, max_tokens: o.maxTokens ?? 16000, system: o.system, messages: [{ role: "user", content: o.prompt }] },
    { signal: o.signal },
  );
  const msg = await stream.finalMessage();
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  return { data: text, raw: text, usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens } };
}
async function apiJson<T>(o: AiOptions, model: string, jsonSchema: Record<string, unknown>): Promise<AiResult<T>> {
  const client = apiClient();
  const stream = client.messages.stream(
    {
      model,
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

// ---------------------------------------------------------------- public API
export async function generateText(o: AiOptions): Promise<AiResult<string>> {
  const provider = o.provider ?? appSettings.get().aiProvider;
  const model = resolveModel(o.model, provider);
  const r = provider === "anthropic-api" ? await apiText(o, model) : await cliText(o, model);
  return { ...r, data: stripToolArtifacts(r.data) };
}

/** Schema-constrained generation. Pass a zod schema; it is converted to JSON Schema. */
export async function generateJson<S extends z.ZodTypeAny>(o: AiOptions & { schema: S }): Promise<AiResult<z.infer<S>>> {
  const provider = o.provider ?? appSettings.get().aiProvider;
  const model = resolveModel(o.model, provider);
  const jsonSchema = toJsonSchema(o.schema);
  const res = provider === "anthropic-api" ? await apiJson<unknown>(o, model, jsonSchema) : await cliJson<unknown>(o, model, jsonSchema);
  const cleaned = stripToolArtifacts(res.data);
  const parsed = o.schema.safeParse(cleaned);
  if (!parsed.success) throw new Error(`AI output failed schema validation: ${parsed.error.message.slice(0, 500)}`);
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
