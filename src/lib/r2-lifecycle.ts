import { PutBucketLifecycleConfigurationCommand } from "@aws-sdk/client-s3";
import { client, bucket } from "@/lib/r2";

/** Config lifecycle: cancella gli oggetti sotto `raw/` dopo `days` giorni. */
export function buildRawLifecycleConfig(days: number) {
  return {
    Rules: [
      {
        ID: "expire-raw",
        Status: "Enabled" as const,
        Filter: { Prefix: "raw/" },
        Expiration: { Days: days },
      },
    ],
  };
}

/** Applica la lifecycle rule al bucket R2 (idempotente). */
export async function applyRawLifecycle(days = 7): Promise<void> {
  await client().send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket(),
      LifecycleConfiguration: buildRawLifecycleConfig(days),
    })
  );
}
