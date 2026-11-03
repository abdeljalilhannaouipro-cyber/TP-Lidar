"""Géométrie et cartographie LD06. Unités : mètres et radians, sauf CSV/degrés."""
import csv
import math
from dataclasses import dataclass

EPS = 1e-9  # mètres ; comparaisons de longueurs

def sub(a, b): return (a[0]-b[0], a[1]-b[1])
def dot(a, b): return a[0]*b[0]+a[1]*b[1]
def cross(a, b): return a[0]*b[1]-a[1]*b[0]
def norm(a): return math.hypot(*a)
def distance(a, b): return norm(sub(a, b))
def lerp(a, b, t): return (a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1]))

@dataclass
class Pose:
    x: float = 0
    y: float = 0
    theta: float = 0

    def apply(self, p):
        c, s = math.cos(self.theta), math.sin(self.theta)
        return (self.x+c*p[0]-s*p[1], self.y+s*p[0]+c*p[1])

def load_scan(path):
    """Angles horaires du LD06 : y=-r sin(angle), comme les CSV fournis.

    Les colonnes alignées ne sont pas réappliquées comme des mesures locales.
    Un CSV fusionné doit être séparé par source_scan avant de régler ses poses.
    """
    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        if not {'angle_deg', 'dist_mm'} <= set(reader.fieldnames or []):
            raise ValueError('Colonnes angle_deg et dist_mm nécessaires')
        if 'source_scan' in reader.fieldnames:
            raise ValueError('CSV fusionné : charger les scans bruts séparés')
        result = []
        for line, row in enumerate(reader, 2):
            try:
                a, r = math.radians(float(row['angle_deg'])), float(row['dist_mm'])/1000
                if not math.isfinite(a) or not math.isfinite(r):
                    raise ValueError('valeur non finie')
                # Les distances nulles ne décrivent pas un obstacle.
                if r <= 0:
                    continue
                result.append((r*math.cos(a), -r*math.sin(a)))
            except (ValueError, TypeError) as exc:
                raise ValueError(f'{path}, ligne {line}: {exc}') from exc
    if not result:
        raise ValueError('Aucune mesure valide')
    return result

@dataclass(frozen=True)
class Segment:
    a: tuple
    b: tuple

    @property
    def length(self): return distance(self.a, self.b)

    @property
    def direction(self):
        if self.length <= EPS:
            raise ValueError('Segment dégénéré')
        d = sub(self.b, self.a)
        return (d[0]/self.length, d[1]/self.length)

def angle(s, t):
    """Angle non orienté entre supports, de 0 à pi/2."""
    return math.acos(min(1., abs(dot(s.direction, t.direction))))

def point_segment_distance(p, s):
    d = sub(s.b, s.a)
    if s.length <= EPS: return distance(p, s.a)
    return distance(p, lerp(s.a, s.b, max(0., min(1., dot(sub(p, s.a), d)/dot(d, d)))))

def intersection(s, t):
    """Intersection sur les DEUX segments, extrémités incluses.

    Parallèles/colinéaires : None (pas d'intersection ponctuelle unique).
    """
    if min(s.length, t.length) <= EPS: return None
    u, v = s.direction, t.direction
    den = cross(u, v)
    if abs(den) <= 1e-12: return None  # tolérance angulaire
    delta = sub(t.a, s.a)
    along_s, along_t = cross(delta, v)/den, cross(delta, u)/den
    if -EPS <= along_s <= s.length+EPS and -EPS <= along_t <= t.length+EPS:
        return lerp(s.a, s.b, max(0., min(1., along_s/s.length)))
    return None

def cut_longest(s, cutter):
    p = intersection(s, cutter)
    if p is None: return s
    left, right = distance(s.a, p), distance(p, s.b)
    if min(left, right) <= EPS: return s
    # Egalité à EPS près : côté contenant le PREMIER point.
    return Segment(s.a, p) if left >= right-EPS else Segment(p, s.b)

def close(s, t, angular=math.radians(8), positional=.12):
    if angle(s, t) > angular: return False
    separation = 0. if intersection(s, t) is not None else min(
        point_segment_distance(s.a, t), point_segment_distance(s.b, t),
        point_segment_distance(t.a, s), point_segment_distance(t.b, s))
    return separation <= positional

def fit(points):
    """Droite des moindres carrés orthogonaux (PCA 2D), puis projection des bornes."""
    cx, cy = (sum(p[i] for p in points)/len(points) for i in (0, 1))
    xx = sum((p[0]-cx)**2 for p in points)
    yy = sum((p[1]-cy)**2 for p in points)
    xy = sum((p[0]-cx)*(p[1]-cy) for p in points)
    theta = .5*math.atan2(2*xy, xx-yy)
    u = (math.cos(theta), math.sin(theta))
    ts = [dot(sub(p, (cx, cy)), u) for p in points]
    return Segment((cx+min(ts)*u[0], cy+min(ts)*u[1]),
                   (cx+max(ts)*u[0], cy+max(ts)*u[1]))

def merge(s, t):
    if not close(s, t): raise ValueError('Segments trop éloignés pour fusionner')
    return fit([s.a, s.b, t.a, t.b])

def extract(points, gap=.30, residual=.04, min_points=5, min_length=.15):
    """Sépare les discontinuités du scan ordonné, puis split-and-fit récursif."""
    groups, group, result = [], [], []
    for p in points:
        if group and distance(p, group[-1]) > gap:
            groups.append(group)
            group = []
        group.append(p)
    groups.append(group)
    def split(pts):
        if len(pts) < min_points: return
        s = fit(pts)
        if s.length <= EPS: return
        u = s.direction
        errors = [abs(cross(sub(p, s.a), u)) for p in pts]
        k = max(range(len(pts)), key=errors.__getitem__)
        if errors[k] > residual:
            if k == 0: split(pts[1:])
            elif k == len(pts)-1: split(pts[:-1])
            else:
                split(pts[:k+1]); split(pts[k:])
        elif s.length >= min_length: result.append(s)
    for group in groups: split(group)
    return result

def update_vector(existing, incoming):
    """Fusion itérative puis découpage des croisements, dans l'ordre des scans."""
    result = list(existing)
    for new in incoming:
        changed = True
        while changed:
            changed = False
            for i, old in enumerate(result):
                if close(old, new):
                    new = merge(old, new)
                    result.pop(i)
                    changed = True
                    break
        result.append(new)
    for i in range(len(result)):
        for j in range(i+1, len(result)):
            a, b = result[i], result[j]
            result[i], result[j] = cut_longest(a, b), cut_longest(b, a)
    return result

def ray_cells(a, b, resolution):
    """DDA : toutes les cellules traversées, origine/impact inclus, coins en diagonale."""
    x, y = math.floor(a[0]/resolution), math.floor(a[1]/resolution)
    end = (math.floor(b[0]/resolution), math.floor(b[1]/resolution))
    dx, dy = b[0]-a[0], b[1]-a[1]
    sx, sy = (1 if dx > 0 else -1), (1 if dy > 0 else -1)
    tx = (((x+(dx>0))*resolution-a[0])/dx) if dx else math.inf
    ty = (((y+(dy>0))*resolution-a[1])/dy) if dy else math.inf
    dtx, dty = resolution/abs(dx) if dx else math.inf, resolution/abs(dy) if dy else math.inf
    yield (x, y)
    while (x, y) != end:
        if x == end[0]: tx = math.inf
        if y == end[1]: ty = math.inf
        if abs(tx-ty) <= 1e-12:
            x += sx; y += sy; tx += dtx; ty += dty
        elif tx < ty: x += sx; tx += dtx
        else: y += sy; ty += dty
        yield (x, y)

class Grid:
    def __init__(self, resolution=.10):
        if not math.isfinite(resolution) or resolution <= 0: raise ValueError('Résolution > 0 requise')
        self.resolution, self.cells = resolution, {}

    def update(self, points, pose):
        free, hits = set(), set()
        for p in points:
            cells = list(ray_cells((pose.x, pose.y), pose.apply(p), self.resolution))
            free.update(cells[:-1]); hits.add(cells[-1])
        # Une contribution par cellule/scan ; les impacts priment dans ce scan.
        for keys, delta in ((free-hits, -.4), (hits, .85)):
            for cell in keys: self.cells[cell] = max(-4., min(4., self.cells.get(cell, 0.)+delta))

    def probability(self, cell): return 1/(1+math.exp(-self.cells.get(cell, 0.)))

    def save(self, path):
        with open(path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['cell_x', 'cell_y', 'resolution_m', 'log_odds', 'p_occupied'])
            for cell in sorted(self.cells):
                writer.writerow([*cell, self.resolution, self.cells[cell], self.probability(cell)])

    @classmethod
    def load(cls, path):
        with open(path, newline='', encoding='utf-8') as f: rows = list(csv.DictReader(f))
        if not rows: raise ValueError('Grille vide')
        grid = cls(float(rows[0]['resolution_m']))
        for row in rows:
            if float(row['resolution_m']) != grid.resolution: raise ValueError('Résolutions incohérentes')
            value = float(row['log_odds'])
            if not math.isfinite(value): raise ValueError('Log-odds non fini')
            grid.cells[(int(row['cell_x']), int(row['cell_y']))] = max(-4., min(4., value))
        return grid
