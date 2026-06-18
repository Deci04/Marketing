/** Merge a mandatory workspaceId into a Prisma `where` filter.
 * The workspaceId always wins, so a caller can never widen the scope. */
export function scopedWhere<T extends Record<string, unknown>>(
  workspaceId: string,
  where?: T
): T & { workspaceId: string } {
  return { ...(where ?? ({} as T)), workspaceId };
}

/** Guard: throw if an already-loaded entity is not in the expected workspace. */
export function assertSameWorkspace(
  workspaceId: string,
  entity: { workspaceId: string }
): void {
  if (entity.workspaceId !== workspaceId) {
    throw new Error(
      `Cross-workspace access denied (expected ${workspaceId}, got ${entity.workspaceId})`
    );
  }
}
