import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { reloadPage } from "@/lib/reload";
import { firstNameOf } from "@shared/whatsapp";
import { Eye, X } from "lucide-react";
import React from "react";
import { toast } from "sonner";
import { formatTime } from "./format";

/**
 * Preview as a team member (R76). The banner says whose view the Super Admin is seeing and until when, with the way
 * out; the server refuses every change meanwhile, so nothing here is the control. Closing reloads Admin as themselves.
 */
export function TeamPreviewBanner({ preview }: { preview: { name: string; email: string | null; until: Date | string } }) {
  const end = trpc.adminAccess.endPreview.useMutation({ onSuccess: () => reloadPage(), onError: error => toast.error(error.message) });
  return (
    <div role="status" aria-label="Team preview" className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-brand-line bg-brand-tint px-4 py-2 text-sm">
      <p className="min-w-0 text-ink"><span className="font-semibold text-brand">Preview</span> · As {preview.name || preview.email} sees it, until {formatTime(preview.until)}. Actions are off.</p>
      <Button type="button" size="sm" variant="outline" className="shrink-0 rounded-lg text-xs" disabled={end.isPending} onClick={() => end.mutate()}><X className="mr-1 h-3.5 w-3.5" aria-hidden />Close preview</Button>
    </div>
  );
}

/** On Team, for the Super Admin: opens Admin as this person sees it, for 30 minutes, read only. Recorded on the server. */
export function PreviewAsButton({ userId, name }: { userId: number; name: string }) {
  const start = trpc.adminAccess.previewAs.useMutation({ onSuccess: () => reloadPage(), onError: error => toast.error(error.message) });
  const first = firstNameOf(name) || name;
  return (
    <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" disabled={start.isPending} aria-label={`Preview Admin as ${name} sees it`} onClick={() => start.mutate({ userId })}>
      <Eye className="mr-1 h-3.5 w-3.5" aria-hidden />Preview as {first}
    </Button>
  );
}
