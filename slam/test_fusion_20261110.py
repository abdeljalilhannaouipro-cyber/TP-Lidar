"""Vérifier sources, conservation des anciennes poses et géométrie des exports."""
from pathlib import Path
import json, hashlib, csv, math
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'resultats/fusion_20261110'
old=json.loads((ROOT/'resultats/fusion_finale/fusion.json').read_text())
raw=json.loads((OUT/'acquisitions_reunies.json').read_text())['scans']
fusion=json.loads((OUT/'fusion.json').read_text())
bilan=json.loads((OUT/'bilan.json').read_text())
cloud=json.loads((OUT/'nuage_fusionne.json').read_text())
assert len(raw)==975
assert len({hashlib.sha256(s['csv'].encode()).hexdigest() for s in raw})==len(raw)
assert sum(s['captureGroup']=='2026-11-10' for s in raw)==468
assert len(bilan['registrations'])==468
placed={s['name']:s for s in fusion['scans']}
for scan in old['scans']:
    assert placed[scan['name']]['pose']==scan['pose']
    assert placed[scan['name']]['points']==scan['points']
for r in bilan['registrations']:
    if r['accepted']:
        assert r['score']>=.45 and r['movingOverlap']>=.45 and r['fixedOverlap']>=.45
        assert r['inlierRmseM']<=.12 and r['alternativeMargin']>=.035
        assert placed[r['name']]['pose']==r['pose']
    else:assert r['name'] not in placed
assert len(placed)==203+sum(r['accepted'] for r in bilan['registrations'])
assert cloud['summary']['includedCaptures']+cloud['summary']['excludedCaptures']==len(raw)
assert all(all(math.isfinite(v) for v in p) for p in cloud['points'])
with (OUT/'scan_final.csv').open(newline='') as f:rows=list(csv.reader(f))
assert [[float(v) for v in row] for row in rows[1:]]==cloud['points']
ply=(OUT/'scan_final.ply').read_text().split('end_header\n')[1].strip().splitlines()
assert [[float(v) for v in row.split()[:2]] for row in ply]==[p[:2] for p in cloud['points']]
for source in json.loads((OUT/'sources.json').read_text()):
    assert hashlib.sha256((OUT/'sources'/source['file']).read_bytes()).hexdigest()==source['sha256']
print('PASS : 975 captures uniques dont 468 nouvelles ; 203 anciennes poses conservees ; seuils de recalage et geometrie CSV/PLY verifies.')
