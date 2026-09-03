import type { StartupCommandRequest } from "@/lib/appSessionFactory";

const store = (() => {
  const globalStore = globalThis as typeof globalThis & {
    __nyatermTerminalSessionCwd?: Map<string, string>;
  };

  globalStore.__nyatermTerminalSessionCwd ??= new Map<string, string>();

  return globalStore.__nyatermTerminalSessionCwd;
})();

/**
 * Records the last known working directory reported by shell integration
 * (OSC 7) for a session. An empty/blank payload means the backend cleared
 * the cwd (shell integration failed), so the record is removed to avoid
 * replaying a stale guess on the next reconnect.
 */
export function recordSessionCwd(sessionId: string, cwd: string) {
  if (!cwd.trim()) {
    store.delete(sessionId);
    return;
  }
  store.set(sessionId, cwd);
}

/** Non-destructive read of the last known working directory. */
export function getSessionCwd(sessionId: string) {
  return store.get(sessionId) ?? null;
}

/**
 * Carries the last known cwd over to a reconnected session id
 * (copy-if-absent: a cwd reported by the new session itself always wins).
 */
export function carryOverSessionCwd(fromSessionId: string, toSessionId: string) {
  if (fromSessionId === toSessionId) return;
  if (store.has(toSessionId)) return;
  const cwd = store.get(fromSessionId);
  if (cwd === undefined) return;
  store.set(toSessionId, cwd);
}

/** C0 controls, DEL, and C1 controls — never replayed as terminal input. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

/**
 * Builds a `cd '<path>'` command for the given cwd. Returns null for
 * empty/blank values or paths containing any C0/C1/DEL control characters
 * (terminal line editing could otherwise erase the quoted prefix and inject
 * commands) so reconnect falls back to the default behavior.
 */
export function buildReconnectCwdCommand(cwd: string) {
  if (!cwd.trim()) return null;
  if (CONTROL_CHARS.test(cwd)) return null;
  return `cd '${cwd.replace(/'/g, "'\\''")}'`;
}

/**
 * Combines the stored cwd lookup with command building. Returns null when
 * nothing should be restored; delayMs is passed through as-is (clamping is
 * handled by buildStartupCommandPayload).
 */
export function buildReconnectCwdStartupCommand(
  sessionId: string,
  delayMs: number,
): StartupCommandRequest | undefined {
  const cwd = getSessionCwd(sessionId);
  if (cwd === null) return undefined;
  const command = buildReconnectCwdCommand(cwd);
  if (command === null) return undefined;
  return { command, delayMs };
}
