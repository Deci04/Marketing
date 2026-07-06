import {
  extractStartCode,
  getFilePath as realGetFilePath,
  downloadFile as realDownloadFile,
  sendMessage as realSendMessage,
  type TelegramUpdate,
} from "@/lib/telegram";
import { linkTelegramChat, resolveWorkspaceForChat } from "@/lib/telegram-link";
import { createDiaryEntry } from "@/lib/diary";
import { describePhoto as realDescribePhoto } from "@/lib/diary-vision";

export type IntakeDeps = {
  sendMessage?: (chatId: string, text: string) => Promise<void>;
  getFilePath?: (fileId: string) => Promise<string | null>;
  downloadFile?: (filePath: string) => Promise<Uint8Array | null>;
  describePhoto?: (
    bytes: Uint8Array,
    caption?: string | null
  ) => Promise<{ aiTitle: string; aiDescription: string } | null>;
};

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  deps: IntakeDeps = {}
): Promise<{ status: "linked" | "saved" | "ignored" }> {
  const sendMessage = deps.sendMessage ?? realSendMessage;
  const getFilePath = deps.getFilePath ?? realGetFilePath;
  const downloadFile = deps.downloadFile ?? realDownloadFile;
  const describePhoto = deps.describePhoto ?? realDescribePhoto;

  const msg = update.message;
  if (!msg) return { status: "ignored" };
  const chatId = String(msg.chat.id);

  // 1) Collegamento: /start <code>
  const code = extractStartCode(msg.text);
  if (code) {
    const res = await linkTelegramChat(code, chatId);
    await sendMessage(
      chatId,
      res.ok
        ? `Collegato ✅ Ciao ${res.userName ?? ""}! Da ora scrivimi note, foto e video: finiranno nel tuo diario.`
        : "Codice non valido o scaduto. Apri il tool → Profilo → Collega Telegram per un nuovo codice."
    );
    return { status: res.ok ? "linked" : "ignored" };
  }

  // 2) Mappatura chat → workspace
  const mapped = await resolveWorkspaceForChat(chatId);
  if (!mapped) {
    await sendMessage(
      chatId,
      "Questa chat non è collegata. Apri il tool → Profilo → Collega Telegram e inviami /start <codice>."
    );
    return { status: "ignored" };
  }

  // 3) Classificazione media + eventuale vision (byte TRANSITORI, mai su Blob)
  let telegramFileId: string | null = null;
  let telegramFileType: string | null = null;
  let aiTitle: string | null = null;
  let aiDescription: string | null = null;

  if (msg.photo && msg.photo.length > 0) {
    telegramFileType = "photo";
    telegramFileId = msg.photo[msg.photo.length - 1].file_id; // size max = ultimo
    const path = await getFilePath(telegramFileId);
    if (path) {
      const bytes = await downloadFile(path);
      if (bytes && bytes.length > 0) {
        const desc = await describePhoto(bytes, msg.caption ?? null);
        if (desc) {
          aiTitle = desc.aiTitle;
          aiDescription = desc.aiDescription;
        }
      }
      // bytes esce di scope qui: nessuna persistenza dei byte.
    }
  } else if (msg.video) {
    telegramFileType = "video";
    telegramFileId = msg.video.file_id; // niente vision sul video: si usa la caption
  } else if (msg.document) {
    telegramFileType = "document";
    telegramFileId = msg.document.file_id;
  }

  await createDiaryEntry(mapped.workspaceId, {
    authorUserId: mapped.userId,
    rawText: msg.text ?? null,
    caption: msg.caption ?? null,
    telegramFileId,
    telegramFileType,
    aiTitle,
    aiDescription,
  });

  await sendMessage(chatId, "Salvato nel diario ✅");
  return { status: "saved" };
}
