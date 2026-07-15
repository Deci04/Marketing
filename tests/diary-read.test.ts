import { describe, it, expect } from "vitest";
import { shouldServeFromDrive } from "@/lib/diary-read";

const now = new Date("2026-07-15T12:00:00Z");

describe("shouldServeFromDrive", () => {
  it("false se non archiviato (nessun driveFileId)", () => {
    expect(shouldServeFromDrive({ driveFileId: null, createdAt: new Date("2026-01-01") }, now)).toBe(false);
  });
  it("false entro il cutover di 6 giorni (R2 ancora caldo)", () => {
    const created = new Date("2026-07-10T12:00:00Z"); // 5 giorni fa
    expect(shouldServeFromDrive({ driveFileId: "abc", createdAt: created }, now)).toBe(false);
  });
  it("true oltre 6 giorni e archiviato", () => {
    const created = new Date("2026-07-08T11:00:00Z"); // >6 giorni fa
    expect(shouldServeFromDrive({ driveFileId: "abc", createdAt: created }, now)).toBe(true);
  });
});
