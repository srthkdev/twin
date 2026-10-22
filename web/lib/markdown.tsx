import { Fragment, type ReactNode } from "react";

/**
 * Just enough markdown for the write-up: headings, paragraphs, lists, tables, images,
 * **bold**, *italic*, `code` and [links](url). One source file feeds the blog page and Devpost.
 */
type LinkHandler = (href: string) => void;

function inline(text: string, key = 0, onLink?: LinkHandler): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  const t = text.replace(/\\\|/g, "|");
  while ((m = re.exec(t))) {
    if (m.index > last) out.push(t.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[2]) out.push(<strong key={k} className="font-medium text-foreground">{inline(m[2], i, onLink)}</strong>);
    else if (m[3]) out.push(<em key={k} className="text-foreground/90">{inline(m[3], i, onLink)}</em>);
    else if (m[4]) out.push(<code key={k} className="border border-line bg-card px-1 text-[0.92em] text-foreground">{m[4]}</code>);
    else if (m[5] && onLink && /^(hood|geo):/.test(m[6])) {
      const href = m[6];
      out.push(
      <button key={k} type="button" onClick={() => onLink(href)} title="show on map"
        className="inline border-b border-dashed border-primary/70 text-foreground transition-colors hover:border-solid hover:text-primary">
        {m[5]}<span aria-hidden className="ml-0.5 text-[0.8em] text-primary">◎</span>
      </button>,
      );
    }
    else if (m[5] && /^(hood|geo):/.test(m[6])) out.push(<span key={k} className="text-foreground">{m[5]}</span>);
    else if (m[5]) out.push(<a key={k} href={m[6]} className="link text-foreground" target={m[6].startsWith("http") ? "_blank" : undefined} rel="noreferrer">{m[5]}{m[6].startsWith("http") && <span aria-hidden className="ml-0.5 text-[0.8em] text-dim">↗</span>}</a>);
    last = m.index + m[0].length;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim());

const STYLES = {
  article: {
    h1: "text-balance text-[clamp(32px,5vw,52px)] font-medium leading-[1.05] tracking-[-0.05em]",
    h2: "mt-16 scroll-mt-16 border-t border-line pt-8 text-[24px] font-medium tracking-[-0.03em]",
    h3: "mt-10 scroll-mt-16 text-[16px] font-medium tracking-[-0.02em] text-foreground",
    p: "my-4 text-[13.5px] leading-[1.75] text-muted-foreground",
    li: "text-[13.5px] leading-relaxed text-muted-foreground",
    list: "my-5 space-y-2.5", table: "my-6", td: "h-8 text-[12.5px]", fig: "my-8",
  },
  chat: {
    h1: "mt-2 text-[14px] font-medium text-foreground",
    h2: "mt-3 text-[13px] font-medium text-foreground",
    h3: "mt-2 text-[12px] font-medium text-foreground",
    p: "my-1.5 text-[12.5px] leading-[1.65] text-foreground/90",
    li: "text-[12.5px] leading-[1.6] text-foreground/85",
    list: "my-1.5 space-y-1", table: "my-2", td: "h-6 text-[12px]", fig: "my-2",
  },
};

export function Markdown({ source, variant = "article", onLink }: { source: string; variant?: keyof typeof STYLES; onLink?: LinkHandler }) {
  const S = STYLES[variant];
  const il = (t: string, k = 0) => inline(t, k, onLink);
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const img = l.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (img) {
      blocks.push(
        <figure key={k++} className={`${S.fig} border border-line bg-card`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img[2]} alt={img[1]} className="block w-full" loading="lazy" />
          {img[1] && <figcaption className="border-t border-line px-3 py-2 text-[11px] text-dim">{img[1]}</figcaption>}
        </figure>,
      );
      i++; continue;
    }
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length, txt = h[2];
      const id = txt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (lvl === 1) blocks.push(<h1 key={k++} id={id} className={S.h1}>{il(txt)}</h1>);
      else if (lvl === 2) blocks.push(<h2 key={k++} id={id} className={S.h2}>{il(txt)}</h2>);
      else blocks.push(<h3 key={k++} id={id} className={S.h3}>{il(txt)}</h3>);
      i++; continue;
    }
    if (l.trim().startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++]);
      const [head, , ...body] = rows;
      blocks.push(
        <div key={k++} className={`${S.table} overflow-x-auto`}>
          <table className={`w-full ${variant === "article" ? "min-w-[480px]" : ""} text-[12.5px]`}>
            <thead><tr>{cells(head).map((c, j) => <th key={j} className={`${S.td} border-b border-line-strong pr-3 text-left font-normal text-dim`}>{il(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri}>{cells(r).map((c, j) => <td key={j} className={`${S.td} border-b border-line pr-3 text-muted-foreground`}>{il(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^(\d+\.|-)\s/.test(l)) {
      const ordered = /^\d+\./.test(l);
      const items: { text: string; sub: string[] }[] = [];
      while (i < lines.length && (/^(\d+\.|-)\s/.test(lines[i]) || (/^\s+-\s/.test(lines[i]) && items.length))) {
        if (/^\s+-\s/.test(lines[i])) items[items.length - 1].sub.push(lines[i].replace(/^\s+-\s+/, ""));
        else items.push({ text: lines[i].replace(/^(\d+\.|-)\s+/, ""), sub: [] });
        i++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={k++} className={S.list}>
          {items.map((it, j) => (
            <li key={j} className={`grid ${variant === "chat" ? "grid-cols-[1.1rem_minmax(0,1fr)]" : "grid-cols-[1.6rem_minmax(0,1fr)]"} ${S.li}`}>
              <span className="num text-primary">{ordered ? `${j + 1}.` : "–"}</span>
              <span>
                {il(it.text, j)}
                {it.sub.length > 0 && (
                  <ul className="mt-2 space-y-1.5 border-l border-line pl-4">
                    {it.sub.map((x, si) => <li key={si}>{il(x, j * 100 + si)}</li>)}
                  </ul>
                )}
              </span>
            </li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||!\[|\d+\.\s|-\s)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={k++} className={S.p}>{il(para.join(" "))}</p>);
  }
  return <Fragment>{blocks}</Fragment>;
}
