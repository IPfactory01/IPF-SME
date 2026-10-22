/** @vitest-environment jsdom */

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AVOIDED_WORDS, renderAt } from "./publicPageHarness";

vi.mock("@/lib/trpc", async () => (await import("./publicPageHarness")).PRICES_MOCK);

const { default: QuestionsPage, QUESTION_GROUPS } = await import("@/pages/QuestionsPage");
const { BRAND } = await import("@shared/brand");
const { PRODUCTS, DELIVERY_PROMISE } = await import("@shared/products");
const { storyOf } = await import("@shared/productStories");

afterEach(cleanup);

describe("Questions (/questions)", () => {
  it("puts every question in one place: before you buy, then each service's own, in menu order", () => {
    renderAt("/questions", QuestionsPage);
    const withQuestions = PRODUCTS.filter((product) => (storyOf(product.id)?.faq.length ?? 0) > 0).map((product) => product.name);
    expect(QUESTION_GROUPS.map((group) => group.heading)).toEqual(["Before you buy", ...withQuestions]);
    const topics = within(screen.getByRole("navigation", { name: "Question topics" }));
    for (const group of QUESTION_GROUPS) expect(topics.getByRole("link", { name: group.heading }).getAttribute("href")).toBe(`#${group.id}`);
    for (const product of PRODUCTS) for (const item of storyOf(product.id)?.faq ?? []) expect(screen.getAllByText(item.q).length).toBeGreaterThan(0);
  });

  it("answers the questions owners ask about buying, without promising consent it does not record", () => {
    const { container } = renderAt("/questions", QuestionsPage);
    const before = container.querySelector("#before-you-buy")!;
    expect(before.textContent).toContain("What if you miss the delivery date?");
    expect(before.textContent).toContain("How do I pay?");
    fireEvent.click(within(before as HTMLElement).getByRole("button", { name: "What if you miss the delivery date?" }));
    expect(within(before as HTMLElement).getByText(DELIVERY_PROMISE)).toBeTruthy();
    expect(container.textContent).not.toMatch(/only with your consent|stays between you and your/);
  });

  it("links each service's questions to its page, and offers a person for the rest", () => {
    renderAt("/questions", QuestionsPage);
    expect(screen.getByRole("link", { name: "More about Six-Week Fix" }).getAttribute("href")).toBe("/services/six-week-fix");
    expect(screen.getByRole("link", { name: "Talk to us" }).getAttribute("href")).toBe("/contact");
    expect(screen.getAllByRole("link", { name: BRAND.businessSupportMailbox })[0].getAttribute("href")).toBe(`mailto:${BRAND.businessSupportMailbox}`);
  });

  it("never uses the words the site avoids", () => {
    const { container } = renderAt("/questions", QuestionsPage);
    expect(container.textContent).not.toMatch(AVOIDED_WORDS);
  });
});
