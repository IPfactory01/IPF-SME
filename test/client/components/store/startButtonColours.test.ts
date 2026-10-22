import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The refund band once passed a light background to StartButton through className; the button's own white text won,
// and the button read as an empty white box (ET, 22 October 2026). Colour now goes through `tone`, never className.
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : path.endsWith(".tsx") ? [path] : [];
});

describe("start buttons keep their text visible", () => {
  it("never colours a StartButton through className; a light button uses tone=\"light\"", () => {
    const offenders: string[] = [];
    for (const file of files(resolve(process.cwd(), "client/src"))) {
      for (const match of readFileSync(file, "utf8").matchAll(/<StartButton\b[^>]*>/g)) {
        const className = match[0].match(/className="([^"]*)"/)?.[1] ?? "";
        if (/(^|\s)(hover:)?(bg|text)-/.test(className)) offenders.push(`${file.replace(process.cwd(), "")}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
