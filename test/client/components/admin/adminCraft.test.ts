/**
 * The admin console's craft rules: colours come from the theme, record drawers slide in and out along the same edge
 * (a fade for people who ask for less motion), and every button answers the moment it is pressed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const adminFiles = [
  ...readdirSync("client/src/components/admin").filter(name => name.endsWith(".tsx")).map(name => join("client/src/components/admin", name)),
  "client/src/pages/Admin.tsx",
];

describe("the admin console", () => {
  it("uses theme colours only, never Tailwind's palette, so status colours match the rest of the platform", () => {
    const palette = /\b(?:bg|text|border|ring|fill|stroke)-(?:rose|red|amber|yellow|emerald|green|lime|orange|sky|blue|indigo|violet|purple|pink|slate|gray|zinc|neutral|stone)-\d{2,3}\b/;
    const offenders = adminFiles.filter(path => palette.test(read(path)));
    expect(offenders).toEqual([]);
  });

  it("slides record drawers in from the right and back out to the right, with mirrored easing and a fade for reduced motion", () => {
    expect(read("client/src/components/admin/AdminPrimitives.tsx")).toContain("data-record-drawer");
    const css = read("client/src/index.css");
    expect(css).toMatch(/@keyframes record-drawer-in\s*\{\s*from\s*\{\s*transform:\s*translateX\(100%\)/);
    expect(css).toMatch(/@keyframes record-drawer-out\s*\{\s*from\s*\{\s*transform:\s*none;\s*\}\s*to\s*\{\s*transform:\s*translateX\(100%\)/);
    expect(css).toMatch(/\[data-record-drawer\]\[data-state="open"\]\s*\{\s*animation:\s*record-drawer-in/);
    expect(css).toMatch(/\[data-record-drawer\]\[data-state="closed"\]\s*\{\s*animation:\s*record-drawer-out/);
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\[data-record-drawer\]\[data-state="open"\]\s*\{\s*animation:\s*scrim-in/);
  });

  it("dims the page behind a drawer with the ink colour, not plain black", () => {
    const sheet = read("client/src/components/ui/sheet.tsx");
    expect(sheet).toContain("bg-ink/40");
    expect(sheet).not.toContain("bg-black/50");
  });

  it("presses buttons and rows in on pointer-down, and keeps them still for reduced motion", () => {
    const button = read("client/src/components/ui/button.tsx");
    expect(button).toContain("active:scale-[0.98]");
    expect(button).toContain("motion-reduce:active:scale-100");
    expect(read("client/src/components/admin/AdminPrimitives.tsx")).toContain("active:bg-brand-tint");
  });
});
