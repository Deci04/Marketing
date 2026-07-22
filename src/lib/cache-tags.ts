/** Cache tag for a workspace's content list (`listContents`), used by
 *  `unstable_cache` (see src/lib/content.ts) and invalidated via
 *  `revalidateTag` by every server action that mutates a Content. */
export function contentsTag(workspaceId: string): string {
  return `contents:${workspaceId}`;
}
