import { describe, expect, it } from "vitest";
import {
  buildReconnectCwdCommand,
  buildReconnectCwdStartupCommand,
  carryOverSessionCwd,
  getSessionCwd,
  recordSessionCwd,
} from "./terminalSessionCwd";

describe("buildReconnectCwdCommand", () => {
  it("returns null for an empty string", () => {
    expect(buildReconnectCwdCommand("")).toBeNull();
  });

  it("returns null for a blank string", () => {
    expect(buildReconnectCwdCommand("   ")).toBeNull();
  });

  it("returns null for paths with control characters", () => {
    expect(buildReconnectCwdCommand("/tmp/a\nb")).toBeNull();
    expect(buildReconnectCwdCommand("/tmp/a\rb")).toBeNull();
    expect(buildReconnectCwdCommand("/tmp/a\0b")).toBeNull();
  });

  it("wraps a plain path in single quotes", () => {
    expect(buildReconnectCwdCommand("/home/user")).toBe("cd '/home/user'");
  });

  it("keeps spaces inside the quotes", () => {
    expect(buildReconnectCwdCommand("/home/my dir")).toBe("cd '/home/my dir'");
  });

  it("escapes single quotes the POSIX way", () => {
    expect(buildReconnectCwdCommand("/home/o'brien")).toBe("cd '/home/o'\\''brien'");
  });

  it("keeps dollar signs as literals", () => {
    expect(buildReconnectCwdCommand("/home/a$b")).toBe("cd '/home/a$b'");
  });

  it("keeps backslashes as literals", () => {
    expect(buildReconnectCwdCommand("/home/a\\b")).toBe("cd '/home/a\\b'");
  });

  it("supports unicode paths", () => {
    expect(buildReconnectCwdCommand("/home/用户")).toBe("cd '/home/用户'");
  });
});

describe("recordSessionCwd / getSessionCwd", () => {
  it("round-trips a recorded cwd without consuming it", () => {
    recordSessionCwd("cwd-roundtrip", "/var/log");
    expect(getSessionCwd("cwd-roundtrip")).toBe("/var/log");
    expect(getSessionCwd("cwd-roundtrip")).toBe("/var/log");
  });

  it("removes the record when the payload is empty", () => {
    recordSessionCwd("cwd-clear", "/var/log");
    recordSessionCwd("cwd-clear", "");
    expect(getSessionCwd("cwd-clear")).toBeNull();
  });

  it("removes the record when the payload is blank", () => {
    recordSessionCwd("cwd-clear-blank", "/var/log");
    recordSessionCwd("cwd-clear-blank", "   ");
    expect(getSessionCwd("cwd-clear-blank")).toBeNull();
  });

  it("returns null for an unknown session", () => {
    expect(getSessionCwd("cwd-unknown")).toBeNull();
  });
});

describe("carryOverSessionCwd", () => {
  it("copies the cwd to a session without a record", () => {
    recordSessionCwd("carry-from", "/opt");
    carryOverSessionCwd("carry-from", "carry-to");
    expect(getSessionCwd("carry-to")).toBe("/opt");
  });

  it("keeps the target session's own cwd", () => {
    recordSessionCwd("carry-from-own", "/opt");
    recordSessionCwd("carry-to-own", "/srv");
    carryOverSessionCwd("carry-from-own", "carry-to-own");
    expect(getSessionCwd("carry-to-own")).toBe("/srv");
  });

  it("does nothing when the source has no record", () => {
    carryOverSessionCwd("carry-from-missing", "carry-to-missing");
    expect(getSessionCwd("carry-to-missing")).toBeNull();
  });

  it("does nothing for identical session ids", () => {
    recordSessionCwd("carry-same", "/opt");
    carryOverSessionCwd("carry-same", "carry-same");
    expect(getSessionCwd("carry-same")).toBe("/opt");
  });
});

describe("buildReconnectCwdStartupCommand", () => {
  it("returns undefined when no cwd was recorded", () => {
    expect(buildReconnectCwdStartupCommand("startup-unknown", 1000)).toBeUndefined();
  });

  it("returns undefined when the recorded cwd cannot be replayed", () => {
    recordSessionCwd("startup-invalid", "   ");
    expect(buildReconnectCwdStartupCommand("startup-invalid", 1000)).toBeUndefined();
  });

  it("builds the startup command with the passed delay", () => {
    recordSessionCwd("startup-ok", "/opt/app");
    expect(buildReconnectCwdStartupCommand("startup-ok", 1000)).toEqual({
      command: "cd '/opt/app'",
      delayMs: 1000,
    });
  });

  it("passes a zero delay through unchanged", () => {
    recordSessionCwd("startup-zero-delay", "/opt/app");
    expect(buildReconnectCwdStartupCommand("startup-zero-delay", 0)).toEqual({
      command: "cd '/opt/app'",
      delayMs: 0,
    });
  });
});
