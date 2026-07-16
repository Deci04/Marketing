"use client";

import { useEffect, useState } from "react";
import { Bell, BellRinging } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  subscribePushAction,
  unsubscribePushAction,
} from "@/app/(app)/profilo/push-actions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** Converte la chiave VAPID base64url nel formato Uint8Array richiesto da
 *  PushManager.subscribe(applicationServerKey). Snippet standard web-push. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

type Status = "loading" | "unsupported" | "off" | "on";

export function PushToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const existing = await registration.pushManager.getSubscription();
        if (cancelled) return;
        setStatus(
          Notification.permission === "granted" && existing ? "on" : "off"
        );
      } catch {
        if (!cancelled) setStatus("unsupported");
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!VAPID_PUBLIC_KEY) return null;

  async function handleSubscribe() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permesso notifiche negato.");
        setStatus("off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          VAPID_PUBLIC_KEY as string
        ) as BufferSource,
      });
      const { endpoint } = sub;
      const { keys } = sub.toJSON();
      if (!keys?.p256dh || !keys?.auth) {
        throw new Error("Chiavi di subscription mancanti");
      }
      await subscribePushAction({
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      });
      setStatus("on");
      toast.success("Notifiche attivate su questo dispositivo");
    } catch (err) {
      console.error(err);
      toast.error("Impossibile attivare le notifiche.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnsubscribe() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await unsubscribePushAction(sub.endpoint);
      }
      setStatus("off");
      toast.success("Notifiche disattivate su questo dispositivo");
    } catch (err) {
      console.error(err);
      toast.error("Impossibile disattivare le notifiche.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Bell size={20} className="text-lavender-ink" />
        <h3 className="text-lg">Notifiche push</h3>
        {status === "on" && (
          <span className="rounded-full bg-sage px-2.5 py-1 text-[11px] font-medium text-sage-ink">
            Attive
          </span>
        )}
      </div>

      {status === "loading" && (
        <p className="text-sm text-muted-foreground">Verifica in corso…</p>
      )}

      {status === "unsupported" && (
        <p className="text-sm text-muted-foreground">
          Questo browser/dispositivo non supporta le notifiche push.
        </p>
      )}

      {status === "off" && (
        <>
          <p className="text-sm text-muted-foreground">
            Ricevi una notifica su questo dispositivo quando c&apos;è un
            aggiornamento (consegne, revisioni, commenti).
          </p>
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            <BellRinging size={16} /> Attiva notifiche su questo dispositivo
          </button>
        </>
      )}

      {status === "on" && (
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Le notifiche sono attive su questo dispositivo.
          </p>
          <button
            type="button"
            onClick={handleUnsubscribe}
            disabled={busy}
            className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-ink disabled:opacity-60"
          >
            Disattiva
          </button>
        </div>
      )}
    </div>
  );
}
