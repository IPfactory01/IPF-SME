/**
 * The Pulse inside The Shift's own site header and footer, so a visitor who comes from the site keeps the navigation
 * they know. The Pulse pages sit in this shell; nothing about it is separate from the rest of ipfactory.co.
 */
import React from "react";
import { SiteShell } from "@/components/SiteShell";

/** Height of the site header (3px rule, 60px bar, 1px border): sticky Pulse blocks sit flush beneath it. */
export const PULSE_STICKY_TOP = "top-[64px]";

export default function PulseLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell cta={false}>{children}</SiteShell>;
}
