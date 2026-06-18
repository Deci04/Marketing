import { describe, it, expect } from "vitest";
import { deriveStatus } from "@/lib/status";

const now = new Date("2026-06-18T12:00:00Z");
const past = new Date("2026-06-10T12:00:00Z");
const future = new Date("2026-06-25T12:00:00Z");

describe("deriveStatus", () => {
  it("is 'Da consegnare' when nothing has passed", () => {
    expect(deriveStatus({}, now)).toBe("Da consegnare");
    expect(
      deriveStatus(
        { lucaDeliveryAt: future, matteoDeliveryAt: future, publishAt: future },
        now
      )
    ).toBe("Da consegnare");
  });

  it("is 'Consegnato' when Luca's delivery has passed", () => {
    expect(deriveStatus({ lucaDeliveryAt: past }, now)).toBe("Consegnato");
  });

  it("is 'Revisionato' when Matteo's delivery has passed", () => {
    expect(
      deriveStatus({ lucaDeliveryAt: past, matteoDeliveryAt: past }, now)
    ).toBe("Revisionato");
  });

  it("is 'Pubblicato' when publication has passed (wins over the rest)", () => {
    expect(
      deriveStatus(
        { lucaDeliveryAt: past, matteoDeliveryAt: past, publishAt: past },
        now
      )
    ).toBe("Pubblicato");
  });
});
