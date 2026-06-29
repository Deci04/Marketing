import { notFound } from "next/navigation";
import { currentContext } from "@/lib/current";
import { getContent, engagementRate } from "@/lib/content";
import { listClasses } from "@/lib/classes";
import { effectiveStatus } from "@/lib/status";
import {
  ContentModal,
  type ModalContent,
  type ModalComment,
  type ModalMaterial,
} from "@/components/content-modal";

export default async function ContentModalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await currentContext();
  if (!ctx) return null;
  const [c, allClasses] = await Promise.all([
    getContent(ctx.workspaceId, id),
    listClasses(ctx.workspaceId),
  ]);
  if (!c) notFound();

  const er = engagementRate(c);
  const content: ModalContent = {
    id: c.id,
    title: c.title,
    channel: c.channel as "INSTAGRAM" | "YOUTUBE",
    format: c.format ?? null,
    classes: c.classes.map((cl) => ({ id: cl.id, name: cl.name, color: cl.color })),
    status: effectiveStatus(c.statusOverride, {
      publishAt: c.publishAt,
      lucaDeliveryAt: c.block?.lucaDeliveryAt ?? null,
      matteoDeliveryAt: c.block?.matteoDeliveryAt ?? null,
    }),
    statusOverride: c.statusOverride ?? null,
    hook: c.hook,
    publishAt: c.publishAt ? c.publishAt.toISOString() : null,
    publishAtInput: c.publishAt ? c.publishAt.toISOString().slice(0, 10) : null,
    thumbnailUrl: c.thumbnailUrl,
    materialsUrl: c.materialsUrl ?? null,
    videoProxyUrl: c.videoProxyUrl ?? null,
    masterLink: c.masterLink ?? null,
    deliveredAt: c.deliveredAt ? c.deliveredAt.toISOString() : null,
    confirmedAt: c.confirmedAt ? c.confirmedAt.toISOString() : null,
    hasMontato: c.videoProxyUrl != null || c.materials.length > 0,
    block: c.block
      ? {
          label: c.block.label,
          lucaDeliveryAt: c.block.lucaDeliveryAt ? c.block.lucaDeliveryAt.toISOString() : null,
          matteoDeliveryAt: c.block.matteoDeliveryAt ? c.block.matteoDeliveryAt.toISOString() : null,
        }
      : null,
    views: c.views ?? null,
    er: er != null ? Math.round(er * 1000) / 10 : null,
    reach: c.reach ?? null,
    nonFollowerPct: c.nonFollowerPct ?? null,
    likes: c.likes ?? null,
    commentsCount: c.commentsCount ?? null,
    saves: c.saves ?? null,
    shares: c.shares ?? null,
    followsGenerated: c.followsGenerated ?? null,
  };

  const comments: ModalComment[] = c.comments.map((cm) => ({
    id: cm.id,
    body: cm.body,
    author: cm.author?.name ?? cm.author?.email ?? "—",
    createdAt: cm.createdAt.toISOString(),
    videoTimestamp: cm.videoTimestamp ?? null,
    audioUrl: cm.audioUrl ?? null,
  }));

  const materials: ModalMaterial[] = c.materials.map((m) => ({
    id: m.id,
    kind: m.kind as "image" | "video",
    url: m.url,
    order: m.order,
  }));

  return (
    <ContentModal
      content={content}
      comments={comments}
      materials={materials}
      allClasses={allClasses}
    />
  );
}
