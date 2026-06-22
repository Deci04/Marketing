import { describe, it, expect } from "vitest";
import { describeAction, WRITE_TOOL_NAMES } from "@/lib/chat-write-tools";

describe("describeAction", () => {
  it("summarizes a block creation with its label", () => {
    const s = describeAction("createBlockTool", { label: "Settimana 26" });
    expect(s).toContain("Settimana 26");
    expect(s).toMatch(/blocco/i);
  });

  it("includes delivery dates when present", () => {
    const s = describeAction("createBlockTool", {
      label: "S26",
      lucaDeliveryDate: "2026-06-30",
    });
    expect(s).toMatch(/consegna luca/i);
  });

  it("summarizes content creation with channel + publish date", () => {
    const s = describeAction("createContentTool", {
      title: "Reel pricing",
      channel: "INSTAGRAM",
      publishDate: "2026-06-30",
    });
    expect(s).toContain("Reel pricing");
    expect(s).toContain("INSTAGRAM");
    expect(s).toMatch(/pubblicazione/i);
  });

  it("lists changed fields for an update", () => {
    const s = describeAction("updateContentTool", { id: "c1", reach: 1000, likes: 50 });
    expect(s).toContain("reach");
    expect(s).toContain("likes");
    expect(s).not.toContain("id"); // id is not a 'changed field'
  });

  it("warns about a destructive delete", () => {
    expect(describeAction("deleteContentTool", { id: "c1" })).toMatch(/elimino/i);
  });

  it("summarizes a value conversation", () => {
    const s = describeAction("addValueConversationTool", {
      who: "@ada",
      what: "vuole una consulenza",
    });
    expect(s).toContain("@ada");
    expect(s).toContain("vuole una consulenza");
  });

  it("describes removing all classes when the list is empty", () => {
    expect(describeAction("assignClassesTool", { contentId: "c1", classIds: [] })).toMatch(
      /rimuovo tutte/i
    );
  });

  it("falls back gracefully for an unknown tool", () => {
    expect(describeAction("somethingElse", {})).toBe("Azione proposta");
  });

  it("exposes every write tool name", () => {
    expect(WRITE_TOOL_NAMES).toContain("createContentTool");
    expect(WRITE_TOOL_NAMES.length).toBeGreaterThanOrEqual(9);
  });
});
