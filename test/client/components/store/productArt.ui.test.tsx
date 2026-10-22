/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProductArt } from "@/components/store/ProductArt";
import { PRODUCT_STORIES } from "@shared/productStories";

afterEach(cleanup);

// "day 90" on the 90-Day Plan drawing once ran past the 220-wide drawing and was cut off (ET, 22 October 2026).
// jsdom cannot measure text, so each label's width is estimated generously: 0.62 of the font size per character, in
// Plus Jakarta Sans 700 to 800. A browser check measured every drawing the same day; this keeps them inside.
const WIDTH_PER_EM = 0.62;

describe("product drawings", () => {
  it.each([...new Set(Object.values(PRODUCT_STORIES).map((story) => story.art))])("keeps every label of the %s drawing inside the drawing", (kind) => {
    const { container } = render(<ProductArt kind={kind} />);
    const [x0, , width] = container.querySelector("svg")!.getAttribute("viewBox")!.split(" ").map(Number);
    for (const text of container.querySelectorAll("text")) {
      const x = Number(text.getAttribute("x"));
      const size = Number(text.getAttribute("font-size") ?? text.getAttribute("fontSize") ?? 12);
      const estimate = (text.textContent ?? "").length * size * WIDTH_PER_EM;
      const anchor = text.getAttribute("text-anchor") ?? "start";
      const [left, right] = anchor === "middle" ? [x - estimate / 2, x + estimate / 2] : anchor === "end" ? [x - estimate, x] : [x, x + estimate];
      expect(left, `${kind}: "${text.textContent}"`).toBeGreaterThanOrEqual(x0);
      expect(right, `${kind}: "${text.textContent}"`).toBeLessThanOrEqual(x0 + width);
    }
  });
});
