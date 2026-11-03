(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./vector-localisation.js'),require('./grid-localisation.js'));else root.LidarVectorMultiresolution=factory(root.LidarVectorLocalisation,root.LidarGridLocalisation);})(globalThis,function(V,L){
 'use strict';
 // Deterministic local-frame voxel centroids. Size zero preserves every point.
 function voxel(points,size){
  if(!Number.isFinite(size)||size<0)throw new Error('Taille de voxel invalide.');
  if(!size)return points;
  const bins=new Map();
  for(const[x,y]of points){const key=`${Math.floor(x/size)},${Math.floor(y/size)}`;let b=bins.get(key);if(!b){b={x:0,y:0,n:0};bins.set(key,b);}b.x+=x;b.y+=y;b.n++;}
  return[...bins.values()].map(b=>[b.x/b.n,b.y/b.n]);
 }
 function* search(map,scan,initial,input={}){
  const started=performance.now(),o=V.config(input);
  if(!initial||!['x','y','theta'].every(k=>Number.isFinite(initial[k])))throw new Error('Pose initiale invalide.');
  const center={x:initial.x,y:initial.y,theta:L.wrap(initial.theta)},segments=V.geometry(map),points=L.prepare(scan,o);
  if(map.scans?.some(s=>s.checksum&&s.checksum===scan.checksum))throw new Error('Ce scan est déjà dans la carte vectorielle : utiliser une carte construite sans lui.');
  const stages=[{voxel:.4,stepXY:.4,stepTheta:4,rx:o.windowXY,ra:o.windowTheta},{voxel:.2,stepXY:.1,stepTheta:1,rx:.4,ra:4},{voxel:0,stepXY:.025,stepTheta:.25,rx:.1,ra:1}];
  const clouds=stages.map(s=>voxel(points,s.voxel));
  const upperCounts=stages.map((s,i)=>(i?4:1)*(2*Math.ceil(s.rx/s.stepXY)+1)**2*(2*Math.ceil(s.ra/s.stepTheta)+1));
  upperCounts[2]++; // Native-level check of the initial pose, if not already visited.
  if(upperCounts.reduce((v,n,i)=>v+n*clouds[i].length*segments.length,0)>V.MAX_WORK)throw new Error('Budget multi-résolution trop grand : réduire les données ou la fenêtre.');
  const inBounds=p=>Math.abs(p.x-center.x)<=o.windowXY+1e-9&&Math.abs(p.y-center.y)<=o.windowXY+1e-9&&Math.abs(L.wrap(p.theta-center.theta))<=o.windowTheta+1e-9;
  let seeds=[center],tested=0,best=null;const levels=[];
  for(let level=0;level<stages.length;level++){
   const stage=stages[level],cloud=clouds[level],candidates=[],seen=new Set();
   const evaluate=p=>{
    if(!inBounds(p))return;
    const key=[p.x,p.y,p.theta].map(x=>x.toFixed(7)).join(',');if(seen.has(key))return;seen.add(key);
    const e=V.evaluate(segments,cloud,p,o.capM),prior=(p.x-center.x)**2+(p.y-center.y)**2+(L.wrap(p.theta-center.theta)/30)**2;
    candidates.push({...p,...e,prior});tested++;
   };
   for(const seed of seeds)for(let it=-Math.ceil(stage.ra/stage.stepTheta);it<=Math.ceil(stage.ra/stage.stepTheta);it++)for(let iy=-Math.ceil(stage.rx/stage.stepXY);iy<=Math.ceil(stage.rx/stage.stepXY);iy++)for(let ix=-Math.ceil(stage.rx/stage.stepXY);ix<=Math.ceil(stage.rx/stage.stepXY);ix++){
    const before=tested;evaluate({x:seed.x+ix*stage.stepXY,y:seed.y+iy*stage.stepXY,theta:L.wrap(seed.theta+it*stage.stepTheta)});
    if(tested!==before&&tested%50===0)yield{level:level+1,tested,points:cloud.length};
   }
   // Include the initial pose at the native level to avoid a worse final cost.
   if(level===2)evaluate(center);
   if(!candidates.length)throw new Error('Aucune pose multi-résolution admissible.');
   candidates.sort((a,b)=>a.cost-b.cost||a.prior-b.prior);best=candidates[0];seeds=[];
   for(const c of candidates)if(seeds.every(p=>Math.hypot(c.x-p.x,c.y-p.y)>=.2||Math.abs(L.wrap(c.theta-p.theta))>=3)){seeds.push(c);if(seeds.length===4)break;}
   levels.push({level:level+1,voxelSizeM:stage.voxel,points:cloud.length,translationStepM:stage.stepXY,angleStepDeg:stage.stepTheta,candidates:candidates.length,cost:best.cost,pose:{x:best.x,y:best.y,theta:best.theta}});
   yield{level:level+1,tested,points:cloud.length};
  }
  const pose={x:best.x,y:best.y,theta:best.theta},before=V.evaluate(segments,points,center,o.capM),after=V.evaluate(segments,points,pose,o.capM),warnings=[];
  if(after.nearFraction<.5)warnings.push('Moins de 50 % des impacts sont à 20 cm des segments.');
  if(Math.abs(pose.x-center.x)>o.windowXY-.026||Math.abs(pose.y-center.y)>o.windowXY-.026||Math.abs(L.wrap(pose.theta-center.theta))>o.windowTheta-.26)warnings.push('Pose au bord de la fenêtre.');
  if(after.cost>=before.cost-1e-12)warnings.push('Aucune amélioration du coût sur le scan complet.');
  return{format:'tp-lidar-vector-localisation-v1',method:'multiresolution-point-to-finite-segments',initial:center,pose,before,after,tested,levels,acceptedPoints:points.length,segments:segments.length,elapsedMs:performance.now()-started,options:o,quality:warnings.length?'a_verifier':'criteres_satisfaits',warnings,caveat:'Scans sous-échantillonnés puis pose affinée, carte vectorielle inchangée. Élagage heuristique : pas de garantie du minimum global.'};
 }
 function match(...args){const it=search(...args);let s;do{s=it.next();}while(!s.done);return s.value;}
 async function matchAsync(map,scan,initial,options={},progress=()=>{},cancelled=()=>false){const it=search(map,scan,initial,options);while(true){if(cancelled())throw new Error('Recherche annulée.');const s=it.next();if(s.done)return s.value;progress(s.value);await new Promise(resolve=>setTimeout(resolve,0));}}
 return{voxel,match,matchAsync};
});
