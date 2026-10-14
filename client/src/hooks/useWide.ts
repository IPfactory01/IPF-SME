import { useEffect, useState } from "react";

/** Tailwind's `lg`: a laptop or a desktop, where the client room spreads into columns. */
export const WIDE_QUERY = "(min-width: 1024px)";

const matches = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(WIDE_QUERY).matches;

/**
 * Whether the screen is wide enough for the room's desktop layout. Read on the first render, so a desktop never shows
 * the phone layout first, and kept current as the window is resized. False where the browser cannot say (tests).
 */
export function useWide() {
  const [wide, setWide] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(query.matches);
    query.addEventListener?.("change", onChange);
    onChange();
    return () => query.removeEventListener?.("change", onChange);
  }, []);
  return wide;
}
