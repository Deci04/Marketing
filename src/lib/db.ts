import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const base = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = base;

// Neon serverless va in auto-suspend quando è idle: la prima query dopo il risveglio
// fallisce con P1001 ("Can't reach database server") o P1017 (connessione chiusa dal
// server). Sono errori di CONNETTIVITÀ (la query non è stata eseguita) → ritentare è
// sicuro. Senza retry le azioni fallivano "a intermittenza" (bottoni che ogni tanto
// non rispondono). Backoff 300/600/900ms: Neon si risveglia in ~1s.
const RETRYABLE = new Set(["P1001", "P1017"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const db = base.$extends({
  query: {
    async $allOperations({ args, query }) {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          return await query(args);
        } catch (e) {
          const code = (e as { code?: string })?.code;
          if (!code || !RETRYABLE.has(code)) throw e;
          lastErr = e;
          await sleep(300 * (attempt + 1));
        }
      }
      throw lastErr;
    },
  },
});
