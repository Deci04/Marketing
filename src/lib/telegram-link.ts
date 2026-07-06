import { db } from "@/lib/db";

/** Codice breve, leggibile, non-ambiguo. */
function newCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function setTelegramLinkCode(userId: string): Promise<string> {
  const code = newCode();
  await db.user.update({ where: { id: userId }, data: { telegramLinkCode: code } });
  return code;
}

export async function linkTelegramChat(
  code: string,
  chatId: string
): Promise<{ ok: boolean; userName: string | null }> {
  if (!code || !chatId) return { ok: false, userName: null };
  const user = await db.user.findFirst({ where: { telegramLinkCode: code } });
  if (!user) return { ok: false, userName: null };
  // telegramChatId è @unique: libera un eventuale vecchio proprietario di quella chat.
  await db.user.updateMany({
    where: { telegramChatId: chatId, NOT: { id: user.id } },
    data: { telegramChatId: null },
  });
  await db.user.update({
    where: { id: user.id },
    data: { telegramChatId: chatId, telegramLinkCode: null },
  });
  return { ok: true, userName: user.name ?? user.email };
}

export async function resolveWorkspaceForChat(
  chatId: string
): Promise<{ userId: string; workspaceId: string } | null> {
  const user = await db.user.findUnique({ where: { telegramChatId: chatId } });
  if (!user) return null;
  const membership = await db.membership.findFirst({ where: { userId: user.id } });
  if (!membership) return null;
  return { userId: user.id, workspaceId: membership.workspaceId };
}

/** Consumato dal filone N per trovare il chatId del destinatario di una notifica. */
export async function chatIdForUser(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  return user?.telegramChatId ?? null;
}
