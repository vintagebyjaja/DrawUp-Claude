"""Combine a folder of spec .docx files into one editable Word document without losing anything.
Each source keeps its own page setup, header and footer (as its own Word section), starts on a new page and
restarts its page numbers; "Page X of Y" counts the pages of that section. Usage: combine.py SRC_DIR OUT.docx"""
import sys, os, re, glob, json, copy
from docx import Document
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.opc.packuri import PackURI
from docx.parts.hdrftr import HeaderPart, FooterPart
from docxcompose.composer import Composer

src, out = sys.argv[1], sys.argv[2]
def key(f):
    b = os.path.basename(f).replace('_', ' ')
    if 'Cover' in b: return (0, '', b)
    if 'TABLE OF CONTENTS' in b: return (1, '', b)
    m = re.match(r'(\d\d)\s*(\d{4})(\.\d+)?', b)
    return (2, m.group(1) + m.group(2) + (m.group(3) or ''), b)
files = sorted(glob.glob(os.path.join(src, '*.docx')), key=key)
MARK = '@@DRAWUP-SOURCE-END-%d@@'

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
REF_TAGS = [qn('w:' + t) for t in ('pStyle', 'rStyle', 'tblStyle', 'basedOn', 'next', 'link', 'styleLink', 'numStyleLink')]
def isolate(d, i, f):
    """Gives every style of source i its own id, so no two sources share a style or a style-linked list: each section
    keeps exactly its own fonts, spacing and automatic numbering (PART 1, 1.01, A.). The source's default paragraph
    formatting is folded into its own Normal style, and paragraphs without a style are pointed at it."""
    tag = re.match(r'(\d\d)[ _]*(\d{4}(?:\.\d+)?)', os.path.basename(f).replace('_', ' '))
    label = ((tag.group(1) + ' ' + tag.group(2)) if tag else 'TOC') + ('' if i < 2 else ' ' + os.path.splitext(os.path.basename(f))[0].split('-', 1)[-1].replace('_', ' ').strip()[:24])
    suf = '-s%02d' % i
    st = d.styles.element
    ids = {s.get(qn('w:styleId')) for s in st.findall(qn('w:style'))}
    # fold docDefaults into this source's Normal
    dd = st.find(qn('w:docDefaults'))
    normal = next((s for s in st.findall(qn('w:style')) if s.get(qn('w:type')) == 'paragraph' and s.get(qn('w:default')) == '1'), None)
    if normal is not None and dd is not None:
        for kind in ('pPr', 'rPr'):
            src = dd.find('.//' + qn('w:' + kind + 'Default') + '/' + qn('w:' + kind))
            if src is None: continue
            mine = normal.find(qn('w:' + kind))
            if mine is None:
                mine = normal.makeelement(qn('w:' + kind), {}); normal.append(mine)
            have = {c.tag for c in mine}
            for c in src:
                if c.tag not in have: mine.append(copy.deepcopy(c))
    normal_id = normal.get(qn('w:styleId')) if normal is not None else None
    for s in st.findall(qn('w:style')):
        sid = s.get(qn('w:styleId'))
        if s.get(qn('w:default')) == '1': del s.attrib[qn('w:default')]
        s.set(qn('w:styleId'), sid + suf)
        nm = s.find(qn('w:name'))
        if nm is not None: nm.set(qn('w:val'), nm.get(qn('w:val')) + ' (' + label + ')')
    parts = [st, d.element]
    try: parts.append(d.part.numbering_part.element)
    except Exception: pass
    for rel in d.part.rels.values():
        if rel.is_external: continue
        el = getattr(rel.target_part, '_element', None)
        if el is not None and el not in parts: parts.append(el)
    for root in parts:
        for el in root.iter(*REF_TAGS):
            v = el.get(qn('w:val'))
            if v in ids: el.set(qn('w:val'), v + suf)
        if root is st or normal_id is None: continue
        for p in root.iter(qn('w:p')):
            ppr = p.find(qn('w:pPr'))
            if ppr is None: ppr = p.makeelement(qn('w:pPr'), {}); p.insert(0, ppr)
            if ppr.find(qn('w:pStyle')) is None:
                ps = ppr.makeelement(qn('w:pStyle'), {qn('w:val'): normal_id + suf}); ppr.insert(0, ps)

docs, sects = [], []
for i, f in enumerate(files):
    d = Document(f)
    # every sectPr of the source in document order, with the parts its header/footer references point at
    sp = []
    for s in d.element.body.iter(qn('w:sectPr')):
        refs = [(r.tag, r.get(qn('w:type')), d.part.related_parts[r.get(qn('r:id'))]) for r in s if r.tag in (qn('w:headerReference'), qn('w:footerReference'))]
        sp.append((copy.deepcopy(s), refs))
    sects.append(sp)
    if i: isolate(d, i, f)
    d.add_paragraph(MARK % i)
    docs.append(d)

master = docs[0]
comp = Composer(master)
comp.restart_numbering = False  # each source keeps its own list definitions
for d in docs[1:]: comp.append(d)
pkg, mpart = master.part.package, master.part
cache = {}
def copy_part(p, is_footer):
    if id(p) in cache: return cache[id(p)]
    blob = p.blob
    if is_footer: blob = blob.replace(b'NUMPAGES', b'SECTIONPAGES')  # per-source "Page X of Y"
    cls, tmpl, rt = (FooterPart, '/word/footer%d.xml', RT.FOOTER) if is_footer else (HeaderPart, '/word/header%d.xml', RT.HEADER)
    np = cls.load(PackURI(pkg.next_partname(tmpl)), p.content_type, blob, pkg)
    cache[id(p)] = mpart.relate_to(np, rt)
    return cache[id(p)]
def rebuilt(i, k, first):
    s, refs = sects[i][k]; s = copy.deepcopy(s)
    for r in list(s):
        if r.tag in (qn('w:headerReference'), qn('w:footerReference')): s.remove(r)
    for n, (tag, typ, part) in enumerate(refs):
        el = s.makeelement(tag, {qn('w:type'): typ, qn('r:id'): copy_part(part, tag == qn('w:footerReference'))})
        s.insert(n, el)
    if first:
        t = s.find(qn('w:type'))
        if t is None: t = s.makeelement(qn('w:type'), {}); s.insert(len(refs), t)
        t.set(qn('w:val'), 'nextPage')
        pg = s.find(qn('w:pgNumType'))
        if pg is None:
            pg = s.makeelement(qn('w:pgNumType'), {})
            anchor = s.find(qn('w:pgMar'))
            (anchor.addnext(pg) if anchor is not None else s.append(pg))
        pg.set(qn('w:start'), '1')
    return s

body = master.element.body
i, k = 0, 0
for p in list(body.iterchildren(qn('w:p'))):
    text = ''.join(t.text or '' for t in p.iter(qn('w:t')))
    if text == MARK % i:
        last = i == len(files) - 1
        s = rebuilt(i, len(sects[i]) - 1, k == 0)
        if last:
            body.remove(p)
            old = body.find(qn('w:sectPr')); body.replace(old, s)
        else:
            for r in p.findall(qn('w:r')): p.remove(r)
            ppr = p.find(qn('w:pPr'))
            if ppr is None: ppr = p.makeelement(qn('w:pPr'), {}); p.insert(0, ppr)
            for x in ppr.findall(qn('w:sectPr')): ppr.remove(x)
            ppr.append(s)
        i += 1; k = 0
        continue
    ppr = p.find(qn('w:pPr'))
    inner = ppr.find(qn('w:sectPr')) if ppr is not None else None
    if inner is not None:
        ppr.replace(inner, rebuilt(i, k, k == 0)); k += 1
assert i == len(files), ('markers found', i, len(files))
st = master.settings.element  # Word refreshes "Page X of Y" (per-section page counts) when the file opens
if st.find(qn('w:updateFields')) is None:
    st.append(st.makeelement(qn('w:updateFields'), {qn('w:val'): 'true'}))
master.save(out)
print(json.dumps({'files': [os.path.basename(f) for f in files], 'sections': len(master.sections)}))
