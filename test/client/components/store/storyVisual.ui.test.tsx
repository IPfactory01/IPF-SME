/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { captionOf, StoryVisual } from "@/components/store/StoryVisual";

afterEach(cleanup);

describe("a story visual's caption", () => {
  it("moves Sample to the badge and starts what is left with a capital", () => {
    expect(captionOf("Sample closing cash, week by week")).toBe("Closing cash, week by week");
    expect(captionOf("Sample: notes")).toBe("Notes");
    expect(captionOf("Your 90 days")).toBe("Your 90 days");
    render(<StoryVisual visual={{ kind: "moves", title: "Sample actions", rows: [{ tag: "Owner", text: "Test the new price for 60 days", value: "By 15 Feb" }] }} />);
    expect(screen.getByText("Actions")).toBeTruthy();
    expect(screen.getByText("Sample")).toBeTruthy();
  });
});
