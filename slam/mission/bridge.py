"""Mission Lidar : serveur local et relais HTTP vers le robot ESP32."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, build_opener, ProxyHandler
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, parse_qs, urlencode
from pathlib import Path
import argparse
import base64
import gzip
import json
import secrets
import socket
import webbrowser

EMBEDDED_ASSETS = {}
ROBOT_URL = 'http://192.168.4.1'
ALLOWED = {'/ping','/interface_version','/forward','/backward','/left','/right',
           '/rotateleft','/rotateright','/strafeleft','/straferight','/stop','/scan','/lidar_status'}
MOTION = {'/forward','/backward','/left','/right','/rotateleft','/rotateright','/strafeleft','/straferight'}

def local_address():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(('192.168.4.1',80))
            return sock.getsockname()[0]
    except OSError:
        return 'indisponible'

def fetch_robot(route, query):
    opener = build_opener(ProxyHandler({}))
    request = Request(ROBOT_URL+route+('?' + query if query else ''),
                      headers={'Connection':'close','Cache-Control':'no-cache'})
    try:
        with opener.open(request, timeout=3) as response:
            data = response.read(512*1024+1)
            if len(data)>512*1024:
                return 502, 'text/plain; charset=utf-8', b'Reponse robot trop volumineuse.', True
            return response.status, response.headers.get('Content-Type','text/plain'), data, True
    except HTTPError as error:
        return error.code, error.headers.get('Content-Type','text/plain'), error.read(8192), True
    except (URLError, TimeoutError, OSError) as error:
        text = ('Aucune reponse de 192.168.4.1 depuis le PC ('+local_address()+'). '
                'Connecter le Wi-Fi du PC a RobotESP32 / 12345678 et rester connecte sans Internet. '
                'Detail : '+type(error).__name__+'.')
        return 504, 'text/plain; charset=utf-8', text.encode(), False

def load_assets():
    if EMBEDDED_ASSETS:
        return {url:(entry['type'],base64.b64decode(entry['gzip'])) for url,entry in EMBEDDED_ASSETS.items()}
    root=Path(__file__).resolve().parents[2]
    files={
        '/':('text/html; charset=utf-8',root/'slam/mission/index.html'),
        '/mission.css':('text/css; charset=utf-8',root/'slam/mission/mission.css'),
        '/mission.js':('application/javascript; charset=utf-8',root/'slam/mission/mission.js'),
        '/worker.js':('application/javascript; charset=utf-8',root/'slam/mission/worker.js'),
        '/visualisation/core.js':('application/javascript; charset=utf-8',root/'visualisation/core.js'),
        '/visualisation/grid.js':('application/javascript; charset=utf-8',root/'visualisation/grid.js'),
        '/visualisation/grid-localisation.js':('application/javascript; charset=utf-8',root/'visualisation/grid-localisation.js'),
        '/session.js':('application/javascript; charset=utf-8',root/'slam/session.js'),
        '/acquisition.js':('application/javascript; charset=utf-8',root/'slam/acquisition.js'),
        '/data/session.json':('application/json',root/'slam/cockpit/data/session.json'),
        '/data/acquisitions.json':('application/json',root/'slam/cockpit/data/acquisitions.json')}
    return {url:(mime,gzip.compress(file.read_bytes(),mtime=0)) for url,(mime,file) in files.items()}

def make_handler(assets,key,upstream=fetch_robot):
    class Handler(BaseHTTPRequestHandler):
        server_version='MissionLidar/1.0'
        def send_bytes(self,status,mime,data,extra=None):
            self.send_response(status)
            self.send_header('Content-Type',mime)
            self.send_header('Content-Length',str(len(data)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Cross-Origin-Resource-Policy','same-origin')
            self.send_header('X-Frame-Options','DENY')
            for name,value in (extra or {}).items():self.send_header(name,value)
            self.end_headers()
            try:self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):pass
        def do_GET(self):
            if self.headers.get('Host') not in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}:
                self.send_bytes(403,'text/plain',b'Hote local non autorise.');return
            url=urlsplit(self.path)
            if url.path=='/bridge/status':
                data={'version':'mission-bridge-v1','localAddress':local_address(),'robotAddress':ROBOT_URL}
                self.send_bytes(200,'application/json',json.dumps(data).encode());return
            if url.path.startswith('/robot/'):
                if not secrets.compare_digest(self.headers.get('X-Mission-Key',''),key):
                    self.send_bytes(403,'text/plain',b'Commande locale non autorisee.');return
                origin=self.headers.get('Origin')
                if origin and origin not in {f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'}:
                    self.send_bytes(403,'text/plain',b'Origine non autorisee.');return
                route=url.path[len('/robot'):]
                if route not in ALLOWED:
                    self.send_bytes(404,'text/plain',b'Route robot interdite.');return
                args=parse_qs(url.query,keep_blank_values=True)
                if set(args)-{'seq'}:
                    self.send_bytes(400,'text/plain',b'Parametre non autorise.');return
                if route in MOTION or 'seq' in args:
                    seq=args.get('seq',[''])[0]
                    if len(args.get('seq',[]))!=1 or not seq.isascii() or not seq.isdigit() or not 1<=len(seq)<=16 or int(seq)==0:
                        self.send_bytes(400,'text/plain',b'Sequence invalide.');return
                status,mime,data,reachable=upstream(route,urlencode({k:v[0] for k,v in args.items()}))
                self.send_bytes(status,mime,data,{'X-Robot-Reachable':'1' if reachable else '0'});return
            path=url.path
            if path.startswith('/slam/mission/'):
                path='/'+path[len('/slam/mission/'):]
            aliases={'/index.html':'/','/slam/session.js':'/session.js','/slam/acquisition.js':'/acquisition.js'}
            path=aliases.get(path,path)
            if path not in assets:
                self.send_bytes(404,'text/plain',b'Ressource introuvable.');return
            mime,data=assets[path]
            if path=='/mission.js':
                data=gzip.compress(gzip.decompress(data).replace(b'__MISSION_KEY__',key.encode()),mtime=0)
            self.send_bytes(200,mime,data,{'Content-Encoding':'gzip'})
        def log_message(self,fmt,*args):
            if '/robot/' in (args[0] if args else ''):print('Robot :',args[0],args[1] if len(args)>1 else '')
    return Handler

def main():
    parser=argparse.ArgumentParser(description='Mission Lidar - interface locale et liaison robot')
    parser.add_argument('--port',type=int,default=8767)
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    key=secrets.token_urlsafe(32)
    try:server=ThreadingHTTPServer(('127.0.0.1',args.port),make_handler(load_assets(),key))
    except OSError as error:
        url=f'http://127.0.0.1:{args.port}/'
        try:
            with build_opener(ProxyHandler({})).open(url+'bridge/status',timeout=1) as response:
                existing=json.load(response)
            if existing.get('version')=='mission-bridge-v1':
                print('Mission Lidar est deja ouvert :',url,flush=True)
                if not args.no_browser:webbrowser.open(url)
                return
        except (OSError,URLError,ValueError):
            pass
        print('Impossible de lancer le serveur :',error)
        print('Le port est peut-etre deja utilise. Ouvrir http://127.0.0.1:'+str(args.port)+'/')
        raise SystemExit(1)
    url=f'http://127.0.0.1:{args.port}/'
    print('MISSION LIDAR - serveur local pret :',url,flush=True)
    print('Wi-Fi du PC : RobotESP32 / 12345678 ; robot :',ROBOT_URL,flush=True)
    print('Garder cette fenetre ouverte. Ctrl+C pour quitter. Aucun mouvement automatique.',flush=True)
    if not args.no_browser:webbrowser.open(url)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
