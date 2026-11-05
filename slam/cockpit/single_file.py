"""Assemble un seul sketch : pilotes, interface, moteur SLAM et données réelles."""
from pathlib import Path
import gzip
import hashlib
import json
import argparse

parser=argparse.ArgumentParser()
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
firmware=root/'slam/firmware/Robot_Cockpit'
cockpit=root/'slam/cockpit'
assets={
 '/':('text/html; charset=utf-8',(cockpit/'index.html').read_text(encoding='utf-8-sig').replace('href="../"','href="/"').replace('href="/">▦ <span>Outils SLAM</span>','href="#captures">▦ <span>Captures</span>').replace('<section class="history">','<section class="history" id="captures">').encode()),
 '/cockpit.css':('text/css; charset=utf-8',(cockpit/'cockpit.css').read_bytes()),
 '/cockpit.js':('application/javascript; charset=utf-8',(cockpit/'cockpit.js').read_bytes()),
 '/worker.js':('application/javascript; charset=utf-8',(cockpit/'worker.js').read_bytes()),
 '/visualisation/core.js':('application/javascript; charset=utf-8',(root/'visualisation/core.js').read_bytes()),
 '/visualisation/grid.js':('application/javascript; charset=utf-8',(root/'visualisation/grid.js').read_bytes()),
 '/visualisation/grid-localisation.js':('application/javascript; charset=utf-8',(root/'visualisation/grid-localisation.js').read_bytes()),
 '/session.js':('application/javascript; charset=utf-8',(root/'slam/session.js').read_bytes()),
 '/acquisition.js':('application/javascript; charset=utf-8',(root/'slam/acquisition.js').read_bytes()),
 '/data/session.json':('application/json',(cockpit/'data/session.json').read_bytes()),
 '/data/acquisitions.json':('application/json',(cockpit/'data/acquisitions.json').read_bytes()),
}
header='''/* COCKPIT AUTONOME TP3 - FICHIER ARDUINO UNIQUE
   Ce sketch inclut le LD06, les commandes moteur fournies, l interface,
   le moteur SLAM navigateur et les 300 captures / 70 scans localises.
   ESP32 Dev Module / ESP32 core 3.x.
   IMPORTANT : Partition Scheme = Huge APP (3MB No OTA/1MB SPIFFS).
   Ce choix necessite un module disposant d au moins 4 Mo de flash.
   GPIO TX26 doit rester non connecte. RX lidar33 / commande lidar32.
   Moteurs : A={5,19,2,16}, B={18,21,4,17}, AVANT={-1,+1,+1,-1}.
   Wi-Fi RobotESP32 / 12345678 puis http://192.168.4.1/
   Premier essai roues soulevees. Aucune commande de mouvement au demarrage.
   La pose affichee est une estimation lidar, pas une mesure d odometrie.
   Sources des pilotes LD06 : ressources du cours fournies par l utilisateur.
*/
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
'''
crc=(firmware/'ld06crc.h').read_text(encoding='utf-8-sig')
ldh=(firmware/'ld06.h').read_text(encoding='utf-8-sig').replace('#include "ld06crc.h"','')
ldc=(firmware/'ld06.cpp').read_text(encoding='utf-8-sig').replace('#include "ld06.h"','')
arrays=[];routes=[];metadata=[]
for i,(url,(mime,data)) in enumerate(assets.items()):
 compressed=gzip.compress(data,compresslevel=9,mtime=0)
 assert gzip.decompress(compressed)==data
 name=f'COCKPIT_ASSET_{i}'
 lines=[','.join(f'0x{b:02x}' for b in compressed[j:j+24]) for j in range(0,len(compressed),24)]
 arrays.append(f'const uint8_t {name}[] PROGMEM = {{\n'+',\n'.join(lines)+'\n};\n')
 routes.append(f'  server.on("{url}",HTTP_GET,[](){{servirCockpit({name},sizeof({name}),"{mime}");}});')
 metadata.append({'url':url,'mime':mime,'bytes':len(data),'gzipBytes':len(compressed),'sha256':hashlib.sha256(data).hexdigest()})
helper='''void servirCockpit(const uint8_t* data,size_t size,const char* mime){
 server.sendHeader("Content-Encoding","gzip");
 server.sendHeader("Cache-Control","no-store");
 server.send_P(200,mime,reinterpret_cast<const char*>(data),size);
}
void enregistrerCockpit(){
'''+ '\n'.join(routes)+'\n}\n'
source=(firmware/'Robot_Cockpit.ino').read_text(encoding='utf-8-sig')
source='\n'.join(l for l in source.splitlines() if not l.lstrip().startswith('#include'))
a=source.index('const char PAGE[] PROGMEM');b=source.index(')HTML";',a)+len(')HTML";')
source=source[:a]+source[b:]
old='server.on("/", HTTP_GET, [](){server.send_P(200,"text/html; charset=utf-8",PAGE);});'
assert old in source
source=source.replace(old,'enregistrerCockpit();')
source=source.replace('void motorWatchdog(void*){',helper+'\nvoid motorWatchdog(void*){')
# Aucun serveur PC nécessaire ; le navigateur charge le calcul SLAM depuis le robot.
source=source.replace('Serial.println("SERVEUR PRET : http://192.168.4.1");','Serial.println("COCKPIT AUTONOME PRET : http://192.168.4.1/");')
args.output.mkdir(parents=True,exist_ok=True)
target=args.output/'Robot_Cockpit_Autonome.ino'
target.write_text(header+'\n'+crc+'\n'+ldh+'\n'+ldc+'\n'+'\n'.join(arrays)+'\n'+source+'\n',encoding='utf-8')
assert not target.read_bytes().startswith(b'\xef\xbb\xbf')
assert '#include "ld06.h"' not in target.read_text(encoding='utf-8')
(args.output/'Robot_Cockpit_Autonome_assets.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
print(target)
print('Total assets gzip:',sum(m['gzipBytes'] for m in metadata),'octets')
