import React from "react";

/**
 * Renders the approved legal text in docs/legal/*.md (converted from the approved Word documents) as a plain document.
 * The Markdown it understands is exactly what those files use: `#` title, `##` numbered sections, `###` subsections,
 * `-` bullets, `>` the opening note, and paragraphs, with a trailing double space for a line break. Nothing is added.
 */
type Block =
  | { kind: "title"; text: string }
  | { kind: "meta"; text: string }
  | { kind: "note"; text: string }
  | { kind: "h2" | "h3"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "p"; lines: string[] };

export function parseLegalDocument(source: string): Block[] {
  const blocks: Block[] = [];
  const text = source.replace(/<!--[\s\S]*?-->/g, "");
  let titled = false;
  let paragraph: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      const joined = paragraph.map((line) => line.replace(/\s+$/, ""));
      if (titled && !blocks.some((block) => block.kind === "meta") && blocks.length === 1) blocks.push({ kind: "meta", text: joined.join(" ") });
      else blocks.push({ kind: "p", lines: joined });
      paragraph = [];
    }
    if (list.length) {
      blocks.push({ kind: "list", items: list });
      list = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) flush();
    else if (line.startsWith("# ")) { flush(); blocks.push({ kind: "title", text: line.slice(2) }); titled = true; }
    else if (line.startsWith("## ")) { flush(); blocks.push({ kind: "h2", text: line.slice(3) }); }
    else if (line.startsWith("### ")) { flush(); blocks.push({ kind: "h3", text: line.slice(4) }); }
    else if (line.startsWith("> ")) { flush(); blocks.push({ kind: "note", text: line.slice(2) }); }
    else if (line.startsWith("- ")) { if (paragraph.length) flush(); list.push(line.slice(2)); }
    else paragraph.push(line);
  }
  flush();
  return blocks;
}

/** Makes an email address a mailto link and leaves every other character as it was written. */
function withLinks(text: string) {
  return text.split(/([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/).map((part, index) =>
    index % 2 ? <a key={index} href={`mailto:${part}`} className="text-brand underline underline-offset-2 hover:text-brand-deep">{part}</a> : part,
  );
}

export function LegalDocument({ source }: { source: string }) {
  const blocks = parseLegalDocument(source);
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "title": return <h1 key={index} className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">{block.text}</h1>;
          case "meta": return <p key={index} className="mt-3 text-sm text-ink-muted">{withLinks(block.text)}</p>;
          case "note": return <p key={index} className="mt-8 border-l-2 border-brand-line pl-4 text-sm leading-6 text-ink-600">{block.text}</p>;
          case "h2": return <h2 key={index} className="mt-10 text-xl font-semibold text-ink">{block.text}</h2>;
          case "h3": return <h3 key={index} className="mt-6 text-base font-semibold text-ink">{block.text}</h3>;
          case "list": return <ul key={index} className="mt-3 list-disc space-y-2 pl-6 leading-7 text-ink-700 marker:text-ink-muted">{block.items.map((item, i) => <li key={i}>{withLinks(item)}</li>)}</ul>;
          default: return <p key={index} className="mt-4 leading-7 text-ink-700">{block.lines.map((line, i) => <React.Fragment key={i}>{i > 0 && <br />}{withLinks(line)}</React.Fragment>)}</p>;
        }
      })}
    </>
  );
}
