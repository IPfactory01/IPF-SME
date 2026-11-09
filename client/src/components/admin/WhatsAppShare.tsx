import { whatsappLink } from "@shared/whatsapp";
import React from "react";

/**
 * "Send on WhatsApp" beside a link the team sends (R44): a chat with the client's number when there is one, the message
 * filled in, so nobody retypes a link into WhatsApp. Without a number, WhatsApp asks whom to send it to.
 */
export default function WhatsAppShare({ number, message }: { number?: string | null; message: string }) {
  return (
    <a href={whatsappLink(number, message)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center border border-brand-line bg-white px-3 text-xs font-semibold text-brand hover:bg-brand-tint">
      Send on WhatsApp
    </a>
  );
}
