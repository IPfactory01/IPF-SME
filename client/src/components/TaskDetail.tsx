import { splitNumberedList } from "@shared/engagement";
import React from "react";

/** A Data Request's or action's detail: numbered questions on their own lines, anything else as written. */
export default function TaskDetail({ text, className }: { text: string; className: string }) {
  const list = splitNumberedList(text);
  if (!list) return <p className={`${className} whitespace-pre-line`}>{text}</p>;
  return (
    <div className={className}>
      {list.intro && <p>{list.intro}</p>}
      <ol className={`list-decimal space-y-1 pl-5 ${list.intro ? "mt-1" : ""}`}>
        {list.items.map(item => <li key={item}>{item}</li>)}
      </ol>
    </div>
  );
}
