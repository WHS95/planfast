/**
 * Auto-save versions: called (lazily) from projects.touch()/update(). If the newest auto version
 * for the project is older than 10 minutes (or none), snapshot the project.
 * An in-memory map of last-check times keeps this from hitting the DB on every touch.
 */
import { get } from "@/lib/db";

const INTERVAL_MS = 10 * 60 * 1000;
const CHECK_EVERY_MS = 30 * 1000;
const lastCheck = new Map<string, number>();
const inFlight = new Set<string>();

function koTime(d = new Date()) {
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export async function maybeAutoSnapshot(projectId: string): Promise<boolean> {
  const t = Date.now();
  const last = lastCheck.get(projectId) ?? 0;
  if (t - last < CHECK_EVERY_MS || inFlight.has(projectId)) return false;
  lastCheck.set(projectId, t);
  inFlight.add(projectId);
  try {
    const { versions } = await import("./misc");
    const { projects } = await import("./projects");
    if (!projects.get(projectId)) return false;
    const row = get<{ created_at: string }>("SELECT created_at FROM versions WHERE project_id=? AND auto=1 ORDER BY created_at DESC LIMIT 1", projectId);
    if (row && t - new Date(row.created_at).getTime() < INTERVAL_MS) return false;
    versions.create(projectId, `자동 저장 ${koTime()}`, true);
    return true;
  } catch (e) {
    console.error("[autosnapshot]", e);
    return false;
  } finally {
    inFlight.delete(projectId);
  }
}
