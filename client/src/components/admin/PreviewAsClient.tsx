import EngagementRoom from "@/components/EngagementRoom";
import { RoomPreviewContext } from "@/components/room/RoomPreview";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Eye, X } from "lucide-react";
import React, { useEffect, useState } from "react";

const clearHash = () => { if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search); };

/**
 * Preview as client: the engagement's room exactly as its owner sees it, full screen over the record. Read-only: the
 * actions are switched off, and the server logs each preview.
 */
export default function PreviewAsClient({ engagementId }: { engagementId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => { clearHash(); setOpen(true); }}>
        <Eye className="mr-1 h-3.5 w-3.5" aria-hidden />Preview as client
      </Button>
      {open && <PreviewOverlay engagementId={engagementId} onClose={() => { clearHash(); setOpen(false); }} />}
    </>
  );
}

function PreviewOverlay({ engagementId, onClose }: { engagementId: number; onClose: () => void }) {
  const room = trpc.engagement.staff.previewRoom.useQuery({ engagementId }, { retry: false, refetchOnWindowFocus: false });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Preview as client" className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="flex items-center justify-between gap-3 border-b border-brand-line bg-brand-tint px-4 py-2 text-sm">
        <p className="min-w-0 truncate text-ink"><span className="font-semibold text-brand">Preview</span> · As the client sees it. Actions are off.</p>
        <Button type="button" size="sm" variant="outline" className="shrink-0 rounded-lg text-xs" onClick={onClose}><X className="mr-1 h-3.5 w-3.5" aria-hidden />Close preview</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {room.error ? <p role="alert" className="p-6 text-sm text-danger">{room.error.message}</p>
          : !room.data ? <p className="p-6 text-sm text-ink-muted">Loading…</p>
          : <RoomPreviewContext.Provider value><EngagementRoom room={room.data} /></RoomPreviewContext.Provider>}
      </div>
    </div>
  );
}
