"""Builds test DXF floor plans with ezdxf (an independent, AutoCAD-compatible DXF library).
python3 make_dxf.py <outdir>   -> plan-in.dxf (inches, R2010), plan-mm.dxf (millimetres), plan-nounits.dxf (unitless, R12)"""
import sys, ezdxf
from ezdxf import units

def plan(k, insunits, version='R2010'):
    doc = ezdxf.new(version, setup=True)
    if version != 'R12': doc.header['$INSUNITS'] = insunits
    for name, col in [('A-WALL', 7), ('A-DOOR', 3), ('A-GLAZ', 4), ('A-ANNO-TEXT', 2), ('A-ANNO-DIMS', 1), ('A-FURN', 8)]:
        doc.layers.add(name, color=col)
    msp = doc.modelspace()
    L = lambda a, b, layer='A-WALL': msp.add_line((a[0]*k, a[1]*k), (b[0]*k, b[1]*k), dxfattribs={'layer': layer})
    # 40'-0" x 30'-0" building, 8" exterior walls, a 4 1/2" partition
    for y, inner in ((0, False), (8, True)):
        xs = [(8 if inner else 0, 100), (136, 280), (352, 472 if inner else 480)]
        for a, b in xs: L((a, y), (b, y))
    for x in (100, 136, 280, 352): L((x, 0), (x, 8))
    for y, inner in ((360, False), (352, True)):
        xs = [(8 if inner else 0, 60), (120, 300), (360, 472 if inner else 480)]
        for a, b in xs: L((a, y), (b, y))
    for x in (60, 120, 300, 360): L((x, 352), (x, 360))
    L((0, 0), (0, 360)); L((8, 8), (8, 352)); L((480, 0), (480, 360)); L((472, 8), (472, 352))
    # partition as a closed LWPOLYLINE per piece (CAD users often draw walls this way)
    for y0, y1 in ((8, 150), (186, 352)):
        pts = [(237.75*k, y0*k), (242.25*k, y0*k), (242.25*k, y1*k), (237.75*k, y1*k)]
        if version == 'R12': msp.add_polyline2d(pts, close=True, dxfattribs={'layer': 'A-WALL'})
        else: msp.add_lwpolyline(pts, close=True, dxfattribs={'layer': 'A-WALL'})
    # door and window blocks
    d = doc.blocks.new('DOOR36')
    d.add_line((0, 0), (0, 36*k)); d.add_arc((0, 0), 36*k, 0, 90)
    w = doc.blocks.new('WIN')
    for yy in (0, 4, 8): w.add_line((0, yy*k), (1, yy*k))
    msp.add_blockref('DOOR36', (100*k, 8*k), dxfattribs={'layer': 'A-DOOR'})
    msp.add_blockref('DOOR36', (242.25*k, 150*k), dxfattribs={'layer': 'A-DOOR'})
    for x, wd, y in ((280, 72, 0), (60, 60, 352), (300, 60, 352)):
        msp.add_blockref('WIN', (x*k, y*k), dxfattribs={'layer': 'A-GLAZ', 'xscale': wd*k, 'yscale': 1})
    msp.add_text('LIVING', height=9*k, dxfattribs={'layer': 'A-ANNO-TEXT'}).set_placement((110*k, 180*k))
    msp.add_text('BEDROOM', height=9*k, dxfattribs={'layer': 'A-ANNO-TEXT'}).set_placement((330*k, 180*k))
    msp.add_text('SCALE: 1/4" = 1\'-0"', height=6*k, dxfattribs={'layer': 'A-ANNO-TEXT'}).set_placement((0, -80*k))
    # furniture (not walls)
    msp.add_circle((360*k, 260*k), 24*k, dxfattribs={'layer': 'A-FURN'})
    if version != 'R12':
        dim = msp.add_linear_dim(base=(0, -36*k), p1=(0, 0), p2=(480*k, 0), dxfattribs={'layer': 'A-ANNO-DIMS'}); dim.render()
        dim = msp.add_linear_dim(base=(-36*k, 0), p1=(0, 0), p2=(0, 360*k), angle=90, dxfattribs={'layer': 'A-ANNO-DIMS'}); dim.render()
    return doc

out = sys.argv[1]
plan(1, 1).saveas(out + '/plan-in.dxf')
plan(25.4, 4).saveas(out + '/plan-mm.dxf')
plan(1, 0, 'R12').saveas(out + '/plan-nounits.dxf')
print('ok')
