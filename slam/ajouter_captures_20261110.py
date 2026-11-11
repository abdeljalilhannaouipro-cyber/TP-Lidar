"""Réunir les exports réels sans doublons et recaler les nouveaux scans sur la référence précédente."""
from pathlib import Path
import json, hashlib, shutil, subprocess, sys, math, time
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'traitement_complet'))
from registration import register,downsample
OUT=ROOT/'slam/resultats/fusion_20261110'
OLD=ROOT/'slam/resultats/fusion_finale'
DOWNLOADS=Path('C:/Users/User1/Downloads')
OUT.mkdir(parents=True,exist_ok=True)
sources=OUT/'sources';sources.mkdir(exist_ok=True)
digest=lambda b:hashlib.sha256(b).hexdigest()
oldraw=json.loads((OLD/'acquisitions_originales.json').read_text())
unique={digest(s['csv'].encode()):{**s,'captureGroup':'precedentes'} for s in oldraw['scans']}
manifest=[]
for name in [f'acquisitions_slam_cockpit ({i}).json' for i in range(2,6)]+['session_slam_cockpit (2).json','session_slam_cockpit (3).json']:
    archived=sources/name
    if not archived.exists():shutil.copy2(DOWNLOADS/name,archived)
    payload=archived.read_bytes()
    manifest.append({'file':name,'sha256':digest(payload),'bytes':len(payload)})
    if name.startswith('acquisitions'):
        for scan in json.loads(payload)['scans']:
            unique.setdefault(digest(scan['csv'].encode()),{**scan,'captureGroup':'2026-11-10'})
raw=list(unique.values())
(OUT/'sources.json').write_text(json.dumps(manifest,indent=2))
(OUT/'acquisitions_reunies.json').write_text(json.dumps({'format':'tp3-raw-scans-v1','scans':raw,'counters':{'received':len(raw),'invalid':0}}),encoding='utf-8')
# Réutiliser exactement le convertisseur du visualiseur, notamment y=-r*sin(angle).
js="""const fs=require('node:fs'),Core=require(process.argv[1]);const scans=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).scans;fs.writeFileSync(process.argv[3],JSON.stringify(scans.map((s,index)=>({...Core.parseScan(s.csv,s.name,true),index,captureGroup:s.captureGroup}))));"""
subprocess.run(['node','-e',js,str(ROOT/'visualisation/core.js'),str(OUT/'acquisitions_reunies.json'),str(OUT/'captures_preparees.json')],check=True)
records=json.loads((OUT/'captures_preparees.json').read_text())
oldfusion=json.loads((OLD/'fusion.json').read_text())
oldposes={s['name']:s for s in oldfusion['scans']}
fixed=np.load(OLD/'reference.npy');shutil.copy2(OLD/'reference.npy',OUT/'reference.npy')
limits=json.loads((OLD/'bilan.json').read_text())['summary']['limits']
checkpoint=OUT/'recalage_checkpoint.json'
key=digest((OUT/'captures_preparees.json').read_bytes()+(OLD/'reference.npy').read_bytes()+json.dumps(limits,sort_keys=True).encode())
saved=json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
results={r['index']:r for r in saved.get('results',[])} if saved.get('key')==key else {}

def process(r):
    points=np.asarray(r['points']);q=np.asarray(r['qualities']);ranges=np.linalg.norm(points,axis=1)
    cloud=downsample(points[(ranges>=.2)&(ranges<=12)&(q>=100)])
    if len(cloud)<30:return {'index':r['index'],'name':r['name'],'accepted':False,'reason':'trop peu de points'}
    start=time.perf_counter();(a,t,quality),alt=register(cloud,fixed);margin=quality[0]-alt if alt is not None else 1.
    accepted=min(quality[1:3])>=.45 and quality[0]>=.45 and quality[3]<=.12 and margin>=.035
    return {'index':r['index'],'name':r['name'],'accepted':bool(accepted),'pose':{'x':float(t[0]),'y':float(t[1]),'theta':math.degrees(math.atan2(math.sin(a),math.cos(a)))},'score':quality[0],'movingOverlap':quality[1],'fixedOverlap':quality[2],'inlierRmseM':quality[3],'alternativeScore':alt,'alternativeMargin':margin,'elapsedS':time.perf_counter()-start}

new=[r for r in records if r['captureGroup']=='2026-11-10']
pending=[r for r in new if r['index'] not in results]
print(json.dumps({'uniqueCaptures':len(raw),'newCaptures':len(new),'remaining':len(pending)}),flush=True)
with ThreadPoolExecutor(max_workers=3) as pool:
    for future in as_completed([pool.submit(process,r) for r in pending]):
        r=future.result();results[r['index']]=r
        if len(results)%10==0 or len(results)==len(new):
            checkpoint.write_text(json.dumps({'key':key,'results':list(results.values())},indent=2))
            print(json.dumps({'processed':len(results),'total':len(new),'accepted':sum(r['accepted'] for r in results.values())}),flush=True)
placed=[]
for r in records:
    if r['captureGroup']=='precedentes' and r['name'] in oldposes:
        old=oldposes[r['name']];placed.append({**r,'pose':old['pose'],'poseSource':'fusion_precedente_conservee'})
    elif r['index'] in results and results[r['index']]['accepted']:
        placed.append({**r,'pose':results[r['index']]['pose'],'poseSource':'recalage_global_20261110_estime'})
summary={'inputCaptures':len(raw),'previousCaptures':len(oldraw['scans']),'newCaptures':len(new),'originalPoses':len(oldfusion['scans']),'newEstimatedPoses':sum(r['accepted'] for r in results.values()),'includedCaptures':len(placed),'excludedCaptures':len(raw)-len(placed),'limits':limits,'fullRoomCoverageVerified':False,'physicalPoseUncertainty':'unknown','method':'Fusion précédente conservée ; nouveaux scans recalés indépendamment sur la même référence fixe, rotation/FFT puis ICP et contrôles bidirectionnels.','note':'Les origines locales des nouvelles sessions ne sont pas assimilées au repère global. Les anciennes captures refusées restent hors carte ; tous les scans bruts sont conservés.'}
(OUT/'fusion.json').write_text(json.dumps({'summary':summary,'scans':placed}),encoding='utf-8')
(OUT/'bilan.json').write_text(json.dumps({'summary':summary,'registrations':list(results.values())},indent=2),encoding='utf-8')
subprocess.run([sys.executable,str(ROOT/'slam/export_fusion_finale.py'),str(OUT)],check=True)
print('FINAL '+json.dumps(summary),flush=True)
