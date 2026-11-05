from pathlib import Path
import importlib.util,base64,json,argparse,zipfile,shutil,hashlib
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
base=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('mission_bridge',base/'bridge.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
assets=module.load_assets();embedded={url:{'type':mime,'gzip':base64.b64encode(data).decode()} for url,(mime,data) in assets.items()}
text=(base/'bridge.py').read_text(encoding='utf-8-sig');text=text.replace('EMBEDDED_ASSETS = {}','EMBEDDED_ASSETS = '+repr(embedded))
args.output.mkdir(parents=True,exist_ok=True);dest=args.output/'Lancer_Mission_SLAM.py';dest.write_text(text,encoding='utf-8')
with zipfile.ZipFile(args.output/'Mission_SLAM.zip','w',zipfile.ZIP_DEFLATED) as z:
 z.write(dest,dest.name)
 if (base/'README.md').exists():z.write(base/'README.md','LIRE_MOI.md')
 for p in (base.parents[0]/'firmware/Robot_Cockpit').iterdir():
  if p.is_file():z.write(p,'Robot_Cockpit/'+p.name)
print(dest);print('Assets integres :',len(assets),'| SHA256',hashlib.sha256(dest.read_bytes()).hexdigest())
