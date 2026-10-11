import { Fragment, type ReactNode } from "react";

/**
 * Just enough markdown for the write-up: headings, paragraphs, lists, tables, images,
 * **bold**, *italic*, `code` and [links](url). One source file feeds the blog page and Devpost.
 */
function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  const t = text.replace(/\\\|/g, "|");
  while ((m = re.exec(t))) {
    if (m.index > last) out.push(t.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[2]) out.push(<strong key={k} className="font-medium text-foreground">{inline(m[2], i)}</strong>);
    else if (m[3]) out.push(<em key={k} className="text-foreground/90">{inline(m[3], i)}</em>);
    else if (m[4]) out.push(<code key={k} className="border border-line bg-card px-1 text-[0.92em] text-foreground">{m[4]}</code>);
    else if (m[5]) out.push(<a key={k} href={m[6]} className="link text-foreground" target={m[6].startsWith("http") ? "_blank" : undefined} rel="noreferrer">{m[5]}</a>);
    last = m.index + m[0].length;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim());

export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const img = l.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (img) {
      blocks.push(
        <figure key={k++} className="my-8 border border-line bg-card">
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
      if (lvl === 1) blocks.push(<h1 key={k++} id={id} className="text-balance text-[clamp(32px,5vw,52px)] font-medium leading-[1.05] tracking-[-0.05em]">{inline(txt)}</h1>);
      else if (lvl === 2) blocks.push(<h2 key={k++} id={id} className="mt-16 scroll-mt-16 border-t border-line pt-8 text-[24px] font-medium tracking-[-0.03em]">{inline(txt)}</h2>);
      else blocks.push(<h3 key={k++} id={id} className="mt-10 scroll-mt-16 text-[16px] font-medium tracking-[-0.02em] text-foreground">{inline(txt)}</h3>);
      i++; continue;
    }
    if (l.trim().startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++]);
      const [head, , ...body] = rows;
      blocks.push(
        <div key={k++} className="my-6 overflow-x-auto">
          <table className="w-full min-w-[480px] text-[12.5px]">
            <thead><tr>{cells(head).map((c, j) => <th key={j} className="h-8 border-b border-line-strong pr-4 text-left font-normal text-dim">{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri}>{cells(r).map((c, j) => <td key={j} className="h-8 border-b border-line pr-4 text-muted-foreground">{inline(c)}</td>)}</tr>)}</tbody>
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
        <List key={k++} className="my-5 space-y-2.5">
          {items.map((it, j) => (
            <li key={j} className="grid grid-cols-[1.6rem_minmax(0,1fr)] text-[13.5px] leading-relaxed text-muted-foreground">
              <span className="num text-primary">{ordered ? `${j + 1}.` : "–"}</span>
              <span>
                {inline(it.text, j)}
                {it.sub.length > 0 && (
                  <ul className="mt-2 space-y-1.5 border-l border-line pl-4">
                    {it.sub.map((x, si) => <li key={si}>{inline(x, j * 100 + si)}</li>)}
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
    blocks.push(<p key={k++} className="my-4 text-[13.5px] leading-[1.75] text-muted-foreground">{inline(para.join(" "))}</p>);
  }
  return <Fragment>{blocks}</Fragment>;
}
