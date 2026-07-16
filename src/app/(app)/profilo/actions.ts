"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { currentUser, currentContext } from "@/lib/current";
import { disconnectAccount } from "@/lib/zernio";
import { stopWatch, GOOGLE_PROVIDER } from "@/lib/google-calendar";

async function requireAdmin() {
  const u = await currentUser();
  if (!u?.isAdmin) throw new Error("Non autorizzato");
  return u;
}

/** Invite (or re-role) a user into a workspace by email. The account is created
 *  if it doesn't exist; the person gains access on their next login/reload. */
export async function inviteUserAction(formData: FormData) {
  await requireAdmin();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const role =
    String(formData.get("role") ?? "COLLABORATOR") === "ADMIN"
      ? Role.ADMIN
      : Role.COLLABORATOR;
  if (!workspaceId || !email.includes("@")) return;

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });
  await db.membership.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
    update: { role },
    create: { userId: user.id, workspaceId, role },
  });
  revalidatePath(`/profilo/spazi/${workspaceId}`);
  revalidatePath("/profilo");
}

/** Create a new workspace (space) and add the admin as a member. */
export async function createWorkspaceAction(formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const ws = await db.workspace.create({ data: { name } });
  await db.membership.create({
    data: { userId: admin.id, workspaceId: ws.id, role: Role.ADMIN },
  });
  revalidatePath("/profilo");
}

/** Disconnette un account social: lo stacca da Zernio + rimuove la riga locale. Solo admin. */
export async function disconnectSocialAccountAction(formData: FormData) {
  await requireAdmin();
  const zernioAccountId = String(formData.get("zernioAccountId") ?? "").trim();
  if (!zernioAccountId) return;
  await disconnectAccount(zernioAccountId);
  await db.socialAccount.deleteMany({ where: { zernioAccountId } });
  revalidatePath("/profilo");
}

/** Disconnette Google Calendar: ferma il watch-channel, rimuove config e token. */
export async function disconnectGoogleCalendarAction() {
  await requireAdmin();
  const ctx = await currentContext();
  if (ctx) {
    await stopWatch(ctx.workspaceId).catch(() => {});
    await db.googleCalendarConfig.deleteMany({
      where: { workspaceId: ctx.workspaceId },
    });
  }
  await db.account.deleteMany({ where: { provider: GOOGLE_PROVIDER } });
  revalidatePath("/profilo");
}

/** Disconnette Google Drive: rimuove il token OAuth salvato. */
export async function disconnectGoogleDriveAction() {
  await requireAdmin();
  await db.account.deleteMany({ where: { provider: "google-drive" } });
  revalidatePath("/profilo");
}

/** Remove a member from a workspace. */
export async function removeMemberAction(formData: FormData) {
  await requireAdmin();
  const membershipId = String(formData.get("membershipId") ?? "");
  const workspaceId = String(formData.get("workspaceId") ?? "");
  if (!membershipId) return;
  await db.membership.delete({ where: { id: membershipId } });
  if (workspaceId) revalidatePath(`/profilo/spazi/${workspaceId}`);
  revalidatePath("/profilo");
}
