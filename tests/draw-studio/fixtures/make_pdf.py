"""Vector PDF fixtures: a 40'x30' plan at 1/4" = 1'-0" (18 pt per foot) with 8" exterior walls as
double lines, one 4.5" partition, a 36" door gap with a swing arc, a 48" window with glazing lines,
room names and a scale note. Also a scanned (image-only) PDF for the picture route.
Run: python3 make_pdf.py"""
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import landscape, TABLOID
import io
from PIL import Image, ImageDraw
FT = 18.0  # points per foot at 1/4" = 1'-0"
IN = FT / 12
W, H = landscape(TABLOID)
ox, oy = 150, 150  # paper origin of the plan's lower-left outer corner

def P(x, y):  # plan inches -> paper points (y up in PDF)
    return ox + x * IN, oy + y * IN

def line(c, a, b):
    c.line(*P(*a), *P(*b))

def vector(path):
    c = canvas.Canvas(path, pagesize=(W, H))
    c.setLineWidth(0.8)
    L, D, T = 480, 360, 8
    # outer and inner faces; door gap on the south wall from x=100..136, window on the north wall x=200..248
    # south wall (y=0..8)
    for y in (0, T):
        line(c, (0 if y == 0 else T, y), (100, y)); line(c, (136, y), (L if y == 0 else L - T, y))
    line(c, (100, 0), (100, T)); line(c, (136, 0), (136, T))
    # door leaf and swing
    line(c, (100, T), (100, T + 36))
    c.arc(*P(100 - 36, T - 36), *P(100 + 36, T + 36), startAng=0, extent=90)
    # north wall (y=D-T..D)
    for y in (D, D - T):
        line(c, (0 if y == D else T, y), (200, y)); line(c, (248, y), (L if y == D else L - T, y))
    line(c, (200, D - T), (200, D)); line(c, (248, D - T), (248, D))
    for y in (D - T + 2.5, D - T / 2, D - 2.5):
        line(c, (200, y), (248, y))
    # west and east
    for x in (0, T):
        line(c, (x, 0 if x == 0 else T), (x, D if x == 0 else D - T))
    for x in (L, L - T):
        line(c, (x, 0 if x == L else T), (x, D if x == L else D - T))
    # partition at x=240, 4.5" thick, full depth inside
    for x in (240, 244.5):
        line(c, (x, T), (x, D - T))
    c.setFont('Helvetica', 9)
    c.drawString(*P(90, 180), 'LIVING')
    c.drawString(*P(330, 180), 'BEDROOM')
    c.setFont('Helvetica', 10)
    c.drawString(60, 60, 'FLOOR PLAN   SCALE: 1/4" = 1\'-0"')
    c.showPage(); c.save()

def scanned(path):
    img = Image.new('L', (1700, 1100), 255); d = ImageDraw.Draw(img)
    d.rectangle([200, 200, 1400, 900], outline=0, width=14); d.line([800, 200, 800, 900], fill=0, width=8)
    buf = io.BytesIO(); img.save(buf, 'PNG'); buf.seek(0)
    c = canvas.Canvas(path, pagesize=(W, H))
    from reportlab.lib.utils import ImageReader
    c.drawImage(ImageReader(buf), 0, 0, W, H); c.showPage(); c.save()

vector('plan-vector.pdf'); scanned('plan-scanned.pdf'); print('ok')
