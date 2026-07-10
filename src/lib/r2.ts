import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 (S3-compatibile) — storage HOT del Diario/Raccolta (filone C1).
// Regola: upload sempre client→R2 diretto con presigned PUT; mai POST form (R2 → 501).

const acc = () => process.env.R2_ACCOUNT_ID ?? "";
const bucket = () => process.env.R2_BUCKET ?? "";

export function isConfigured(): boolean {
  return !!(
    acc() &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    bucket()
  );
}

/** Chiave oggetto sotto `raw/{workspaceId}/{entryId}/{nome-sanificato}`.
 *  Il nome è sanificato a un singolo segmento (nessuno slash → nessun traversal
 *  della key; le key R2 sono stringhe opache, ma restiamo prudenti). */
export function buildRawKey(
  workspaceId: string,
  entryId: string,
  filename: string
): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `raw/${workspaceId}/${entryId}/${safe}`;
}

let _client: S3Client | null = null;
export function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${acc()}.r2.cloudflarestorage.com`,
    // R2 espone l'endpoint account-level e usa il path-style (bucket nel path):
    // il virtual-hosted default dell'SDK (bucket come sottodominio) NON risolve su R2.
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
  });
  return _client;
}

/** Presigned PUT per l'upload diretto dal browser (scadenza breve). */
export function presignPut(key: string, contentType: string, expiresSec = 600) {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: expiresSec }
  );
}

/** Presigned GET per servire il media (bucket privato → route proxy). */
export function presignGet(key: string, expiresSec = 3600) {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: expiresSec }
  );
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
