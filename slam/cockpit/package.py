"""Assemble le cockpit autonome et le firmware correspondant, sans BOM."""
from pathlib import Path
import argparse
import shutil
import zipfile
import hashlib
import json

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=True)
bundle = out / 'Cockpit_TP3'
for relative in ('visualisation/core.js', 'visualisation/grid.js',
                 'visualisation/grid-localisation.js', 'slam/session.js',
                 'slam/acquisition.js'):
    target = bundle / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / relative, target)
for name in ('index.html', 'cockpit.css', 'cockpit.js', 'worker.js', 'README.md'):
    target = bundle / 'slam/cockpit' / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / 'slam/cockpit' / name, target)
shutil.copytree(root / 'slam/cockpit/data', bundle / 'slam/cockpit/data', dirs_exist_ok=True)
firmware = root / 'slam/firmware/Robot_Cockpit'
shutil.copytree(firmware, bundle / 'Robot_Cockpit', dirs_exist_ok=True)
shutil.copy2(root / 'slam/cockpit/README.md', bundle / 'LIRE_MOI.md')
for source in (bundle / 'Robot_Cockpit').iterdir():
    if source.suffix in ('.ino', '.h', '.cpp'):
        source.write_bytes(source.read_bytes().removeprefix(b'\xef\xbb\xbf'))
with zipfile.ZipFile(out / 'Robot_Cockpit.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for source in sorted((bundle / 'Robot_Cockpit').iterdir()):
        if source.is_file():
            archive.write(source, 'Robot_Cockpit/' + source.name)
with zipfile.ZipFile(out / 'Cockpit_TP3.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for source in sorted(bundle.rglob('*')):
        if source.is_file():
            archive.write(source, source.relative_to(out))
shutil.copytree(root / 'slam/cockpit', out / 'TP3-SLAM/slam/cockpit', dirs_exist_ok=True)
shutil.copytree(firmware, out / 'TP3-SLAM/slam/firmware/Robot_Cockpit', dirs_exist_ok=True)
shutil.copy2(root / 'slam/cockpit/README.md', out / 'Cockpit_TP3_mode_emploi.md')
report = {'firmware': 'tp3-cockpit-v1', 'rawCaptures': 300,
          'acceptedScans': 70, 'browserMapAndIsolatedScanVerified': True,
          'uiMockTests': 'PASS', 'motorMockTests': 'PASS',
          'esp32ObjectCompilation': 'PASS', 'esp32Core': '3.3.12',
          'fullArduinoLink': False, 'flashed': False,
          'hardwareMovementTested': False,
          'artifacts': {name: hashlib.sha256((out / name).read_bytes()).hexdigest()
                        for name in ('Robot_Cockpit.zip', 'Cockpit_TP3.zip')}}
(out / 'Cockpit_TP3_validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(out / 'Cockpit_TP3.zip')
print(out / 'Robot_Cockpit.zip')
