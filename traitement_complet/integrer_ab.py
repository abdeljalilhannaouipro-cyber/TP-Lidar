"""Ajoute A/B aux 17 acquisitions, en conservant les résultats historiques."""
import csv
import hashlib
import json
from pathlib import Path
import numpy as np
import alignement as base

DEST = Path(__file__).resolve().parent / 'resultats_19_scans'
original_inventory = base.inventory

def inventory():
    records, clouds = original_inventory()
    for letter, filename in [('A', 'scan_20261103_180804_809310.csv'), ('B', 'scan_20261103_181437_335740.csv')]:
        relative = f'localisation/entre_scans/campagne_mesuree/{letter}/{filename}'
        path = base.ROOT / relative
        with path.open(encoding='utf-8-sig', newline='') as f:
            rows = list(csv.DictReader(f))
        points = [[float(r['x_lib_mm']) / 1000, float(r['y_lib_mm']) / 1000] for r in rows
                  if .2 <= float(r['dist_mm']) / 1000 <= 12 and float(r.get('intensity', 255)) >= 100]
        cloud = base.downsample(np.asarray(points))
        distances = np.sum((cloud[:, None, :] - cloud[None, :, :]) ** 2, axis=2)
        cloud = cloud[np.sum(distances <= .25 ** 2, axis=1) >= 3]
        if len(cloud) < 30:
            raise ValueError('Trop peu de points pour ' + letter)
        index = len(records)
        records.append(dict(index=index, label=f'S{index+1:02d}', path=relative, name=filename,
                            series='mesuree_AB', sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                            measurements=len(rows), valid_points=sum(float(r['dist_mm']) > 0 for r in rows),
                            registration_points=len(cloud)))
        clouds.append(cloud)
    return records, clouds

if __name__ == '__main__':
    DEST.mkdir(exist_ok=True)
    records, _ = inventory()
    historical = json.loads((base.DEST / 'alignement.json').read_text(encoding='utf-8'))
    assert records[:17] == historical['inputs'], 'Sources historiques modifiées : recalcul nécessaire.'
    config_key = hashlib.sha256((json.dumps(records, sort_keys=True) + json.dumps(base.LIMITS, sort_keys=True)
                                + Path(base.__file__).with_name('registration.py').read_text()).encode()).hexdigest()
    checkpoint = DEST / 'paires_checkpoint.json'
    if not checkpoint.exists():
        # Reuse only pairwise measurements, before pose-graph loop rejection.
        old = json.loads((base.DEST / 'paires_checkpoint.json').read_text())
        old_key = hashlib.sha256((json.dumps(records[:17], sort_keys=True) + json.dumps(base.LIMITS, sort_keys=True)
                                 + Path(base.__file__).with_name('registration.py').read_text()).encode()).hexdigest()
        assert old['config_key'] == old_key, 'Paramètres ou algorithme historiques modifiés.'
        assert len(old['edges']) == 136
        checkpoint.write_text(json.dumps(dict(config_key=config_key, edges=old['edges']), indent=2))
    base.inventory = inventory
    base.DEST = DEST
    base.main()
    result = json.loads((DEST / 'alignement.json').read_text(encoding='utf-8'))
    result['measuredReference'] = dict(relativePose=dict(x=.5, y=0, theta=0), smallestGraduationM=.01,
        uncertaintyBounds=dict(xM=None,yM=None,angleDeg=None), indices=[17,18],
        usage='Independent operator nominal reference, not a forced pose-graph constraint.')
    result['photoUsage'] = 'Qualitative context only; no dimensions or lidar correspondences inferred from photographs.'
    (DEST / 'alignement.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
