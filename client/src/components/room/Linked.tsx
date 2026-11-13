import React from "react";

const LINK = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])/g;

/** A message's text with its web addresses as links that open in a new tab (a Drive folder pasted in a message, R78). */
export default function Linked({ text }: { text: string }) {
  const parts = text.split(LINK);
  return <>{parts.map((part, index) => index % 2 === 1
    ? <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-brand underline underline-offset-2">{part}</a>
    : <React.Fragment key={index}>{part}</React.Fragment>)}</>;
}
