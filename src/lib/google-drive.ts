import { google } from "googleapis";
import type { Readable } from "node:stream";
import { db } from "@/lib/db";
import { newOAuthClient, isConfigured } from "@/lib/google-calendar";

// Filone C — archivio originali su Google Drive via OAuth "come l'utente" (Luca),
// così i file sono di proprietà sua e consumano il suo spazio personale (5TB Google One).
// Scope minimo `drive.file`: l'app vede/gestisce SOLO i file che crea (no accesso al
// resto del Drive) → niente audit Google per scope restrittivi.
export const DRIVE_PROVIDER = "google-drive";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export { isConfigured };

type GoogleOAuth2Client = InstanceType<typeof google.auth.OAuth2>;

type TokenLike = {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
  scope?: string | null;
  token_type?: string | null;
};

/** Salva/aggiorna i token Drive (un'unica connessione Drive per l'app). */
export async function saveDriveTokens(
  userId: string,
  tokens: TokenLike
): Promise<void> {
  const providerAccountId = `drive:${userId}`;
  const expires_at = tokens.expiry_date
    ? Math.floor(tokens.expiry_date / 1000)
    : null;
  await db.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: DRIVE_PROVIDER,
        providerAccountId,
      },
    },
    create: {
      userId,
      type: "oauth",
      provider: DRIVE_PROVIDER,
      providerAccountId,
      access_token: tokens.access_token ?? null,
      refresh_token: tokens.refresh_token ?? null,
      expires_at,
      scope: tokens.scope ?? null,
      token_type: tokens.token_type ?? null,
    },
    update: {
      userId,
      access_token: tokens.access_token ?? null,
      expires_at,
      scope: tokens.scope ?? null,
      token_type: tokens.token_type ?? null,
      ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    },
  });
}

export async function isDriveConnected(): Promise<boolean> {
  const acc = await db.account.findFirst({
    where: { provider: DRIVE_PROVIDER, refresh_token: { not: null } },
  });
  return !!acc?.refresh_token;
}

/** Client OAuth Drive dal token salvato (rinnova l'access token se scaduto). */
async function getDriveAuthClient(): Promise<GoogleOAuth2Client | null> {
  if (!isConfigured()) return null;
  const account = await db.account.findFirst({
    where: { provider: DRIVE_PROVIDER, refresh_token: { not: null } },
    orderBy: { id: "desc" },
  });
  if (!account?.refresh_token) return null;

  const client = newOAuthClient("");
  client.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });
  const expiredSoon =
    !account.expires_at || account.expires_at * 1000 < Date.now() + 60_000;
  if (expiredSoon) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    await db.account.update({
      where: { id: account.id },
      data: {
        access_token: credentials.access_token ?? account.access_token,
        expires_at: credentials.expiry_date
          ? Math.floor(credentials.expiry_date / 1000)
          : account.expires_at,
      },
    });
  }
  return client;
}

export async function driveClient() {
  const auth = await getDriveAuthClient();
  return auth ? google.drive({ version: "v3", auth }) : null;
}

/** Carica un file su Drive (di proprietà dell'utente OAuth). Ritorna il fileId o null. */
export async function uploadToDrive(opts: {
  name: string;
  mimeType: string;
  body: Readable;
  folderId?: string | null;
}): Promise<string | null> {
  const drive = await driveClient();
  if (!drive) return null;
  const res = await drive.files.create({
    requestBody: {
      name: opts.name,
      ...(opts.folderId ? { parents: [opts.folderId] } : {}),
    },
    media: { mimeType: opts.mimeType, body: opts.body },
    fields: "id",
  });
  return res.data.id ?? null;
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const drive = await driveClient();
  if (!drive) return;
  await drive.files.delete({ fileId }).catch(() => {});
}
