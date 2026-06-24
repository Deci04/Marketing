import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/** The logged-in user record (incl. isAdmin), or null if no valid session.
 *  Unlike currentContext(), this does NOT require a workspace membership. */
export async function currentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return db.user.findUnique({ where: { id: session.user.id } });
}

/** Logged-in user + their first workspace (one workspace per user for now). */
export async function currentContext() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const membership = await db.membership.findFirst({
    where: { userId: session.user.id },
    include: { workspace: true, user: true },
  });
  if (!membership) return null;
  return {
    user: membership.user,
    role: membership.role,
    workspace: membership.workspace,
    workspaceId: membership.workspaceId,
  };
}
