import { currentContext } from "@/lib/current";
import {
  getOrCreateWorkspaceThread,
  loadThreadMessages,
} from "@/lib/chat";

export const dynamic = "force-dynamic";

/** Load the shared workspace thread + its attributed message history. */
export async function GET() {
  const ctx = await currentContext();
  if (!ctx) {
    return new Response("Unauthorized", { status: 401 });
  }
  const thread = await getOrCreateWorkspaceThread(ctx.workspaceId);
  const messages = await loadThreadMessages(ctx.workspaceId, thread.id);
  return Response.json({
    threadId: thread.id,
    currentUserId: ctx.user.id,
    messages,
  });
}
