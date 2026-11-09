/**
 * /check: the Business Health Check's first screen, light enough to open at once on a phone (R70). The questions, the
 * scoring and the screens' motion (pages/BusinessCheck.tsx) load in the background once the page is up, and take over
 * from this screen when they are ready; pressing the button before then starts the check as soon as they arrive.
 */
import { CheckFrame, Intro } from "@/components/check/CheckIntro";
import { usePageMeta, useStructuredData } from "@/components/SiteShell";
import { lazyPage } from "@/lib/lazyPage";
import { PAGE_META } from "@shared/pageMeta";
import React, { useEffect, useState } from "react";

const Check = lazyPage(() => import("./BusinessCheck"));

export default function CheckPage() {
  usePageMeta(PAGE_META.check.title, PAGE_META.check.description);
  useStructuredData("/check");
  const [ready, setReady] = useState<"loaded" | "start" | null>(null);
  useEffect(() => {
    let live = true;
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1));
    const handle = idle(() => void Check.preload().then(() => { if (live) setReady(current => current ?? "loaded"); }));
    return () => {
      live = false;
      (window.cancelIdleCallback ?? window.clearTimeout)(handle);
    };
  }, []);
  const start = () => void Check.preload().then(() => setReady("start"));
  if (ready) return <Check startNow={ready === "start"} />;
  return (
    <CheckFrame>
      <div data-screen="intro">
        <Intro hasProgress={false} onStart={start} onRestart={() => undefined} />
      </div>
    </CheckFrame>
  );
}
