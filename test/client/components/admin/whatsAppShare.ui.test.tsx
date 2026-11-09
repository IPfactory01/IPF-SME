/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import WhatsAppShare from "@/components/admin/WhatsAppShare";
import { firstNameOf, whatsappLink } from "@shared/whatsapp";

afterEach(cleanup);

describe("Send on WhatsApp beside a link the team sends (R44)", () => {
  it("opens a chat with the client's number, the link in the message, so nobody retypes it", () => {
    render(<WhatsAppShare number="+2348031234567" message="Hello Ada, here is the payment link for Month 1 service fee (₦470,000): https://www.ipfactory.co/pay/fee/12/abc" />);
    const link = screen.getByRole("link", { name: "Send on WhatsApp" });
    expect(link.getAttribute("href")).toBe(`https://wa.me/2348031234567?text=${encodeURIComponent("Hello Ada, here is the payment link for Month 1 service fee (₦470,000): https://www.ipfactory.co/pay/fee/12/abc")}`);
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("without a number, lets WhatsApp ask whom to send it to; only digits ever reach the address", () => {
    expect(whatsappLink(null, "Hi")).toBe("https://wa.me/?text=Hi");
    expect(whatsappLink("0803", "Hi")).toBe("https://wa.me/?text=Hi");
    expect(whatsappLink("+234 (803) 123-4567", "Hi")).toBe("https://wa.me/2348031234567?text=Hi");
    expect(firstNameOf("  Femi   Adebayo ")).toBe("Femi");
  });
});
