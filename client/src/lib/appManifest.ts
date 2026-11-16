import { useEffect } from "react";

/**
 * "Add to Home Screen" (ET, 16 November 2026): on the team's app and in a client's room the page names its install file,
 * so The Shift opens from an icon, full screen, at the right place (/admin for the team, /dashboard for a client). The
 * public website names none, so it is not offered as an app. Off while `enabled` is false (a preview inside Admin).
 */
export function useAppManifest(who: "team" | "client", enabled = true) {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return undefined;
    const added: HTMLElement[] = [];
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = `/app-${who}.webmanifest`;
    added.push(link);
    for (const [name, content] of [["apple-mobile-web-app-capable", "yes"], ["mobile-web-app-capable", "yes"], ["apple-mobile-web-app-title", "The Shift"]]) {
      const meta = document.createElement("meta");
      meta.name = name!;
      meta.content = content!;
      added.push(meta);
    }
    for (const element of added) document.head.appendChild(element);
    return () => { for (const element of added) element.remove(); };
  }, [who, enabled]);
}
