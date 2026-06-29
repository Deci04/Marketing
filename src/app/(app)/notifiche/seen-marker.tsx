"use client";

import { useEffect } from "react";
import { markNotificationsSeenAction } from "@/app/(app)/contenuti/actions";

/** Marks the activity feed as seen on mount, clearing the unread bell count. */
export function SeenMarker() {
  useEffect(() => {
    void markNotificationsSeenAction();
  }, []);
  return null;
}
