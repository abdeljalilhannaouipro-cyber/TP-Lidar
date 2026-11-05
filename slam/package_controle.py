"""Génère la page embarquée et le dossier Arduino prêt à ouvrir."""
from pathlib import Path
import argparse
import shutil
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
slam = Path(__file__).resolve().parent
firmware = slam / 'firmware' / 'Robot_Clavier'
# Arduino peut déplacer le BOM du .cpp lors du prétraitement. Le retirer
# sans réencoder les commentaires du pilote fourni avec le kit.
for source in firmware.iterdir():
    if source.suffix in ('.ino', '.cpp', '.h'):
        data = source.read_bytes()
        while data.startswith(b'\xef\xbb\xbf'):
            data = data[3:]
        source.write_bytes(data)
html = (slam / 'controle.html').read_text(encoding='utf-8-sig')
js = (slam / 'controle.js').read_text(encoding='utf-8-sig')
tag = '<script src="controle.js?v=robot-lidar-v3"></script>'
assert tag in html
page = html.replace(tag, '<script>\n' + js + '\n</script>')
assert ')ROBOTPAGE"' not in page
(firmware / 'interface.h').write_text(
    '#pragma once\n#include <pgmspace.h>\n'
    'const char CONTROL_PAGE[] PROGMEM = R"ROBOTPAGE('
    + page + ')ROBOTPAGE";\n', encoding='utf-8')
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=True)
target = output / 'Robot_Clavier'
shutil.copytree(firmware, target, dirs_exist_ok=True)
(output / 'Controle_clavier_robot.html').write_text(page, encoding='utf-8')
shutil.copy2(firmware / 'LIRE_MOI.md', output / 'Mode_emploi_clavier_robot.md')
with zipfile.ZipFile(output / 'Robot_Clavier.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(target.rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(output))
# Le serveur local existant sert ce répertoire.
preview = output / 'TP3-SLAM' / 'slam'
preview.mkdir(parents=True, exist_ok=True)
for name in ('controle.html', 'controle.js'):
    shutil.copy2(slam / name, preview / name)
shutil.copytree(firmware, preview / 'firmware' / 'Robot_Clavier', dirs_exist_ok=True)
shutil.copy2(output / 'Robot_Clavier.zip', output / 'Robot_Lidar_Live.zip')
print(output / 'Robot_Lidar_Live.zip')
