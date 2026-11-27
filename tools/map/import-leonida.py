"""Builds content/map/leonida.json, the Leonida map geometry, from the Open GTA 6 Map data.

    python tools/map/import-leonida.py <folder with the Open GTA 6 Map data files>

The folder holds land.json, surface.json, roads.json, rails.json, locations.json and places.json from
https://github.com/fbritoferreira/gta6 (public/data), plus SHA.txt with the commit they came from.
That data is CC BY 4.0 (credit: "Map data from Open GTA 6 Map (fbritoferreira), CC BY 4.0"); the
coastline in it was traced from Rockstar's printable Leonida map. Fetch it pinned to one commit:

    SHA=$(gh api repos/fbritoferreira/gta6/commits/main --jq .sha)
    for f in land surface roads rails locations places; do
      curl -sSL -o $f.json https://raw.githubusercontent.com/fbritoferreira/gta6/$SHA/public/data/$f.json
    done; echo $SHA > SHA.txt

Needs shapely (pip install shapely==2.1.1). What it does, and what we changed (CC BY asks us to say):
- simplifies every shape a little (corners closer than a few metres) so the page stays light;
- city blocks: the spaces between the real streets inside built-up ground, drawn as low blocks;
- heights: the data has none. Blocks and buildings get illustrative heights by district (towers
  downtown, mid-rise on the beach, low elsewhere); the named towers are the tallest. Not measured.
Coordinates stay in the data's own map units (0 to 1024, y down; 1 unit = 32 m in game), stored as
integers in 1/20 unit, each ring delta-encoded.
"""
import json, math, os, sys
from shapely.geometry import Polygon, LineString, MultiPolygon, Point, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union, polygonize, linemerge
from shapely.strtree import STRtree

SRC = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'content', 'map', 'leonida.json')
Q = 20

def J(name): return json.load(open(os.path.join(SRC, name), encoding='utf8'))

def enc(coords, closed):
    pts = [(round(x * Q), round(y * Q)) for x, y in coords]
    if closed and len(pts) > 1 and pts[0] == pts[-1]: pts = pts[:-1]
    out, px, py = [], 0, 0
    for x, y in pts:
        if out and x == px and y == py: continue
        out += [x - px, y - py]; px, py = x, y
    return out

def polys(geom):
    if geom.is_empty: return []
    if isinstance(geom, Polygon): return [geom]
    if isinstance(geom, MultiPolygon): return list(geom.geoms)
    return [g for g in getattr(geom, 'geoms', []) if isinstance(g, Polygon)]

def enc_poly(p, tol, min_area=0.0):
    p = p.simplify(tol, preserve_topology=True)
    out = []
    for q in polys(p):
        if q.area < min_area or len(q.exterior.coords) < 4: continue
        q = orient(q, 1.0)   # outer ring one way, holes the other, so the page can fill with the nonzero rule
        rings = [enc(q.exterior.coords, True)] + [enc(h.coords, True) for h in q.interiors if Polygon(h).area >= min_area]
        out.append([r for r in rings if len(r) >= 6])
    return [o for o in out if o]

def clean(rings):
    try:
        g = Polygon(rings[0], rings[1:]).buffer(0)
    except Exception:
        return []
    return polys(g)

# ---------- land and surfaces ----------
land = [q for p in J('land.json') for q in clean(p)]
land_u = unary_union(land)
surf = {}
for f in J('surface.json')['features']:
    surf.setdefault(f['properties']['layer'], []).extend(clean(f['geometry']['coordinates']))
print({k: len(v) for k, v in surf.items()}, 'land', len(land))

out = {
    'source': 'Open GTA 6 Map (fbritoferreira), CC BY 4.0, https://github.com/fbritoferreira/gta6 at commit ' + open(os.path.join(SRC, 'SHA.txt')).read().strip(),
    'changes': 'Simplified shapes; city blocks made from the spaces between streets; illustrative building heights (the data has none).',
    'units': 'Open GTA 6 Map units: 0-1024, y down, 1 unit = 32 m; stored x20, delta-encoded per ring',
    'q': Q,
}
out['land'] = [r for p in land for r in enc_poly(p, 0.1, 0.02)]
# a light outline for the first paint (the page draws it before the full map arrives)
out['coarse'] = [r for p in land if p.area > 1.5 for r in enc_poly(p, 0.45, 1.5)]
out['shallow'] = [r for p in surf.get('shallow', []) for r in enc_poly(p, 0.3, 0.5)]
out['park'] = [r for p in surf.get('park', []) for r in enc_poly(p, 0.15, 0.1)]
out['sand'] = [r for p in surf.get('sand', []) for r in enc_poly(p, 0.15, 0.1)]
out['urban'] = [r for p in surf.get('urban', []) for r in enc_poly(p, 0.2, 0.2)]
out['paved'] = [r for p in surf.get('paved', []) for r in enc_poly(p, 0.1, 0.1)]

# ---------- roads and rails ----------
roads = {}
for f in J('roads.json')['features']:
    roads.setdefault(f['properties']['kind'], []).append(LineString(f['geometry']['coordinates']))
TOL = {'highway': 0.08, 'main': 0.06, 'street': 0.06, 'minor': 0.12}
out['roads'] = {}
for k, ls in roads.items():
    merged = linemerge(ls)
    parts = list(getattr(merged, 'geoms', [merged]))
    out['roads'][k] = [e for e in (enc(l.simplify(TOL[k]).coords, False) for l in parts) if len(e) >= 4]
rails = [LineString(f['geometry']['coordinates']) for f in J('rails.json')['features']]
rm = linemerge(rails)
out['rail'] = [e for e in (enc(l.simplify(0.1).coords, False) for l in getattr(rm, 'geoms', [rm])) if len(e) >= 4]

# ---------- heights ----------
def rnd(x, y):
    v = math.sin(x * 12.9898 + y * 78.233) * 43758.5453
    return v - math.floor(v)
# Built-up cores, by the district names in the data (map units). Downtown and the bay-front towers,
# the beach strip, and everything else.
CORES = [((493.6, 514.6), 16), ((498.5, 479.9), 11), ((506.5, 546.1), 9), ((492.0, 476.0), 7), ((512.0, 543.0), 6)]
BEACH = lambda x, y: x > 548 and 425 < y < 525
def zone(x, y):
    if any(math.hypot(x - cx, y - cy) < r for (cx, cy), r in CORES): return 2
    return 1 if BEACH(x, y) else 0

bld = [b for b in surf.get('building', []) if b.area >= 0.02]
tower_names = ('tower', 'residences', 'financial center', 'celtica', 'clarissa', 'vice regal', 'akio')
not_towers = ('water tower', 'radio tower', 'control tower', 'observation tower', 'fire tower', 'tower lever')
marks = []
for r in J('locations.json') + J('places.json'):
    n = r['name'].lower()
    if any(t in n for t in tower_names) and not any(t in n for t in not_towers): marks.append(Point(r['x'], r['y']))
tall = set()
if bld:
    tree = STRtree(bld)
    for m in marks:
        i = tree.nearest(m)
        if bld[i].distance(m) < 1.5: tall.add(int(i))
out['bld'] = []
for i, b in enumerate(bld):
    c = b.centroid; z = zone(c.x, c.y); r = rnd(c.x, c.y)
    big = min(1.0, math.sqrt(b.area) / 3)
    h = (200 + 60 * r) if i in tall else [8 + 12 * r, 22 + 40 * r * (0.5 + big), 55 + 130 * r * (0.4 + big)][z]
    for e in enc_poly(b, 0.05, 0.02): out['bld'].append([round(h), e[0]])
print('buildings', len(out['bld']), 'named towers', len(tall))

# ---------- city blocks: the spaces between the real streets, inside built-up ground ----------
lines = [l for k in ('highway', 'main', 'street', 'minor') for l in roads.get(k, [])] + rails
lines += [LineString(p.exterior.coords) for p in land]
faces = list(polygonize(unary_union(lines)))
urban_u = unary_union(surf.get('urban', []))
park_u = unary_union(surf.get('park', []) + surf.get('paved', []) + surf.get('sand', []))
bld_u = unary_union(bld) if bld else Polygon()
def lots(poly, size, gap):
    """Splits a block into a grid of lots along its own long side, with alleys between them."""
    mrr = poly.minimum_rotated_rectangle
    xy = list(mrr.exterior.coords)
    e = max(((xy[i], xy[i + 1]) for i in range(4)), key=lambda s: math.dist(*s))
    ang = math.atan2(e[1][1] - e[0][1], e[1][0] - e[0][0])
    ca, sa = math.cos(ang), math.sin(ang)
    loc = lambda x, y: (x * ca + y * sa, -x * sa + y * ca)
    wld = lambda u, v: (u * ca - v * sa, u * sa + v * ca)
    us, vs = zip(*(loc(x, y) for x, y in poly.exterior.coords))
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    nu, nv = max(1, round((u1 - u0) / size)), max(1, round((v1 - v0) / size))
    du, dv = (u1 - u0) / nu, (v1 - v0) / nv
    out = []
    for i in range(nu):
        for j in range(nv):
            a, b = u0 + i * du + gap / 2, u0 + (i + 1) * du - gap / 2
            c, d = v0 + j * dv + gap / 2, v0 + (j + 1) * dv - gap / 2
            if b <= a or d <= c: continue
            cell = Polygon([wld(a, c), wld(b, c), wld(b, d), wld(a, d)])
            out += [q for q in polys(cell.intersection(poly)) if q.area > 0.3 and q.area > 0.45 * cell.area]
    return out

blk, kept = [], 0
for f in faces:
    a = f.area
    if a < 0.3 or a > 220: continue
    c = f.representative_point()
    if not urban_u.contains(c) or not land_u.contains(c): continue
    if park_u.intersection(f).area > 0.5 * a: continue
    kept += 1
    g = f.buffer(-0.2, join_style='mitre')
    # a big block (a port, a campus, an estate) only gets buildings along its street front
    if a > 50: g = g.difference(f.buffer(-2.6, join_style='mitre'))
    g = g.intersection(land_u)
    for q in polys(g):
        if q.area < 0.15: continue
        q = q.difference(bld_u.buffer(0.15)) if bld_u.intersects(q) else q
        for qq in polys(q):
            if qq.area < 0.3: continue
            cc = qq.centroid; z = zone(cc.x, cc.y)
            for lot in lots(qq, [1.6, 1.4, 1.5][z], 0.22):
                lc = lot.centroid; r = rnd(lc.x, lc.y)
                h = [5 + 9 * r, 14 + 46 * r, (150 + 70 * r) if r > 0.86 else 30 + 110 * r][z]
                for e in enc_poly(lot, 0.05, 0.3): blk.append([round(h), e[0]])
out['blk'] = blk
print('faces', len(faces), 'blocks kept', kept, 'lots', len(blk))

xs = [p.bounds for p in land]
out['bbox'] = [min(b[0] for b in xs), min(b[1] for b in xs), max(b[2] for b in xs), max(b[3] for b in xs)]
text = json.dumps(out, separators=(',', ':'))
open(OUT, 'w', encoding='utf8').write(text)
print('wrote', OUT, len(text) // 1024, 'KB', {k: len(v) for k, v in out.items() if isinstance(v, list)}, {k: len(v) for k, v in out['roads'].items()})
