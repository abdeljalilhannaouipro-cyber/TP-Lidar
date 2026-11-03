"""Recalcul des poses sur les 17 scans contrôlés. Dépendance : NumPy.

Depuis la racine : python traitement_complet/alignement.py
Les composantes sans lien suffisamment fiable restent dans des repères séparés.
"""
import csv
import hashlib
import itertools
import json
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import numpy as np
from registration import register, downsample, rotate

ROOT=Path(__file__).resolve().parent.parent
DEST=Path(__file__).resolve().parent/'resultats'
OLD=['scan_20261103_112700_205708.csv','scan_20261103_112833_263525.csv','scan_20261103_113456_758311.csv',
     'controle_scans/scan_20261103_113714_728775_tour2.csv','scan_20261103_113903_422823.csv','controle_scans/scan_20261103_114251_824188_tour2.csv']
LIMITS=dict(min_bidirectional_overlap=.45,min_score=.45,max_inlier_rmse_m=.12,min_alternative_margin=.035,
            max_loop_translation_m=.30,max_loop_rotation_deg=8,registration_min_range_m=.20,registration_max_range_m=12,
            registration_min_intensity=100,registration_neighbours_radius_m=.25,registration_neighbours_minimum=3)

def wrap(a):return math.atan2(math.sin(a),math.cos(a))

def inventory():
    records=[];clouds=[]
    manifest=json.loads((ROOT/'nouvelle_serie/manifest.json').read_text(encoding='utf-8'))
    paths=[(p,'ancienne') for p in OLD]+[('nouvelle_serie/'+r['validated_file'],'nouvelle') for r in manifest['scans']]
    for i,(relative,series) in enumerate(paths):
        path=ROOT/relative
        with path.open(newline='',encoding='utf-8-sig') as f:rows=list(csv.DictReader(f))
        points=[];valid=0
        for row in rows:
            r=float(row['dist_mm'])/1000
            if r>0:valid+=1
            if LIMITS['registration_min_range_m']<=r<=12 and float(row.get('intensity',255))>=100:
                points.append([float(row['x_lib_mm'])/1000,float(row['y_lib_mm'])/1000])
        cloud=downsample(np.asarray(points,dtype=float))
        d=np.sum((cloud[:,None,:]-cloud[None,:,:])**2,axis=2)
        keep=np.sum(d<=.25**2,axis=1)>=3
        if keep.sum()<30:raise ValueError(f'{relative}: trop peu de points après filtrage de recalage')
        cloud=cloud[keep]
        records.append(dict(index=i,label=f'S{i+1:02d}',path=relative,name=path.name,series=series,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                            measurements=len(rows),valid_points=valid,registration_points=len(cloud)))
        clouds.append(cloud)
    return records,clouds

def pair(i,j,clouds):
    (angle,t,q),alternative=register(clouds[j],clouds[i])
    margin=q[0]-alternative if alternative is not None else 1.
    accepted=min(q[1],q[2])>=.45 and q[0]>=.45 and q[3]<=.12 and margin>=.035
    return dict(i=i,j=j,theta=wrap(angle),translation=t.tolist(),score=q[0],moving_overlap=q[1],fixed_overlap=q[2],inlier_rmse_m=q[3],
                alternative_score=alternative,alternative_margin=margin,accepted=accepted)

def components(n,edges):
    adjacency={i:set() for i in range(n)}
    for e in edges:adjacency[e['i']].add(e['j']);adjacency[e['j']].add(e['i'])
    groups=[];remaining=set(range(n))
    while remaining:
        found=set();stack=[min(remaining)]
        while stack:
            item=stack.pop()
            if item in found:continue
            found.add(item);stack.extend(adjacency[item]-found)
        groups.append(sorted(found));remaining-=found
    return sorted(groups,key=lambda g:(-len(g),min(g)))

def initialise(nodes,edges):
    poses={min(nodes):np.zeros(3)};tree=[]
    while len(poses)<len(nodes):
        candidates=[e for e in edges if e['i'] in nodes and e['j'] in nodes and ((e['i'] in poses)!=(e['j'] in poses))]
        e=max(candidates,key=lambda e:e['score']+.2*min(e['alternative_margin'],.3))
        i,j=e['i'],e['j'];angle=e['theta'];t=np.asarray(e['translation'])
        if i in poses:
            p=poses[i];poses[j]=np.r_[rotate(t[None,:],p[2])[0]+p[:2],wrap(p[2]+angle)]
        else:
            p=poses[j];theta=wrap(p[2]-angle);poses[i]=np.r_[p[:2]-rotate(t[None,:],theta)[0],theta]
        tree.append([i,j])
    return poses,tree

def residual(poses,e):
    a,b=poses[e['i']],poses[e['j']]
    return np.r_[rotate((b[:2]-a[:2])[None,:],-a[2])[0]-np.asarray(e['translation']),2*wrap(b[2]-a[2]-e['theta'])]

def optimise(nodes,edges):
    poses,tree=initialise(nodes,edges)
    free=[i for i in nodes if i!=min(nodes)];columns={node:3*k for k,node in enumerate(free)}
    if not free:return poses,tree
    for _ in range(30):
        rows=[];targets=[]
        for e in edges:
            i,j=e['i'],e['j']
            if i not in poses or j not in poses:continue
            r=residual(poses,e);a,b=poses[i],poses[j];c,s=math.cos(a[2]),math.sin(a[2]);rot=np.array([[c,s],[-s,c]])
            predicted=rot@(b[:2]-a[:2]);jac=np.zeros((3,3*len(free)))
            if i in columns:
                k=columns[i];jac[:2,k:k+2]=-rot;jac[:2,k+2]=[predicted[1],-predicted[0]];jac[2,k+2]=-2
            if j in columns:
                k=columns[j];jac[:2,k:k+2]=rot;jac[2,k+2]=2
            weight=e['score']**2*min(1.,.20/max(np.linalg.norm(r),1e-12))
            rows.append(jac*math.sqrt(weight));targets.append(-r*math.sqrt(weight))
        matrix=np.vstack(rows);rhs=np.concatenate(targets)
        update=np.linalg.lstsq(np.vstack([matrix,np.eye(len(free)*3)*.01]),np.r_[rhs,np.zeros(len(free)*3)],rcond=None)[0]
        if np.linalg.norm(update)<1e-7:break
        for node,k in columns.items():poses[node]+=update[k:k+3];poses[node][2]=wrap(poses[node][2])
    return poses,tree

def main():
    DEST.mkdir(exist_ok=True);records,clouds=inventory();n=len(records)
    config_key=hashlib.sha256((json.dumps(records,sort_keys=True)+json.dumps(LIMITS,sort_keys=True)+Path(__file__).with_name('registration.py').read_text()).encode()).hexdigest()
    checkpoint=DEST/'paires_checkpoint.json';cached={}
    if checkpoint.exists():
        data=json.loads(checkpoint.read_text())
        if data.get('config_key')==config_key:cached={(e['i'],e['j']):e for e in data['edges']}
    tasks=[p for p in itertools.combinations(range(n),2) if p not in cached]
    print(f'{n} scans, {len(tasks)} paires à calculer, {len(cached)} en cache.',flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        pending={pool.submit(pair,i,j,clouds):(i,j) for i,j in tasks}
        for future in as_completed(pending):
            edge=future.result();cached[(edge['i'],edge['j'])]=edge
            if len(cached)%4==0 or len(cached)==n*(n-1)//2:
                checkpoint.write_text(json.dumps(dict(config_key=config_key,edges=list(cached.values())),indent=2))
                print(f'Paires {len(cached)}/{n*(n-1)//2} ; liens retenus : {sum(e["accepted"] for e in cached.values())}',flush=True)
    edges=sorted(cached.values(),key=lambda e:(e['i'],e['j']));trusted=[e for e in edges if e['accepted']]
    rejected=[]
    # Reject inconsistent loops rather than force unrelated views into one frame.
    for _ in range(3):
        allposes={}
        for group in components(n,trusted):
            poses,_=optimise(group,trusted);allposes.update(poses)
        bad=[]
        for e in trusted:
            r=residual(allposes,e)
            if np.linalg.norm(r[:2])>.30 or abs(r[2]/2)>math.radians(8):bad.append(e)
        if not bad:break
        for e in bad:e['rejected_loop']=True
        rejected.extend(bad);trusted=[e for e in trusted if e not in bad]
    groups=components(n,trusted);solutions=[]
    for index,group in enumerate(groups,1):
        poses,tree=optimise(group,trusted)
        entries=[]
        for node in group:
            p=poses[node];entries.append(dict(**records[node],pose=dict(x=float(p[0]),y=float(p[1]),theta=math.degrees(p[2]))))
        loops=[]
        for e in trusted:
            if e['i'] in group and e['j'] in group:
                r=residual(poses,e);loops.append(dict(i=e['i'],j=e['j'],translation_error_m=float(np.linalg.norm(r[:2])),rotation_error_deg=math.degrees(abs(r[2]/2))))
        solutions.append(dict(component=index,reference=records[min(group)]['name'],scans=entries,tree=tree,loop_residuals=loops))
    # Exploratory all-scan estimate retained separately, including weak links.
    exploratory,tree=initialise(list(range(n)),edges)
    tentative=[dict(**record,pose=dict(x=float(exploratory[i][0]),y=float(exploratory[i][1]),theta=math.degrees(exploratory[i][2]))) for i,record in enumerate(records)]
    result=dict(method='All-pairs coarse rotation/FFT translation, trimmed rigid ICP, ambiguity gating, robust pose-graph optimisation and loop rejection',
                inputs=records,limits=LIMITS,components=solutions,pairwise=edges,rejected_loops=[[e['i'],e['j']] for e in rejected],
                exploratory=dict(scans=tentative,tree=tree,warning='Weak/ambiguous links included. Do not treat this combined frame as validated.'),
                limitations='No measured sensor poses or room dimensions. Components remain separate where evidence is insufficient. Registration filters do not alter source measurements.')
    (DEST/'alignement.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print('Composantes :',[[s['label'] for s in group['scans']] for group in solutions],flush=True)
    print('Terminé :',DEST/'alignement.json',flush=True)

if __name__=='__main__':main()
