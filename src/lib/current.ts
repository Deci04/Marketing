import { cache } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Per-request memoization: a single navigation renders the layout + page, which
// call currentUser()/currentContext() multiple times. Wrapping the session and
// membership lookups in React.cache() collapses those into one auth() decode and
// one DB query per request instead of repeating them on every call.
const getSession = cache(async () => auth());

const getMembership = cache(async (userId: string) =>
  db.membership.findFirst({
    where: { userId },
    include: { workspace: true, user: true },
  })
);

/** The logged-in user record (incl. isAdmin), or null if no valid session.
 *  Unlike currentContext(), this does NOT require a workspace membership. */
export const currentUser = cache(async () => {
  const session = await getSession();
  if (!session?.user?.id) return null;
  const membership = await getMembership(session.user.id);
  return membership?.user ?? db.user.findUnique({ where: { id: session.user.id } });
});

/** Logged-in user + their first workspace (one workspace per user for now). */
export async function currentContext() {
  const session = await getSession();
  if (!session?.user?.id) return null;
  const membership = await getMembership(session.user.id);
  if (!membership) return null;
  return {
    user: membership.user,
    role: membership.role,
    workspace: membership.workspace,
    workspaceId: membership.workspaceId,
  };
}
