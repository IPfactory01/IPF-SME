import React from "react";
import { isDelivery } from "@shared/agreement";
import type { EngagementDeliverableKind } from "@shared/engagement";
import type { EngagementType } from "@shared/engagementTypes";

/**
 * Said before a share that bills (R36): when this deliverable is the engagement's main output and a second half has no
 * date yet, sharing it dates that half seven days ahead and emails the client its link.
 */
export default function DeliveryShareNote({ type, kind, balanceWaiting }: { type: EngagementType; kind: EngagementDeliverableKind; balanceWaiting: boolean }) {
  if (!balanceWaiting || !isDelivery(type, kind)) return null;
  return <p className="text-xs text-ink-muted">Sharing this is the delivery. The second half falls due seven days from today, and the client is emailed its link.</p>;
}
