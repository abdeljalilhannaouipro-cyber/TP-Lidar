(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./grid-localisation.js'));else root.LidarGridBruteForce=factory(root.LidarGridLocalisation);})(globalThis,function(L){
 'use strict';
 const LIMIT=500000;
 function config(input={}){
  const o={...L.config(input),stepXY:.1,stepTheta:1,sigma:.1,...input};
  if(![o.stepXY,o.stepTheta,o.sigma].every(Number.isFinite)||o.stepXY<.01||o.stepXY>o.windowXY||o.stepTheta<.1||o.stepTheta>o.windowTheta||o.sigma<=0||o.sigma>1)throw new Error('Pas exhaustifs invalides : XY ≥ 0,01 m et ≤ fenêtre ; angle ≥ 0,1° et ≤ fenêtre ; sigma dans ]0,1].');
  return o;
 }
 function lattice(grid,initial,o){
  if(!initial||!['x','y','theta'].every(k=>Number.isFinite(initial[k])))throw new Error('Pose initiale invalide.');
  const center={x:initial.x,y:initial.y,theta:L.wrap(initial.theta)};
  if(!grid||![grid.x,grid.y,grid.nx,grid.ny,grid.resolution].every(Number.isFinite)||center.x<grid.x||center.y<grid.y||center.x>=grid.x+grid.nx*grid.resolution||center.y>=grid.y+grid.ny*grid.resolution)throw new Error('La pose initiale doit être dans une grille valide.');
  const kxy=Math.floor(o.windowXY/o.stepXY+1e-9),ka=Math.floor(o.windowTheta/o.stepTheta+1e-9),axes={x:[],y:[],theta:[]};
  for(let k=-kxy;k<=kxy;k++){
   const x=center.x+k*o.stepXY,y=center.y+k*o.stepXY;
   if(x>=grid.x&&x<grid.x+grid.nx*grid.resolution)axes.x.push(x);
   if(y>=grid.y&&y<grid.y+grid.ny*grid.resolution)axes.y.push(y);
  }
  for(let k=-ka;k<=ka;k++)axes.theta.push(L.wrap(center.theta+k*o.stepTheta));
  const candidates=axes.x.length*axes.y.length*axes.theta.length;
  if(candidates>LIMIT)throw new Error(`${candidates} poses demandées (limite ${LIMIT}). Augmenter les pas ou réduire la fenêtre ; aucun échantillonnage automatique.`);
  return{center,axes,candidates};
 }
 function* search(grid,scan,initial,input={}){
  const started=performance.now(),o=config(input),{center,axes,candidates}=lattice(grid,initial,o);
  if(grid.scans?.some(s=>s.checksum&&s.checksum===scan.checksum))throw new Error('Ce scan est déjà dans la grille : utiliser une carte construite sans lui.');
  const points=L.prepare(scan,o),f=L.field(grid),values=Float32Array.from(f.distance,d=>Math.exp(-d*d/(2*o.sigma*o.sigma)));
  const scores=new Float64Array(candidates);let best=null,tested=0;
  // All poses, all accepted points, identical score at a fixed scale. No pruning.
  for(const theta of axes.theta)for(const y of axes.y)for(const x of axes.x){
   const p={x,y,theta},e=L.evaluate(f,points,p,o.sigma,values);
   const prior=(x-center.x)**2+(y-center.y)**2+(L.wrap(theta-center.theta)/30)**2;
   scores[tested]=e.score;tested++;
   if(!best||e.score>best.score||(e.score===best.score&&prior<best.prior))best={...p,...e,prior};
   if(tested%250===0)yield{level:1,levels:1,tested,total:candidates};
  }
  let other=null,index=0;
  for(const theta of axes.theta)for(const y of axes.y)for(const x of axes.x){
   const score=scores[index++];
   if((Math.hypot(x-best.x,y-best.y)>=.25||Math.abs(L.wrap(theta-best.theta))>=4)&&(!other||score>other.score))other={x,y,theta,score};
  }
  const warnings=[],gap=other?best.score-other.score:null;
  if(best.coverage<o.minCoverage)warnings.push('Couverture insuffisante de cellules connues.');
  if(best.score<o.minScore)warnings.push('Score de correspondance faible.');
  if(best.x===axes.x[0]||best.x===axes.x.at(-1)||best.y===axes.y[0]||best.y===axes.y.at(-1)||best.theta===axes.theta[0]||best.theta===axes.theta.at(-1))warnings.push('Solution au bord du domaine discret : agrandir ou corriger la fenêtre.');
  if(gap!==null&&gap<.015)warnings.push('Une autre pose du domaine possède un score voisin.');
  return{format:'tp-lidar-grid-localisation-v1',method:'exhaustive-correlative-chamfer',complete:true,initial:center,pose:{x:best.x,y:best.y,theta:best.theta},before:L.evaluate(f,points,center,o.sigma,values),after:L.evaluate(f,points,best,o.sigma,values),tested,totalCandidates:candidates,axisCounts:{x:axes.x.length,y:axes.y.length,theta:axes.theta.length},stages:[{level:1,translationStepM:o.stepXY,angleStepDeg:o.stepTheta,sigmaM:o.sigma,candidates:tested}],acceptedPoints:points.length,sampledPoints:points.length,elapsedMs:performance.now()-started,options:o,alternativeGap:gap,alternative:other?{x:other.x,y:other.y,theta:other.theta}:null,quality:warnings.length?'a_verifier':'criteres_satisfaits',warnings,caveat:'Maximum du score sur le domaine discret déclaré, pas une garantie sur la pose continue, hors fenêtre ou sur la précision physique.'};
 }
 function match(...args){const iterator=search(...args);let step;do{step=iterator.next();}while(!step.done);return step.value;}
 async function matchAsync(grid,scan,initial,options={},progress=()=>{},cancelled=()=>false){
  const iterator=search(grid,scan,initial,options);while(true){if(cancelled())throw new Error('Recherche annulée.');const step=iterator.next();if(step.done)return step.value;progress(step.value);await new Promise(resolve=>setTimeout(resolve,0));}
 }
 return{match,matchAsync,config,lattice,LIMIT};
});
