/** Giorni oltre i quali si serve da Drive (< finestra lifecycle R2 di 7g, per overlap). */
export const RAW_DRIVE_CUTOVER_DAYS = 6;

export function shouldServeFromDrive(
  entry: { driveFileId: string | null; createdAt: Date },
  now: Date
): boolean {
  if (!entry.driveFileId) return false;
  const ageMs = now.getTime() - entry.createdAt.getTime();
  return ageMs > RAW_DRIVE_CUTOVER_DAYS * 86_400_000;
}
