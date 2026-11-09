/** @vitest-environment jsdom */
import React, { Suspense } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { lazyPage, matchesPath } from "@/lib/lazyPage";

afterEach(cleanup);

describe("a page that loads its own code (R70)", () => {
  it("renders at once, with no loading state, once its code has been loaded", async () => {
    const Page = lazyPage(async () => ({ default: ({ name }: { name: string }) => <h1>Hello {name}</h1> }));
    await Page.preload();
    render(<Suspense fallback={<p>Loading</p>}><Page name="Ada" /></Suspense>);
    expect(screen.getByRole("heading", { name: "Hello Ada" })).toBeTruthy();
    expect(screen.queryByText("Loading")).toBeNull();
  });

  it("shows the loading state until its code arrives when opened before it was loaded, and loads it once", async () => {
    let loads = 0;
    let finish: () => void = () => undefined;
    const Page = lazyPage(() => new Promise(done => { loads += 1; finish = () => done({ default: () => <h1>Ready</h1> }); }));
    render(<Suspense fallback={<p>Loading</p>}><Page /></Suspense>);
    expect(screen.getByText("Loading")).toBeTruthy();
    void Page.preload();
    await act(async () => finish());
    expect(await screen.findByRole("heading", { name: "Ready" })).toBeTruthy();
    expect(loads).toBe(1);
  });

  it("matches an address to its route as the router does", () => {
    expect(matchesPath("/", "/")).toBe(true);
    expect(matchesPath("/guides/:slug", "/guides/my-business-is-struggling")).toBe(true);
    expect(matchesPath("/guides", "/guides/x")).toBe(false);
    expect(matchesPath("/services", "/services/?ref=home")).toBe(true);
    expect(matchesPath("/pay/fee/:feeLineId/:token", "/pay/fee/4/abc")).toBe(true);
    expect(matchesPath("/pay/return", "/pay/fee")).toBe(false);
  });
});
