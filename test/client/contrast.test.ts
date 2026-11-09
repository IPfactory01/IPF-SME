import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Text meets 4.5:1 on its background (design brief §4). The health colours were chosen for dots and bars; their text
 * uses the -strong tokens (design review B4, 9 November 2026), which these checks hold to the rule.
 */
const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");
const token = (name: string) => {
  const value = css.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];
  if (!value) throw new Error(`No --color-${name} in index.css`);
  return value;
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};
const sources = (dir: string): string[] => readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? sources(`${dir}/${entry.name}`) : /\.tsx?$/.test(entry.name) ? [`${dir}/${entry.name}`] : []));

describe("text contrast of the health colours", () => {
  it("gives Watch and Clear text at least 4.5:1 on white, the page and their own tint", () => {
    for (const [text, tint] of [["health-watch-strong", "health-watch-tint"], ["health-clear-strong", "health-clear-tint"]]) {
      for (const background of ["#FFFFFF", token("paper"), token(tint)]) {
        expect(contrast(token(text), background), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("never sets text in the Watch dot colour, which is 4.2:1 on white", () => {
    expect(contrast(token("health-watch"), "#FFFFFF")).toBeLessThan(4.5);
    const users = sources("client/src").filter((file) => /\btext-health-watch(?![-\w])/.test(readFileSync(resolve(process.cwd(), file), "utf8")));
    expect(users, "use text-health-watch-strong").toEqual([]);
  });

  it("puts Clear text on the Clear tint in the strong green", () => {
    const users = sources("client/src").filter((file) => /bg-health-clear-tint[^"`]*\btext-health-clear(?![-\w])/.test(readFileSync(resolve(process.cwd(), file), "utf8")));
    expect(users, "use text-health-clear-strong on bg-health-clear-tint").toEqual([]);
  });
});
