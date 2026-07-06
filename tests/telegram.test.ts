import { describe, it, expect, beforeEach } from "vitest";
import { verifyWebhookSecret, extractStartCode } from "@/lib/telegram";

describe("telegram helpers", () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "s3cr3t";
  });

  it("accetta solo l'header col secret esatto", () => {
    expect(verifyWebhookSecret("s3cr3t")).toBe(true);
    expect(verifyWebhookSecret("altro")).toBe(false);
    expect(verifyWebhookSecret(null)).toBe(false);
  });

  it("rifiuta se il secret env è vuoto (fail-closed)", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "";
    expect(verifyWebhookSecret("")).toBe(false);
  });

  it("estrae il codice da /start <code>", () => {
    expect(extractStartCode("/start ABC123")).toBe("ABC123");
    expect(extractStartCode("/start")).toBe(null);
    expect(extractStartCode("ciao")).toBe(null);
    expect(extractStartCode(undefined)).toBe(null);
  });
});
