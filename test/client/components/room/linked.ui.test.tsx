/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Linked from "@/components/room/Linked";
import { initials } from "@/components/EngagementRoom";

afterEach(cleanup);

describe("a message's links and a person's initials (ET, 13 November 2026)", () => {
  it("turns a pasted web address into a link that opens in a new tab, leaving the rest as text", () => {
    render(<p><Linked text="Here it is: https://drive.google.com/drive/folders/1E3wtIHf-jsM9YD. Thanks" /></p>);
    const link = screen.getByRole("link", { name: "https://drive.google.com/drive/folders/1E3wtIHf-jsM9YD" });
    expect(link.getAttribute("href")).toBe("https://drive.google.com/drive/folders/1E3wtIHf-jsM9YD");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.parentElement!.textContent).toBe("Here it is: https://drive.google.com/drive/folders/1E3wtIHf-jsM9YD. Thanks");
  });

  it("leaves a message with no address as it is", () => {
    const { container } = render(<p><Linked text="Uploaded to the room" /></p>);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("Uploaded to the room");
  });

  it("gives everyone two letters, so people with the same first letter differ", () => {
    expect(initials("Marcelle Tiogo")).toBe("MT");
    expect(initials("Miracle")).toBe("MI");
    expect(initials("Kingsley Ezeh")).toBe("KE");
    expect(initials("Ada Bisi Okafor")).toBe("AO");
    expect(initials("Marcelle Tiogo (client)")).toBe("MT");
    expect(initials("")).toBe("?");
  });
});
