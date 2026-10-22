import { describe, expect, it } from "vitest";
import { PRODUCT_STORIES, storyOf } from "@shared/productStories";
import { NEED_LEAD, NEEDS, PRODUCTS, productById } from "@shared/products";

describe("product stories (the store design, 22 October 2026)", () => {
  it("tells every product's story and no product that does not exist", () => {
    expect(Object.keys(PRODUCT_STORIES).sort()).toEqual(PRODUCTS.map((product) => product.id).sort());
    for (const product of PRODUCTS) {
      const story = storyOf(product.id)!;
      expect(story.promise.length, product.id).toBeGreaterThan(10);
      expect(story.headline.every((line) => line.trim().length > 0), product.id).toBe(true);
      expect(story.features.length, product.id).toBeGreaterThan(0);
      expect(story.forYou.length, product.id).toBeGreaterThan(0);
      expect(story.closer.length, product.id).toBeGreaterThan(0);
    }
  });

  it("only sends owners elsewhere to products on the menu", () => {
    for (const story of Object.values(PRODUCT_STORIES)) {
      for (const item of story.notForYou) if (item.productId) expect(productById(item.productId), item.productId).toBeTruthy();
    }
  });

  it("never uses the words the site avoids", () => {
    const text = JSON.stringify(PRODUCT_STORIES);
    expect(text).not.toMatch(/\b(door|sprint|playbook|retainer)\b/i);
  });
});

describe("the service that answers each owner's problem first (home page)", () => {
  it("leads every need with a product that serves it", () => {
    for (const need of NEEDS) expect(productById(NEED_LEAD[need])!.needs, need).toContain(need);
  });
});
