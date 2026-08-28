import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn(),
}));

vi.mock("@/lib/invoke", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { createXTerminalSessionEvents } from "./xterminalSessionEvents";

function params(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "ssh-1",
    terminal: { focus: vi.fn() },
    frameGate: { enqueue: vi.fn() },
    sessionIdRef: { current: "ssh-1" },
    visibleRef: { current: false },
    lastErrorNoticeAtRef: { current: 0 },
    aiCapturingRef: { current: false },
    zmodemActiveRef: { current: false },
    inputStateRef: { current: {} },
    alternateScreenTrackerRef: { current: { ingest: vi.fn() } },
    hibernationPhaseRef: { current: "waking" },
    detachedHibernateEpochRef: { current: 1 },
    onConnectionErrorRef: { current: undefined },
    tRef: { current: (key: string) => key },
    isTerminalAlive: () => true,
    requestWake: vi.fn(),
    enterDisconnectedState: vi.fn(),
    enterDisconnectedStateIfAttachSessionMissing: vi.fn(() => false),
    noteSkippedOutput: vi.fn(),
    noteOutputActivity: vi.fn(),
    updateCredentialPromptInputMode: vi.fn(),
    feedCredentialOutput: vi.fn(),
    maybeRecoverPerformanceMode: vi.fn(),
    refreshOutputPressureMode: vi.fn(),
    noteShellCommand: vi.fn(),
    clearCredentialPromptInputMode: vi.fn(),
    dismissSuggestions: vi.fn(),
    writeTerminalTextAfterOutputQueue: vi.fn().mockResolvedValue(undefined),
    initialReplayPromise: Promise.resolve(),
    updateOutputDrainMode: vi.fn(),
    logHibernation: vi.fn(),
    zmodemHandler: { handle: vi.fn() },
    replayPendingWakeEvents: vi.fn(),
    settleOutputAfterAttach: vi.fn().mockResolvedValue(true),
    flushPendingDynamicTitle: vi.fn(),
    ...overrides,
  };
}

describe("xterminalSessionEvents listener setup failure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue(undefined);
  });

  it("keeps backend output detached until a slow listener retry succeeds", async () => {
    const disposeOutput = vi.fn();
    let listenerFailures = 0;
    mocks.listen.mockImplementation(async (eventName: string) => {
      if (eventName === "terminal-output-ssh-1") return disposeOutput;
      if (listenerFailures < 3) {
        listenerFailures += 1;
        throw new Error("listener unavailable");
      }
      return vi.fn();
    });
    const options = params();
    const events = createXTerminalSessionEvents(options as never);

    const setup = events.setup();
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.invoke).not.toHaveBeenCalledWith(
      "attach_session",
      expect.anything(),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await setup;

    expect(disposeOutput).toHaveBeenCalledTimes(3);
    expect(mocks.invoke).toHaveBeenCalledWith("attach_session", {
      sessionId: "ssh-1",
    });
    expect(options.detachedHibernateEpochRef.current).toBeNull();
    expect(options.hibernationPhaseRef.current).toBe("idle");
    expect(options.flushPendingDynamicTitle).toHaveBeenCalledTimes(1);
  });

  it("keeps publication paused when post-attach output drain times out", async () => {
    mocks.listen.mockResolvedValue(vi.fn());
    const options = params({
      settleOutputAfterAttach: vi.fn().mockResolvedValue(false),
    });
    const events = createXTerminalSessionEvents(options as never);

    await events.setup();

    expect(options.flushPendingDynamicTitle).not.toHaveBeenCalled();
    expect(options.hibernationPhaseRef.current).toBe("failed");
  });

  it("cancels retry work and resumes publication when disposed", async () => {
    mocks.listen.mockRejectedValue(new Error("listener unavailable"));
    const options = params();
    const events = createXTerminalSessionEvents(options as never);

    const setup = events.setup();
    await Promise.resolve();
    events.dispose();
    await vi.runAllTimersAsync();
    await setup;

    expect(options.flushPendingDynamicTitle).toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalledWith(
      "attach_session",
      expect.anything(),
    );
  });
});
