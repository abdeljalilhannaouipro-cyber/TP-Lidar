(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./vector-localisation.js'),require('./grid-localisation.js'),require('./segments.js'));else root.LidarVectorDirect=factory(root.LidarVectorLocalisation,root.LidarGridLocalisation,root.LidarSegments);})(globalThis,function(V,L,S){
 'use strict';
 const lineDelta=a=>((a+90)%180+180)%180-90;
 const angle=s=>Math.atan2(s.b[1]-s.a[1],s.b[0]-s.a[0])*180/Math.PI;
 const midpoint=s=>[(s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2];
 function transform(p,pose){const a=pose.theta*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return[pose.x+c*p[0]-s*p[1],pose.y+s*p[0]+c*p[1]];}
 function solvePairs(pairs,initial){
  if(!Array.isArray(pairs)||pairs.length<2)throw new Error('Au moins deux correspondances de segments requises.');
  let cx=0,cy=0,sum=0;
  for(const p of pairs){if(!Number.isFinite(p.weight)||p.weight<=0)throw new Error('Poids de correspondance invalide.');if(S.length(p.local)<=S.EPS||S.length(p.reference)<=S.EPS)throw new Error('Segment de correspondance dégénéré.');const delta=lineDelta(angle(p.reference)-angle(p.local)-initial.theta)*Math.PI/180;cx+=p.weight*Math.cos(2*delta);cy+=p.weight*Math.sin(2*delta);sum+=p.weight;}
  const concentration=Math.hypot(cx,cy)/sum;if(concentration<.5)throw new Error('Orientations ambiguës : pas de rotation directe exploitable.');
  const correction=.5*Math.atan2(cy,cx)*180/Math.PI,theta=L.wrap(initial.theta+correction),a=theta*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  let A=0,B=0,D=0,u=0,v=0;
  for(const p of pairs){
   const d=S.direction(p.reference),nx=-d[1],ny=d[0],m=midpoint(p.local),rx=c*m[0]-s*m[1],ry=s*m[0]+c*m[1],b=nx*(p.reference.a[0]-rx)+ny*(p.reference.a[1]-ry),w=p.weight/sum;
   A+=w*nx*nx;B+=w*nx*ny;D+=w*ny*ny;u+=w*nx*b;v+=w*ny*b;
  }
  const root=Math.hypot(A-D,2*B),high=(A+D+root)/2,low=(A+D-root)/2,conditionRatio=low/high,det=A*D-B*B;
  if(!Number.isFinite(conditionRatio)||conditionRatio<.001||det<=1e-12)throw new Error('Segments presque parallèles : translation non observable ou mal conditionnée.');
  const pose={x:(D*u-B*v)/det,y:(A*v-B*u)/det,theta};
  return{pose,correctionDeg:correction,orientationConcentration:concentration,conditionRatio,normalSystem:{A,B,D,u,v,det}};
 }
 function* search(map,scan,initial,input={}){
  const started=performance.now(),o=V.config(input);
  if(!initial||!['x','y','theta'].every(k=>Number.isFinite(initial[k])))throw new Error('Pose initiale invalide.');
  const center={x:initial.x,y:initial.y,theta:L.wrap(initial.theta)},geometry=V.geometry(map),points=L.prepare(scan,o);
  if(map.scans?.some(s=>s.checksum&&s.checksum===scan.checksum))throw new Error('Ce scan est déjà dans la carte vectorielle : utiliser une carte construite sans lui.');
  const locals=S.extract(points,{gap:.3,residual:.05,minPoints:5,minLength:.5});
  if(locals.length*map.features.length>1000000)throw new Error('Trop de comparaisons de segments pour le calcul direct.');
  const maxDistance=Math.SQRT2*o.windowXY+.1,maxAngle=Math.min(50,o.windowTheta+5),matches=[];
  for(const [index,local]of locals.entries()){
   const world={a:transform(local.a,center),b:transform(local.b,center)},m=midpoint(world);let best=null;
   for(const reference of map.features){
    const angular=S.angleDeg(world,reference.segment);if(angular>maxAngle)continue;
    const distance=S.pointDistance(m,reference.segment);if(distance>maxDistance)continue;
    const score=(distance/maxDistance)**2+(angular/maxAngle)**2;
    if(!best||score<best.score)best={local,reference:reference.segment,scanSegment:index,mapFeatureId:reference.id,weight:Math.min(S.length(local),S.length(reference.segment))**2,initialDistanceM:distance,initialAngleDeg:angular,correctionDeg:lineDelta(angle(reference.segment)-angle(world)),score};
   }
   if(best)matches.push(best);
  }
  if(matches.length<2)throw new Error('Pas assez de segments associés : corriger la pose initiale ou la carte.');
  // Deterministic orientation consensus, with fixed initial correspondences.
  let support=null;
  for(const candidate of matches){const cohort=matches.filter(m=>Math.abs(lineDelta(m.correctionDeg-candidate.correctionDeg))<=3),weight=cohort.reduce((s,m)=>s+m.weight,0);if(!support||weight>support.weight)support={cohort,weight};}
  yield{phase:'associations',matches:matches.length,retained:support.cohort.length};
  const solution=solvePairs(support.cohort,center),pose=solution.pose;
  if(Math.abs(pose.x-center.x)>o.windowXY+1e-9||Math.abs(pose.y-center.y)>o.windowXY+1e-9||Math.abs(L.wrap(pose.theta-center.theta))>o.windowTheta+1e-9)throw new Error('Estimation directe hors fenêtre : correspondances ou initialisation à vérifier.');
  const before=V.evaluate(geometry,points,center,o.capM),after=V.evaluate(geometry,points,pose,o.capM),warnings=[];
  if(solution.conditionRatio<.02)warnings.push('Directions peu diversifiées : translation sensible au bruit.');
  if(after.nearFraction<.5)warnings.push('Moins de 50 % des impacts sont à 20 cm des segments.');
  if(after.cost>before.cost+1e-12)warnings.push('Le coût point-carte augmente : correspondances à vérifier.');
  return{format:'tp-lidar-vector-localisation-v1',method:'direct-segment-orientation-and-translation',initial:center,...solution,before,after,tested:2,extractedSegments:locals.length,associatedSegments:matches.length,retainedPairs:support.cohort,discardedCorrespondences:matches.length-support.cohort.length,acceptedPoints:points.length,segments:map.features.length,elapsedMs:performance.now()-started,options:o,quality:warnings.length?'a_verifier':'criteres_satisfaits',warnings,caveat:'Associations faites une fois depuis la pose initiale ; rotation fermée et système 2×2 de translation. Pas de réassociation itérative ni de garantie globale.'};
 }
 function match(...args){const it=search(...args);let s;do{s=it.next();}while(!s.done);return s.value;}
 async function matchAsync(map,scan,initial,options={},progress=()=>{},cancelled=()=>false){const it=search(map,scan,initial,options);while(true){if(cancelled())throw new Error('Recherche annulée.');const s=it.next();if(s.done)return s.value;progress(s.value);await new Promise(resolve=>setTimeout(resolve,0));}}
 return{match,matchAsync,solvePairs,lineDelta};
});
