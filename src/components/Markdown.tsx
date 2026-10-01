/** Маленький безопасный Markdown: заголовки, жирный, списки, абзацы. HTML экранируется до разбора. */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s: string) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');

export function mdToHtml(md: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (ul || ol) {
      const t = ul ? 'ul' : 'ol';
      if (list !== t) { close(); out.push(`<${t}>`); list = t; }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    } else if (h) { close(); out.push(`<h4>${inline(h[1])}</h4>`); }
    else if (!line.trim()) close();
    else { close(); out.push(`<p>${inline(line)}</p>`); }
  }
  close();
  return out.join('');
}

export default function Markdown({ text }: { text: string }) {
  return <div className="md" dangerouslySetInnerHTML={{ __html: mdToHtml(text) }} />;
}
