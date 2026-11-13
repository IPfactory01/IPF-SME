import { trpc } from "@/lib/trpc";
import { FileText, Link2 } from "lucide-react";
import React, { useEffect, useState } from "react";

type StripFile = { id: number; fileName: string };
const IMAGE = /\.(png|jpe?g|gif|webp|heic|heif)$/i;
const SHOWN = 4;

/**
 * Files shared so far on an item (R89), under it in the Work Plan: images as small pictures, documents and a sent link as
 * named chips, the rest as "+N more" (all of them are in the item's panel). Opening one asks the server for a short-lived
 * link, as the panel does; nothing is public.
 */
function Strip({ files, link, getLink, label }: { files: StripFile[]; link: string | null; getLink: (fileId: number) => Promise<string>; label: string }) {
  if (!files.length && !link) return null;
  const open = (fileId: number) => void getLink(fileId).then(url => window.open(url, "_blank", "noopener")).catch(() => undefined);
  return (
    <ul aria-label={label} className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {files.slice(0, SHOWN).map(file => (
        <li key={file.id}>
          {IMAGE.test(file.fileName)
            ? <Thumb file={file} getLink={getLink} onOpen={() => open(file.id)} />
            : <button type="button" onClick={event => { event.stopPropagation(); open(file.id); }} className="inline-flex max-w-[12rem] items-center gap-1 rounded-md border border-line-soft bg-white px-2 py-1 text-xs text-ink-600 hover:border-brand"><FileText className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{file.fileName}</span></button>}
        </li>
      ))}
      {link && <li><a href={link} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()} className="inline-flex items-center gap-1 rounded-md border border-line-soft bg-white px-2 py-1 text-xs text-brand hover:border-brand"><Link2 className="h-3.5 w-3.5" aria-hidden />Link sent</a></li>}
      {files.length > SHOWN && <li className="text-xs text-ink-muted">+{files.length - SHOWN} more</li>}
    </ul>
  );
}

/** A picture's thumbnail, from a short-lived link fetched once it is on screen. */
function Thumb({ file, getLink, onOpen }: { file: StripFile; getLink: (fileId: number) => Promise<string>; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getLink(file.id).then(found => { if (live) setUrl(found); }).catch(() => undefined);
    return () => { live = false; };
    // The link is fetched once per file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);
  return (
    <button type="button" onClick={event => { event.stopPropagation(); onOpen(); }} title={file.fileName} aria-label={`Open ${file.fileName}`} className="block h-12 w-12 overflow-hidden rounded-md border border-line-soft bg-paper-sunken hover:border-brand">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[10px] text-ink-muted">{file.fileName.slice(-4)}</span>}
    </button>
  );
}

/** The strip in the client's room. */
export function ClientFileStrip({ files, link }: { files: StripFile[]; link: string | null }) {
  const fileLink = trpc.engagement.client.fileLink.useMutation();
  return <Strip files={files} link={link} label="Files shared so far" getLink={async fileId => (await fileLink.mutateAsync({ fileId })).url} />;
}

/** The strip in the team's workspace. */
export function StaffFileStrip({ files, link }: { files: StripFile[]; link: string | null }) {
  const fileLink = trpc.engagement.staff.fileLink.useMutation();
  return <Strip files={files} link={link} label="Files shared so far" getLink={async fileId => (await fileLink.mutateAsync({ fileId })).url} />;
}
