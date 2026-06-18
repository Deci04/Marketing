import { describe, it, expect } from "vitest";
import { scopedWhere, assertSameWorkspace } from "@/lib/workspace";

describe("scopedWhere", () => {
  it("injects the workspaceId into an empty filter", () => {
    expect(scopedWhere("ws_1")).toEqual({ workspaceId: "ws_1" });
  });

  it("merges the workspaceId with an existing filter", () => {
    expect(scopedWhere("ws_1", { status: "DONE" })).toEqual({
      status: "DONE",
      workspaceId: "ws_1",
    });
  });

  it("forces the workspaceId even if the caller passed a different one", () => {
    expect(scopedWhere("ws_1", { workspaceId: "ws_2" } as never)).toEqual({
      workspaceId: "ws_1",
    });
  });
});

describe("assertSameWorkspace", () => {
  it("passes when the entity belongs to the workspace", () => {
    expect(() =>
      assertSameWorkspace("ws_1", { workspaceId: "ws_1" })
    ).not.toThrow();
  });

  it("throws when the entity belongs to another workspace", () => {
    expect(() =>
      assertSameWorkspace("ws_1", { workspaceId: "ws_2" })
    ).toThrow(/workspace/i);
  });
});
