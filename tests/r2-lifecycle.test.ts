import { describe, it, expect } from "vitest";
import { buildRawLifecycleConfig } from "@/lib/r2-lifecycle";

describe("buildRawLifecycleConfig", () => {
  it("expira il prefisso raw/ dopo N giorni", () => {
    const cfg = buildRawLifecycleConfig(7);
    const rule = cfg.Rules[0];
    expect(rule.Status).toBe("Enabled");
    expect(rule.Filter?.Prefix).toBe("raw/");
    expect(rule.Expiration?.Days).toBe(7);
  });
});
