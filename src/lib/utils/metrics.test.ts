import { describe, expect, it, vi } from "vite-plus/test";
import { bodySizeBytes, newCallId, nowMs } from "./metrics";

describe("metrics (PH3-T3)", () => {
  it("newCallId genera UUID con randomUUID disponible", () => {
    expect(newCallId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(newCallId()).not.toBe(newCallId());
  });

  it("newCallId cae a getRandomValues si randomUUID lanza", () => {
    const spy = vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new Error("denied");
    });
    try {
      expect(newCallId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("bodySizeBytes mide bytes UTF-8 reales, no unidades UTF-16", () => {
    expect(bodySizeBytes({ id: 1, name: "test" })).toBe(22);
    expect(bodySizeBytes("héllo")).toBe(6);
    expect(bodySizeBytes("")).toBe(0);
  });

  it("bodySizeBytes devuelve 0 ante JSON circular en vez de romper", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => bodySizeBytes(circular)).not.toThrow();
    expect(bodySizeBytes(circular)).toBe(0);
  });

  it("nowMs devuelve un número monotónico", () => {
    const a = nowMs();
    const b = nowMs();
    expect(typeof a).toBe("number");
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
