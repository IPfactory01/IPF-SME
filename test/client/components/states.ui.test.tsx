/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Empty, FAILED_TEXT, Failed, Loading, ReadState, Stale, StaleLine } from "@/components/states";

afterEach(cleanup);
const refused = { message: "Your role does not include finance.", data: { code: "FORBIDDEN", httpStatus: 403 } };

describe("the four states of a screen (R69, design brief §5)", () => {
  it("shows the outline while loading, named for screen readers, with no text that pretends to be content", () => {
    render(<Loading label="Opening your room" rows={2} />);
    const status = screen.getByRole("status", { name: "Opening your room" });
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.querySelectorAll("[aria-hidden]").length).toBe(3);
  });

  it("says what will appear when empty, with at most one action", () => {
    render(<Empty action={<a href="/x">Book the kickoff</a>}>Your Sessions appear here once Femi books the first one.</Empty>);
    expect(screen.getByText("Your Sessions appear here once Femi books the first one.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Book the kickoff" })).toBeTruthy();
  });

  it("says a failed request failed, and Try again asks again", () => {
    let tries = 0;
    render(<Failed error={new Error("Failed to fetch")} onRetry={() => { tries += 1; }} />);
    expect(screen.getByRole("alert").textContent).toContain(FAILED_TEXT);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(tries).toBe(1);
  });

  it("shows a refusal as the server's answer, with nothing to try again", () => {
    render(<Failed error={refused} onRetry={() => undefined} />);
    expect(screen.getByRole("alert").textContent).toBe("Your role does not include finance.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says how old the copy on screen is when a refresh failed", () => {
    render(<Stale updatedAt={Date.parse("2026-11-09T09:42:00Z")} onRetry={() => undefined} />);
    expect(screen.getByRole("status").textContent).toContain("We could not refresh this. Showing what we had at 10:42 am.");
  });

  it("never shows a read that failed as empty, and keeps the last copy when there is one", () => {
    const content = (rows: string[]) => (rows.length ? <ul>{rows.map((row) => <li key={row}>{row}</li>)}</ul> : <p>Nothing yet</p>);
    const { rerender } = render(<ReadState read={{ data: undefined, error: new Error("Failed to fetch") }} loading="Loading">{content}</ReadState>);
    expect(screen.queryByText("Nothing yet")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(FAILED_TEXT);
    rerender(<ReadState read={{ data: undefined, isLoading: true }} loading="Loading the clients">{content}</ReadState>);
    expect(screen.getByRole("status", { name: "Loading the clients" })).toBeTruthy();
    rerender(<ReadState read={{ data: ["Ada Foods"], error: new Error("Failed to fetch"), dataUpdatedAt: Date.parse("2026-11-09T09:42:00Z") }} loading="Loading">{content}</ReadState>);
    expect(screen.getByText("Ada Foods")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Showing what we had at 10:42 am");
    rerender(<ReadState read={{ data: [] }} loading="Loading">{content}</ReadState>);
    expect(screen.getByText("Nothing yet")).toBeTruthy();
  });

  it("adds the Stale line only for a failed refresh, never for a refusal or a fresh read", () => {
    const { container, rerender } = render(<StaleLine read={{ data: [1], error: refused }} />);
    expect(container.textContent).toBe("");
    rerender(<StaleLine read={{ data: [1] }} />);
    expect(container.textContent).toBe("");
    rerender(<StaleLine read={{ data: [1], error: new Error("Failed to fetch") }} />);
    expect(container.textContent).toContain("We could not refresh this.");
  });
});
