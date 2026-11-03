"""Exports reproductibles sans interface graphique ni dépendance externe."""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
from lidar import Grid, Pose, load_scan, extract, update_vector

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scan', action='append', required=True, help='CSV brut, option répétable')
    parser.add_argument('--pose', action='append', help='x,y,theta_deg ; une pose par --scan, dans le même ordre')
    parser.add_argument('--resolution', type=float, default=.1)
    parser.add_argument('--base-grid', help='Grille CSV à mettre à jour ; utiliser seulement des scans nouveaux')
    parser.add_argument('--output', default='exports')
    args = parser.parse_args()
    if args.pose and len(args.pose) != len(args.scan): parser.error('Une --pose par --scan requise')
    grid = Grid.load(args.base_grid) if args.base_grid else Grid(args.resolution)
    vector, clouds, seen = [], [], set()
    poses = args.pose or ['0,0,0']*len(args.scan)
    metadata = []
    for path, specification in zip(args.scan, poses):
        fingerprint = hashlib.sha256(Path(path).read_bytes()).hexdigest()
        if fingerprint in seen:
            print(f'Doublon ignoré : {path}'); continue
        seen.add(fingerprint)
        x, y, deg = map(float, specification.split(','))
        if not all(math.isfinite(v) for v in (x, y, deg)): raise ValueError('Pose non finie')
        pose = Pose(x, y, math.radians(deg))
        points = load_scan(path)
        grid.update(points, pose)
        cloud = [pose.apply(p) for p in points]; clouds.append(cloud)
        vector = update_vector(vector, extract(cloud))
        metadata.append(dict(source=Path(path).name, sha256=fingerprint, pose_m_deg=[x, y, deg], points=len(points)))
    folder = Path(args.output); folder.mkdir(parents=True, exist_ok=True)
    grid.save(folder/'occupation.csv')
    with (folder/'segments.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f); writer.writerow(['x1_m', 'y1_m', 'x2_m', 'y2_m'])
        writer.writerows([(*s.a, *s.b) for s in vector])
    with (folder/'points.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f); writer.writerow(['source_scan', 'x_m', 'y_m'])
        for meta, cloud in zip(metadata, clouds): writer.writerows([(meta['source'], *p) for p in cloud])
    (folder/'metadata.json').write_text(json.dumps(dict(scans=metadata, resolution_m=grid.resolution,
        cells=len(grid.cells), segments=len(vector), note='Poses saisies, sans recalage automatique'), indent=2), encoding='utf-8')
    allpoints = [p for cloud in clouds for p in cloud]
    if grid.cells:
        xs, ys = zip(*grid.cells)
        r = grid.resolution
        allpoints.extend([(min(xs)*r, min(ys)*r), ((max(xs)+1)*r, (max(ys)+1)*r)])
    xmin, xmax = min(p[0] for p in allpoints)-.3, max(p[0] for p in allpoints)+.3
    ymin, ymax = min(p[1] for p in allpoints)-.3, max(p[1] for p in allpoints)+.3
    scale = min(740/(xmax-xmin), 610/(ymax-ymin))
    def xy(p): return (30+(p[0]-xmin)*scale, 65+(ymax-p[1])*scale)
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="740" viewBox="0 0 1600 740">',
           '<rect width="1600" height="740" fill="#eeeeee"/>',
           '<g font-family="sans-serif" font-size="18" fill="#222">',
           '<text x="30" y="30">Scans et segments (mètres)</text>',
           '<text x="830" y="30">Occupation : blanc libre, noir occupé, gris inconnu</text>',
           '<text x="30" y="720">Poses saisies ; positions nulles par défaut. Aucun recalage automatique.</text></g>']
    for i, cloud in enumerate(clouds):
        color = ['#1565c0', '#d84315', '#00875a'][i%3]
        for p in cloud:
            x, y = xy(p); svg.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="1.4" fill="{color}"/>')
    for s in vector:
        x1, y1 = xy(s.a); x2, y2 = xy(s.b)
        svg.append(f'<path d="M{x1:.2f},{y1:.2f} L{x2:.2f},{y2:.2f}" stroke="#92278f" stroke-width="1.5"/>')
    r = grid.resolution
    for cell in grid.cells:
        x, y = xy((cell[0]*r, (cell[1]+1)*r)); g = round(255*(1-grid.probability(cell)))
        svg.append(f'<rect x="{x+800:.2f}" y="{y:.2f}" width="{r*scale+.1:.2f}" height="{r*scale+.1:.2f}" fill="rgb({g},{g},{g})"/>')
    for meta in metadata:
        x, y, deg = meta['pose_m_deg']; px, py = xy((x, y))
        svg.append(f'<circle cx="{px:.2f}" cy="{py:.2f}" r="4" fill="#000"/>')
    svg.append('</svg>'); (folder/'apercu.svg').write_text('\n'.join(svg), encoding='utf-8')
    print(f'{len(clouds)} scans uniques, {len(grid.cells)} cellules, {len(vector)} segments. Exports : {folder}')

if __name__ == '__main__': main()
