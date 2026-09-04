/** Route handler helpers (server). */
import { NextResponse } from "next/server";

export function ok(data: unknown, init?: ResponseInit) { return NextResponse.json(data, init); }
export function bad(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }
export function notFound(what = "not found") { return bad(what, 404); }

/** Wrap a handler with uniform error handling */
export function handler<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<Response> | Response) {
  return async (req: Request, ctx: Ctx) => {
    try { return await fn(req, ctx); } catch (e) {
      console.error(e);
      return bad((e as Error).message ?? "internal error", 500);
    }
  };
}
export type Params<T extends string> = { params: Promise<Record<T, string>> };
