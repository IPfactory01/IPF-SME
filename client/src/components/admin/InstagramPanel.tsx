import React from "react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../../server/routers";
import { formatDateTime } from "./format";

const SMALL_BUTTON = "rounded-none text-xs";

export type InstagramStatus = inferRouterOutputs<AppRouter>["engagement"]["staff"]["instagramStatus"];
export type InstagramPost = InstagramStatus["posts"][number];

const number = (value: number | null) => (value === null ? "–" : value.toLocaleString("en-GB"));

/** A post's figures on one line: views, likes, comments, shares, saves, and when they were read. */
export function PostFigures({ post }: { post: InstagramPost }) {
  const parts: [string, number | null][] = [["views", post.views], ["likes", post.likes], ["comments", post.comments], ["shares", post.shares], ...(post.kind === "story" ? [] : [["saves", post.saves]] as [string, number | null][])];
  return (
    <p className="text-xs text-ink-muted" aria-label="Instagram figures">
      <span className="font-semibold text-ink">Instagram</span> · posted {formatDateTime(post.postedAt)}
      {parts.map(([label, value]) => <span key={label}> · {number(value)} {label}</span>)}
      {post.metricsAt && <span> · as of {formatDateTime(post.metricsAt)}</span>}
    </p>
  );
}

/**
 * Instagram on the Content board (R108): connect the client's account once (the account owner says yes on Instagram, in
 * a new tab), then twice a day the posts are read, each published item is marked with its link, time and figures, and
 * posts not on the board are added. Only the team sees this panel.
 */
export default function InstagramPanel({ engagementId, status, canManage, onChanged }: { engagementId: number; status: InstagramStatus | undefined; canManage: boolean; onChanged: () => void }) {
  const connect = trpc.engagement.staff.instagramConnectUrl.useMutation({
    onSuccess: ({ url }) => { window.open(url, "_blank", "noopener"); },
    onError: error => toast.error(error.message),
  });
  const sync = trpc.engagement.staff.instagramSyncNow.useMutation({
    onSuccess: result => { toast.success(`Checked. ${result.read} posts read; ${result.published} marked Published; ${result.added} added.`); onChanged(); },
    onError: error => { toast.error(error.message); onChanged(); },
  });
  const disconnect = trpc.engagement.staff.instagramDisconnect.useMutation({ onSuccess: () => { toast.success("Instagram disconnected. The posts already read stay."); onChanged(); }, onError: error => toast.error(error.message) });
  if (!status) return null;
  const connection = status.connection?.status === "disconnected" ? null : status.connection;
  const unplanned = status.posts.filter(post => post.contentItemId === null).length;
  return (
    <section aria-label="Instagram" className="space-y-2 rounded-lg border border-line-soft bg-brand-tint-softest p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink">Instagram{connection && <span className="font-normal text-ink-muted"> · @{connection.username}</span>}</p>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {connection?.status === "connected" && <Button type="button" size="sm" variant="outline" className={`${SMALL_BUTTON} border-brand-line bg-paper-raised text-brand`} disabled={sync.isPending} onClick={() => sync.mutate({ engagementId })}>{sync.isPending ? "Checking…" : "Check now"}</Button>}
            {(!connection || connection.status === "needs_reconnect") && status.configured && <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={connect.isPending} onClick={() => connect.mutate({ engagementId })}>{connection ? "Connect again" : "Connect Instagram"}</Button>}
            {connection && <Button type="button" size="sm" variant="outline" className={`${SMALL_BUTTON} border-line bg-paper-raised text-ink-muted`} disabled={disconnect.isPending} onClick={() => disconnect.mutate({ engagementId })}>Disconnect</Button>}
          </div>
        )}
      </div>
      {!status.configured && !connection && <p className="text-xs text-ink-muted">Instagram is not set up on the server yet. Once it is, connect the client&apos;s account here and their posts mark this board by themselves.</p>}
      {status.configured && !connection && <p className="text-xs text-ink-muted">Connect the client&apos;s Instagram once, with the account owner signed in. Twice a day, each post marks its item Published with its link, time and figures. Posts not on the board are added.</p>}
      {connection && (
        <p className="text-xs text-ink-muted">
          {connection.lastSyncAt ? `Last checked ${formatDateTime(connection.lastSyncAt)}.` : "Not checked yet."} Checked twice a day, at 6:47 and 18:47.
          {status.posts.length > 0 && ` ${status.posts.length} posts read${unplanned ? `, ${unplanned} outside the engagement's months` : ""}.`}
        </p>
      )}
      {connection?.lastError && <p className="text-xs text-danger">{connection.lastError}</p>}
    </section>
  );
}
