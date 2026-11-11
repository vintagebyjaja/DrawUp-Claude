"""No-loss check for the combined Division 01: (1) every paragraph and table cell of every source appears in the
combined document, in order, with identical text; (2) the rendered text (with automatic numbering such as 1.01 / A.)
of every source appears in the rendered combined PDF, word for word, ignoring page-number lines; (3) per-source page
counts. Usage: verify.py SRC_DIR COMBINED.docx SRC_PDF_DIR COMBINED.pdf OUT.json"""
import sys, os, re, glob, json, subprocess, collections
from docx import Document
from docx.oxml.ns import qn
sys.path.insert(0, os.path.dirname(__file__))
src, comb, pdfdir, combpdf, outp = sys.argv[1:6]
def key(f):
    b = os.path.basename(f).replace('_', ' ')
    if 'Cover' in b: return (0, '', b)
    if 'TABLE OF CONTENTS' in b: return (1, '', b)
    m = re.match(r'(\d\d)\s*(\d{4})(\.\d+)?', b); return (2, m.group(1) + m.group(2) + (m.group(3) or ''), b)
files = sorted(glob.glob(os.path.join(src, '*.docx')), key=key)
def blocks(d):  # every paragraph in the body, including table cells, in document order
    out = []
    for p in d.element.body.iter(qn('w:p')):
        t = ''.join(x.text or '' for x in p.iter(qn('w:t')))
        if t.strip(): out.append(t)
    return out
cb = blocks(Document(comb)); pos = 0; res = []
for f in files:
    sb = blocks(Document(f)); missing = []; start = pos
    for t in sb:
        try: pos = cb.index(t, pos) + 1
        except ValueError: missing.append(t[:120])
    res.append({'file': os.path.basename(f), 'paragraphs': len(sb), 'missing_paragraphs': missing})
def words(pdf):
    t = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True).stdout
    lines = [l for l in t.split('\n') if not re.search(r'(?i)\bpage\s*\d+\s*of\s*\d+|\b\d+\s+of\s+\d+\s*$', l)]
    return re.findall(r'\S+', '\n'.join(lines))
cw = collections.Counter(words(combpdf)); total = collections.Counter()
for r, f in zip(res, files):
    pdf = os.path.join(pdfdir, os.path.splitext(os.path.basename(f))[0] + '.pdf')
    sw = collections.Counter(words(pdf)); total += sw
    r['rendered_words'] = sum(sw.values())
    r['source_pages'] = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout).group(1))
def labels(pdf):  # automatic numbering as rendered: PART 1 -, 1.01, A., 1., a.
    t = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True).stdout; out = []
    for l in t.split('\n'):
        m = re.match(r'\s*(PART \d+ -|\d\.\d\d|[A-Z]\.|\d{1,2}\.|[a-z]\.)\s+(\S+(?:\s\S+){0,2})', l)
        if m: out.append(m.group(1) + ' ' + m.group(2)[:20])
    return out
import difflib
S, own = [], []
for r, f in zip(res, files):
    l = labels(os.path.join(pdfdir, os.path.splitext(os.path.basename(f))[0] + '.pdf')); S += l; own += [r['file']] * len(l)
CL = labels(combpdf)
sm = difflib.SequenceMatcher(None, S, CL, autojunk=False)
label_diffs = [{'file': own[min(a1, len(own) - 1)], 'source': S[a1:a2][:6], 'combined': CL[b1:b2][:6]} for op, a1, a2, b1, b2 in sm.get_opcodes() if op != 'equal']
short = {w: n - cw.get(w, 0) for w, n in total.items() if cw.get(w, 0) < n}
summary = {'sources': len(files), 'paragraphs_checked': sum(r['paragraphs'] for r in res), 'paragraphs_missing': sum(len(r['missing_paragraphs']) for r in res),
  'rendered_words_in_sources': sum(total.values()), 'rendered_words_in_combined': sum(cw.values()), 'rendered_words_short': short,
  'numbering_labels_in_sources': len(S), 'numbering_labels_in_combined': len(CL), 'numbering_differences': label_diffs,
  'source_pages': sum(r['source_pages'] for r in res), 'combined_pages': int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', combpdf], capture_output=True, text=True).stdout).group(1))}
json.dump({'summary': summary, 'files': res}, open(outp, 'w'), indent=1)
print(json.dumps(summary, indent=1)[:1500])
