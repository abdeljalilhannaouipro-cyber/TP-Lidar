"""Fusion finale : poses de session conservées, recalage global des captures restantes.
Aucune pose n'est imposée aux captures qui échouent aux seuils du TP1.
"""
from pathlib import Path
import sys,json,math,time,hashlib
from concurrent.futures import ThreadPoolExecutor,as_completed
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'traitement_complet'))
from registration import register,rotate,downsample
OUT=Path(__file__).resolve().parent/'resultats'/'fusion_finale'
records=json.loads((OUT/'captures_preparees.json').read_text(encoding='utf-8'))
fixed=np.load(OUT/'reference.npy')
limits={'minBidirectionalOverlap':.45,'minScore':.45,'maxInlierRmseM':.12,'minAlternativeMargin':.035,'minRangeM':.2,'maxRangeM':12,'minIntensity':100}
key=hashlib.sha256(((OUT/'captures_preparees.json').read_text()+json.dumps(limits,sort_keys=True)+(OUT/'reference.npy').read_bytes().hex()).encode()).hexdigest()
checkpoint=OUT/'recalage_checkpoint.json';results={}
if checkpoint.exists():
 d=json.loads(checkpoint.read_text())
 if d.get('key')==key:results={r['index']:r for r in d['results']}

def process(record):
 p=np.asarray(record['points']);q=np.asarray(record['qualities']);d=np.linalg.norm(p,axis=1);cloud=downsample(p[(d>=.2)&(d<=12)&(q>=100)])
 if len(cloud)<30:return {'index':record['index'],'accepted':False,'reason':'trop peu de points de recalage'}
 start=time.perf_counter();(a,t,quality),alt=register(cloud,fixed)
 margin=quality[0]-alt if alt is not None else 1.
 accepted=min(quality[1],quality[2])>=.45 and quality[0]>=.45 and quality[3]<=.12 and margin>=.035
 return {'index':record['index'],'name':record['name'],'accepted':bool(accepted),'pose':{'x':float(t[0]),'y':float(t[1]),'theta':math.degrees(math.atan2(math.sin(a),math.cos(a)))},'score':quality[0],'movingOverlap':quality[1],'fixedOverlap':quality[2],'inlierRmseM':quality[3],'alternativeScore':alt,'alternativeMargin':margin,'elapsedS':time.perf_counter()-start}

pending=[r for r in records if not r['originalPose'] and r['index'] not in results]
print('Recherche globale des poses :',len(pending),'captures ; 70 poses initiales conservees.',flush=True)
with ThreadPoolExecutor(max_workers=3) as pool:
 jobs={pool.submit(process,r):r['index'] for r in pending}
 for future in as_completed(jobs):
  r=future.result();results[r['index']]=r
  if len(results)%10==0 or len(results)==437:
   checkpoint.write_text(json.dumps({'key':key,'limits':limits,'results':list(results.values())},indent=2),encoding='utf-8')
   print(json.dumps({'processed':len(results),'total':437,'newlyRegistered':sum(x['accepted'] for x in results.values())}),flush=True)
placed=[]
for r in records:
 if r['originalPose']:placed.append({**r,'pose':r['originalPose'],'poseSource':'session_originale'})
 elif results[r['index']]['accepted']:placed.append({**r,'pose':results[r['index']]['pose'],'poseSource':'recalage_global_estime'})
summary={'inputCaptures':len(records),'originalPoses':70,'newEstimatedPoses':sum(x['accepted'] for x in results.values()),'includedCaptures':len(placed),'excludedCaptures':len(records)-len(placed),'method':'Poses originales + recherche rotation 360 deg / translation FFT puis ICP robuste, controle recouvrement bidirectionnel et ambiguite sur reference fixe.','limits':limits,'fullRoomCoverageVerified':False,'physicalPoseUncertainty':'unknown','note':'Le recalage supplementaire est estime hors ligne, pas une trajectoire SLAM mesuree ; les captures refusees ne sont pas placees arbitrairement.'}
(OUT/'fusion.json').write_text(json.dumps({'summary':summary,'scans':placed}),encoding='utf-8')
(OUT/'bilan.json').write_text(json.dumps({'summary':summary,'registrations':list(results.values())},indent=2),encoding='utf-8')
print('FINAL '+json.dumps(summary),flush=True)
