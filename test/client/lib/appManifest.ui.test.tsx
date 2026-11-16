/** @vitest-environment jsdom */

import React from "react";
import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useAppManifest } from "@/lib/appManifest";

afterEach(cleanup);

function Page({ who, enabled = true }: { who: "team" | "client"; enabled?: boolean }) {
  useAppManifest(who, enabled);
  return null;
}

describe("Add to Home Screen (ET, 16 November 2026)", () => {
  it("names the team's install file on the team's app, and takes it away on leaving", () => {
    const { unmount } = render(<Page who="team" />);
    expect(document.head.querySelector('link[rel="manifest"]')?.getAttribute("href")).toBe("/app-team.webmanifest");
    expect(document.head.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content")).toBe("yes");
    unmount();
    expect(document.head.querySelector('link[rel="manifest"]')).toBeNull();
  });

  it("names none in a preview inside Admin", () => {
    render(<Page who="client" enabled={false} />);
    expect(document.head.querySelector('link[rel="manifest"]')).toBeNull();
  });

  it("opens each app where its people work, from the IP Factory mark", () => {
    const team = JSON.parse(readFileSync("client/public/app-team.webmanifest", "utf8"));
    const client = JSON.parse(readFileSync("client/public/app-client.webmanifest", "utf8"));
    expect([team.start_url, client.start_url]).toEqual(["/admin", "/dashboard"]);
    for (const manifest of [team, client]) {
      expect(manifest.display).toBe("standalone");
      expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual(["/brand/app-icon-192.png", "/brand/app-icon-512.png"]);
      for (const icon of manifest.icons) expect(readFileSync(`client/public${icon.src}`).length).toBeGreaterThan(1000);
    }
  });
});
