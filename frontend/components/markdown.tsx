"use client";

import { Fragment, type ReactNode } from "react";

/** Inline **bold** and *italic* (no HTML injection: React text nodes only). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith("**") ? <strong key={i++} className="font-semibold text-ink">{t.slice(2, -2)}</strong> : <em key={i++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Minimal Markdown for assistant replies: headings, bullet and numbered lists, paragraphs, bold. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={list.ordered ? "ml-5 list-decimal space-y-1" : "ml-5 list-disc space-y-1"}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      blocks.push(<hr key={blocks.length} className="my-3 border-hairline" />);
    } else if (h) {
      flush();
      blocks.push(
        <p key={blocks.length} className="mt-2 text-[15px] font-semibold text-ink">
          {inline(h[2])}
        </p>,
      );
    } else if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
    } else if (!line.trim()) {
      flush();
    } else {
      flush();
      blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="space-y-2 text-[14px] leading-relaxed text-ink-2">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
