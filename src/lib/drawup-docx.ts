// V22 DrawUp Check: reads the text of a Word (.docx) file on the server, so a design narrative
// uploaded as Word can be reviewed. A .docx is a zip; the body text is in word/document.xml.
// Only "stored" and "deflate" zip entries are supported (that is what Word writes).
import { inflateRawSync } from 'zlib';

export function unzipEntry(buf: Buffer, wanted: string): Buffer | null {
  // End of central directory record: last 22+ bytes, signature 0x06054b50.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    if (name !== wanted) continue;
    if (buf.readUInt32LE(local) !== 0x04034b50) return null;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method === 0) return Buffer.from(data);
    if (method === 8) return inflateRawSync(data);
    return null;
  }
  return null;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s: string) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') { const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isFinite(code) ? String.fromCodePoint(code) : m; }
  return ENT[e] ?? m;
});

export type DocxParagraph = { style: string; text: string };

/** Paragraphs of a .docx in reading order, each with its Word style name (Heading1, ListParagraph...). */
export function docxParagraphs(bytes: ArrayBuffer | Buffer): DocxParagraph[] {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(new Uint8Array(bytes));
  const xml = unzipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('That Word file could not be read. Save it as .docx (Word 2007 or later) or as PDF and try again.');
  const body = xml.toString('utf8');
  const out: DocxParagraph[] = [];
  const paraRe = /<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g;
  let m: RegExpExecArray | null;
  while ((m = paraRe.exec(body))) {
    const p = m[0];
    const style = (p.match(/<w:pStyle w:val="([^"]+)"/) || [, ''])[1] || '';
    let raw = '';
    const runRe = /<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>/g;
    let r: RegExpExecArray | null;
    while ((r = runRe.exec(p))) raw += r[1] !== undefined ? r[1] : r[0].startsWith('<w:tab') ? '\t' : '\n';
    const text = unxml(raw).trim();
    if (text) out.push({ style, text });
  }
  return out;
}

/** Plain text with numbered paragraphs ([P12]) so the reviewer can cite where a statement is. */
export function docxNumberedText(bytes: ArrayBuffer | Buffer, maxChars = 120000) {
  const paras = docxParagraphs(bytes);
  let s = '';
  paras.forEach((p, i) => {
    const head = /^(Heading|Title)/i.test(p.style) ? '## ' : '';
    s += `[P${i + 1}] ${head}${p.text}\n`;
  });
  return { text: s.slice(0, maxChars), paragraphs: paras.length, truncated: s.length > maxChars };
}
