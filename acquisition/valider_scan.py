"""Contrôle angulaire d'une acquisition ; les données brutes restent intactes."""
import csv
import json
import math
from pathlib import Path
import sys

path=Path(sys.argv[1]).resolve()
with path.open(newline='',encoding='utf-8-sig') as f:
    reader=csv.DictReader(f); fields=reader.fieldnames; rows=list(reader)
if [int(r['point_index']) for r in rows] != list(range(len(rows))):
    raise ValueError('Indices non continus')
angles=[float(r['angle_deg']) for r in rows]
if not all(math.isfinite(a) and 0<=a<=360 for a in angles): raise ValueError('Angle non fini ou hors plage')
distance=[float(r['dist_mm']) for r in rows]
if not all(math.isfinite(r) for r in distance): raise ValueError('Distance non finie')
delta=[b-a for a,b in zip(angles,angles[1:])]
splits=[0]+[i+1 for i,d in enumerate(delta) if d>180]+[len(rows)]
candidates=[]
for start,end in zip(splits,splits[1:]):
    values=angles[start:end]; steps=[b-a for a,b in zip(values,values[1:])]
    if len(values)>100 and values[0]>357 and values[-1]<3 and values[0]-values[-1]>=357 and all(-3<=d<=0 for d in steps):
        candidates.append((start,end))
if not candidates: raise ValueError('Pas de balayage angulairement cohérent quasi complet ; fichier brut conservé')
start,end=candidates[-1]; selected=rows[start:end]; validated=path
if start!=0 or end!=len(rows):
    validated=path.with_name(path.stem+'_tour_controle.csv')
    with validated.open('w',newline='',encoding='utf-8') as f:
        writer=csv.DictWriter(f,fieldnames=fields+['source_point_index']);writer.writeheader()
        for index,row in enumerate(selected): writer.writerow({**row,'point_index':index,'source_point_index':row['point_index']})
values=angles[start:end]; steps=[b-a for a,b in zip(values,values[1:])]
report=dict(raw_file=path.name,validated_file=validated.name,raw_points=len(rows),points=len(selected),positive_distances=sum(float(r['dist_mm'])>0 for r in selected),invalid_distances=sum(float(r['dist_mm'])<=0 for r in selected),
    first_angle_deg=values[0],last_angle_deg=values[-1],angular_span_deg=round(values[0]-values[-1],2),max_step_deg=round(max(abs(d) for d in steps),2),
    internal_zero_wraps=0,backward_jumps=0,source_index_start=start,source_index_end=end-1,
    validation='Indices continus et progression angulaire monotone sur un balayage quasi complet ; immobilité et temps de rotation non mesurés')
path.with_name(path.stem+'_controle.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
manifest=path.parent/'manifest.json'
data=json.loads(manifest.read_text(encoding='utf-8')) if manifest.exists() else dict(description='Nouvelle série de scans avec recouvrement ; chaque acquisition est déclenchée après le signal utilisateur.',scans=[])
if not any(r['raw_file']==path.name for r in data['scans']):
    data['scans'].append({**report,'position_note':'Première position : référence locale, non mesurée.' if not data['scans'] else 'Déplacement et rotation physiques à préciser par l’opérateur.'})
manifest.write_text(json.dumps(data,indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
print('VALIDATED_PATH='+str(validated))
