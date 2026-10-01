/* PDF для человека — из того же объекта отчёта, что уходит нейросети. Библиотека грузится только по нажатию. */
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';

type Obj = Record<string, unknown>;

const INK = '#1B2A41';
const MUTED = '#6B7785';
const LINE = '#D9E0E7';
const WARN = '#C2410C';
const GOOD = '#15803D';

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const prim = (v: unknown) => (v === undefined || v === null ? '—' : typeof v === 'number' ? String(v).replace('.', ',') : String(v));

function table(rows: TableCell[][], widths: (string | number)[], header = false): Content {
  return {
    table: { headerRows: header ? 1 : 0, widths, body: rows, dontBreakRows: true },
    layout: {
      hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => LINE,
      paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 0, paddingRight: () => 8,
    },
    margin: [0, 2, 0, 6],
  };
}

function toContent(v: unknown): Content {
  if (Array.isArray(v)) {
    if (!v.length) return { text: 'нет', color: MUTED };
    if (v.every(isObj)) {
      const cols = [...new Set(v.flatMap((o) => Object.keys(o as Obj)))];
      const head = cols.map((c) => ({ text: c, bold: true, color: MUTED, fontSize: 8 }));
      const body = v.map((o) => cols.map((c) => ({ text: prim((o as Obj)[c]), fontSize: 8.5 })));
      return table([head, ...body], cols.map((_, i) => (i === 0 ? 'auto' : '*')), true);
    }
    return { ul: v.map((x) => prim(x)), margin: [0, 0, 0, 4] };
  }
  if (isObj(v)) {
    if (!Object.keys(v).length) return { text: 'нет данных', color: MUTED };
    const rows: TableCell[][] = Object.entries(v).map(([k, x]) => [
      { text: k, color: MUTED },
      isObj(x) || (Array.isArray(x) && x.some(isObj)) ? toContent(x) as TableCell : { text: Array.isArray(x) ? x.map(prim).join('\n') : prim(x) },
    ]);
    return table(rows, [150, '*']);
  }
  return { text: prim(v) };
}

const SKIP = new Set(['тип', 'дата', 'день недели', 'неделя', 'отклонения от плана', 'получилось по плану']);

export function buildDoc(source: Obj, title: string, subtitle: string): TDocumentDefinitions {
  // pdfmake меняет переданные массивы на месте — работаем с копией, чтобы не испортить данные экрана
  const report = JSON.parse(JSON.stringify(source)) as Obj;
  const warn = (report['отклонения от плана'] as string[]) ?? [];
  const good = (report['получилось по плану'] as string[]) ?? [];
  const content: Content[] = [
    { text: title, fontSize: 18, bold: true, color: INK },
    { text: subtitle, color: MUTED, margin: [0, 2, 0, 12] },
  ];
  const flagBlock = (head: string, items: string[], color: string): Content => ({
    stack: [
      { text: head, bold: true, color, margin: [0, 0, 0, 3] },
      items.length ? { ul: items, markerColor: color } : { text: 'нет', color: MUTED },
    ],
    margin: [0, 0, 0, 10],
  });
  content.push({ columns: [flagBlock('Отклонения от плана', warn, WARN), flagBlock('Получилось по плану', good, GOOD)], columnGap: 18 });

  const block = (head: string, v: unknown): Content[] => [
    { text: head, fontSize: 12, bold: true, color: INK, margin: [0, 8, 0, 3] },
    toContent(v),
  ];
  for (const [k, v] of Object.entries(report)) {
    if (SKIP.has(k)) continue;
    if (k === 'разделы' && isObj(v)) {
      for (const [sec, sv] of Object.entries(v)) content.push(...block(sec, sv));
      continue;
    }
    content.push(...block(k.charAt(0).toUpperCase() + k.slice(1), v));
  }
  return {
    pageSize: 'A4',
    pageMargins: [40, 44, 40, 44],
    info: { title },
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: '#2B3440', lineHeight: 1.15 },
    footer: (page: number, pages: number) => ({ text: `${page} / ${pages}`, alignment: 'right', fontSize: 8, color: MUTED, margin: [0, 10, 40, 0] }),
    content,
  };
}

export async function downloadPdf(report: Obj, title: string, subtitle: string, filename: string) {
  const [{ default: pdfMake }, fonts] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  const f = fonts as unknown as { default?: unknown; pdfMake?: { vfs: unknown } };
  (pdfMake as unknown as { vfs: unknown }).vfs = f.pdfMake?.vfs ?? f.default ?? fonts;
  const doc = pdfMake.createPdf(buildDoc(report, title, subtitle)) as unknown as { getBlob: (cb: (b: Blob) => void) => void };
  const blob: Blob = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('не уложился в 20 секунд')), 20000);
    try { doc.getBlob((b) => { clearTimeout(t); res(b); }); } catch (e) { clearTimeout(t); rej(e); }
  });
  const file = new File([blob], filename, { type: 'application/pdf' });
  const mobile = window.matchMedia('(pointer: coarse)').matches;
  if (mobile && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return; } catch { /* отменили — скачаем */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
