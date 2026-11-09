/**
 * WhatsApp links (R44): a chat with a person, the message filled in. A number that does not look like one (or none)
 * still gives a link that fills the message, so the sender picks the chat themselves. Digits only reach the URL.
 */
export function whatsappLink(number: string | null | undefined, message: string): string {
  const digits = (number ?? "").replace(/\D/g, "");
  const text = `text=${encodeURIComponent(message)}`;
  return digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}?${text}` : `https://wa.me/?${text}`;
}

/** The first name, for "WhatsApp Femi": the first word of the name, or the whole name when it has one word. */
export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;
