import { handler, ok } from "@/lib/http";
import { appSettings } from "@/lib/repo";
import { checkProvider } from "@/lib/ai";
import type { AiProvider } from "@/lib/types";

export const GET = handler(async () => ok(appSettings.get()));
export const PATCH = handler(async (req) => { appSettings.set(await req.json()); return ok(appSettings.get()); });
export const POST = handler(async (req) => {
  const { provider } = (await req.json()) as { provider: AiProvider };
  return ok(await checkProvider(provider));
});
