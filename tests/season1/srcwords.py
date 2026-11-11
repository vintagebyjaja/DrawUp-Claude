# Independent word list of a .docx body (every paragraph and table cell, in order), used to check the importer.
# Typed numbering labels at the start of a paragraph, PART n prefixes and END OF SECTION lines are layout, not text.
import sys, zipfile, re, json, html
LABEL = re.compile(r'^\s*(?:PART\s+\d+\s*[-–—:.]?\s*|\d\.\d{1,2}\s+|[A-Z]\.\s+|\d{1,2}\.\s+|[a-z]\.\s+|\d{1,2}\)\s+)')
def paras(xml):
    body = xml.split('<w:body>', 1)[1]
    # table rows are joined; nested paragraphs in text boxes are part of their outer paragraph
    out = []
    for m in re.finditer(r'<w:p[ >].*?</w:p>|<w:p/>', body, re.S):
        seg = m.group(0)
        t = ''.join(' ' if x.startswith('<w:tab') else '-' if x.startswith('<w:noBreak') else html.unescape(x) for x in re.findall(r'(?<=<w:t>)[^<]*|(?<=<w:t xml:space="preserve">)[^<]*|<w:tab/>|<w:noBreakHyphen/>', seg))
        t = re.sub(r'\s+', ' ', t.replace(' ', ' ')).strip()
        if t: out.append(t)
    return out
res = {}
for f in sys.argv[1:]:
    xml = zipfile.ZipFile(f).read('word/document.xml').decode('utf8')
    words = []
    for t in paras(xml):
        if re.match(r'^END\s+OF\s+SECTION\b', t, re.I): continue
        # the manual writes each section's number itself; the numbers are checked separately
        if re.match(r'^SECTION\s+\d[\d\s.]*', t): t = re.sub(r'^SECTION\s+\d[\d\s.]*?(?=\s*[-–—:]?\s*[A-Za-z]|$)', 'SECTION', t)
        t = LABEL.sub('', t, count=1)
        words += t.split()
    res[f.rsplit('/', 1)[-1]] = words
print(json.dumps(res))
