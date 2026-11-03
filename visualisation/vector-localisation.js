(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./grid-localisation.js'));else root.LidarVectorLocalisation=factory(root.LidarGridLocalisation);})(globalThis,function(L){
 'use strict';
 const MAX_POSES=500000,MAX_WORK=400000000;
 function config(input={}){
  const o={...L.config(input),stepXY:.1,stepTheta:1,capM:.5,...input};
  if(![o.stepXY,o.stepTheta,o.capM].every(Number.isFinite)||o.stepXY<.01||o.stepXY>o.windowXY||o.stepTheta<.1||o.stepTheta>o.windowTheta||o.capM<.2||o.capM>5)throw new Error('Pas invalides ou distance de troncature hors [0,2 ; 5] m.');
  return o;
 }
 function geometry(map){
  if(!map||!Array.isArray(map.features)||!map.features.length||map.features.length>3000)throw new Error('Carte vectorielle vide ou invalide.');
  return map.features.map(f=>{
   const a=f.segment?.a,b=f.segment?.b;
   if(!Array.isArray(a)||!Array.isArray(b)||a.length!==2||b.length!==2||![...a,...b].every(Number.isFinite))throw new Error('Extrémités de segment invalides.');
   const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
   if(length2<=1e-18||!Number.isFinite(length2))throw new Error('Segment dégénéré.');
   return{ax:a[0],ay:a[1],dx,dy,inv:1/length2,xmin:Math.min(a[0],b[0]),xmax:Math.max(a[0],b[0]),ymin:Math.min(a[1],b[1]),ymax:Math.max(a[1],b[1])};
  });
 }
 function distance2(x,y,segments){
  let best=Infinity;
  for(const s of segments){
   // Exact lower bound; this skips segment projections, never candidate poses.
   const ex=Math.max(s.xmin-x,0,x-s.xmax),ey=Math.max(s.ymin-y,0,y-s.ymax);
   if(ex*ex+ey*ey>=best)continue;
   const px=x-s.ax,py=y-s.ay,t=Math.max(0,Math.min(1,(px*s.dx+py*s.dy)*s.inv));
   const dx=px-t*s.dx,dy=py-t*s.dy;best=Math.min(best,dx*dx+dy*dy);
  }
  return best;
 }
 function evaluate(segments,points,p,capM=.5){
  const a=p.theta*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cap2=capM*capM;let cost=0,square=0,near=0;
  for(const[px,py]of points){const d2=distance2(p.x+c*px-s*py,p.y+s*px+c*py,segments);cost+=Math.min(d2,cap2);square+=d2;if(d2<=.04+1e-12)near++;}
  return{cost:cost/points.length,score:1-cost/(points.length*cap2),rmseM:Math.sqrt(square/points.length),nearFraction:near/points.length};
 }
 function* search(map,scan,initial,input={}){
  const started=performance.now(),o=config(input);
  if(!initial||!['x','y','theta'].every(k=>Number.isFinite(initial[k])))throw new Error('Pose initiale invalide.');
  const center={x:initial.x,y:initial.y,theta:L.wrap(initial.theta)},segments=geometry(map);
  if(map.scans?.some(s=>s.checksum&&s.checksum===scan.checksum))throw new Error('Ce scan est déjà dans la carte vectorielle : utiliser une carte construite sans lui.');
  const points=L.prepare(scan,o),kxy=Math.floor(o.windowXY/o.stepXY+1e-9),ka=Math.floor(o.windowTheta/o.stepTheta+1e-9),nx=2*kxy+1,nt=2*ka+1,total=nx*nx*nt;
  if(total>MAX_POSES||total*points.length*segments.length>MAX_WORK)throw new Error(`Recherche trop coûteuse : ${total} poses × ${points.length} points × ${segments.length} segments. Réduire la fenêtre ou augmenter les pas ; aucun sous-échantillonnage automatique.`);
  const scores=new Float64Array(total);let best=null,tested=0;
  for(let it=-ka;it<=ka;it++)for(let iy=-kxy;iy<=kxy;iy++)for(let ix=-kxy;ix<=kxy;ix++){
   const p={x:center.x+ix*o.stepXY,y:center.y+iy*o.stepXY,theta:L.wrap(center.theta+it*o.stepTheta)},e=evaluate(segments,points,p,o.capM),prior=(ix*o.stepXY)**2+(iy*o.stepXY)**2+(it*o.stepTheta/30)**2;
   scores[tested++]=e.score;
   if(!best||e.cost<best.cost||(e.cost===best.cost&&prior<best.prior))best={...p,...e,prior,ix,iy,it};
   if(tested%50===0)yield{tested,total};
  }
  let other=null,index=0;
  for(let it=-ka;it<=ka;it++)for(let iy=-kxy;iy<=kxy;iy++)for(let ix=-kxy;ix<=kxy;ix++){
   const score=scores[index++],x=center.x+ix*o.stepXY,y=center.y+iy*o.stepXY,theta=L.wrap(center.theta+it*o.stepTheta);
   if((Math.hypot(x-best.x,y-best.y)>=.25||Math.abs(L.wrap(theta-best.theta))>=4)&&(!other||score>other.score))other={x,y,theta,score};
  }
  const warnings=[],gap=other?best.score-other.score:null;
  if(best.nearFraction<.5)warnings.push('Moins de 50 % des impacts sont à 20 cm des segments : recouvrement ou qualité insuffisant.');
  if(Math.abs(best.ix)===kxy||Math.abs(best.iy)===kxy||Math.abs(best.it)===ka)warnings.push('Solution au bord du domaine : élargir ou corriger la fenêtre.');
  if(gap!==null&&gap<.015)warnings.push('Une autre pose du domaine possède un score voisin.');
  return{format:'tp-lidar-vector-localisation-v1',method:'exhaustive-point-to-finite-segments',complete:true,initial:center,pose:{x:best.x,y:best.y,theta:best.theta},before:evaluate(segments,points,center,o.capM),after:evaluate(segments,points,best,o.capM),tested,totalCandidates:total,axisCounts:{x:nx,y:nx,theta:nt},acceptedPoints:points.length,segments:segments.length,elapsedMs:performance.now()-started,options:o,alternative:other?{x:other.x,y:other.y,theta:other.theta}:null,alternativeGap:gap,quality:warnings.length?'a_verifier':'criteres_satisfaits',warnings,caveat:'Minimum du coût tronqué sur le domaine discret, pas une preuve de pose physique exacte. La carte vectorielle ne décrit pas les espaces libres/inconnus.'};
 }
 function match(...args){const it=search(...args);let s;do{s=it.next();}while(!s.done);return s.value;}
 async function matchAsync(map,scan,initial,options={},progress=()=>{},cancelled=()=>false){const it=search(map,scan,initial,options);while(true){if(cancelled())throw new Error('Recherche annulée.');const s=it.next();if(s.done)return s.value;progress(s.value);await new Promise(resolve=>setTimeout(resolve,0));}}
 return{match,matchAsync,geometry,distance2,evaluate,config,MAX_POSES,MAX_WORK};
});
