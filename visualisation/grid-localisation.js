(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LidarGridLocalisation=api;})(globalThis,function(){
 'use strict';
 const wrap=a=>((a+180)%360+360)%360-180;
 function pose(p){if(!p||!['x','y','theta'].every(k=>Number.isFinite(p[k])))throw new Error('Pose initiale invalide.');return{x:p.x,y:p.y,theta:wrap(p.theta)};}
 // Unobstructed 8-neighbour chamfer distance, in metres (not Euclidean-exact).
 function field(grid){
  const {nx,ny,resolution:r,cells}=grid;
  if(!Number.isInteger(nx)||!Number.isInteger(ny)||nx<1||ny<1||nx*ny>1000000||cells?.length!==nx*ny||!Number.isFinite(r)||r<=0||![grid.x,grid.y].every(Number.isFinite)||Array.from(cells).some(v=>![0,127,255].includes(v)))throw new Error('Grille invalide.');
  const distance=new Float32Array(nx*ny);distance.fill(Infinity);let occupied=0;
  for(let i=0;i<cells.length;i++)if(cells[i]===255){distance[i]=0;occupied++;}
  if(!occupied)throw new Error('La grille ne contient aucun obstacle.');
  const diag=r*Math.SQRT2;
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
   const i=y*nx+x;let d=distance[i];
   if(x)d=Math.min(d,distance[i-1]+r);
   if(y){d=Math.min(d,distance[i-nx]+r);if(x)d=Math.min(d,distance[i-nx-1]+diag);if(x+1<nx)d=Math.min(d,distance[i-nx+1]+diag);}
   distance[i]=d;
  }
  for(let y=ny-1;y>=0;y--)for(let x=nx-1;x>=0;x--){
   const i=y*nx+x;let d=distance[i];
   if(x+1<nx)d=Math.min(d,distance[i+1]+r);
   if(y+1<ny){d=Math.min(d,distance[i+nx]+r);if(x)d=Math.min(d,distance[i+nx-1]+diag);if(x+1<nx)d=Math.min(d,distance[i+nx+1]+diag);}
   distance[i]=d;
  }
  return{grid,distance,occupied};
 }
 function prepare(scan,options){
  if(!Array.isArray(scan.points)||scan.points.length>10000)throw new Error('Scan invalide (maximum 10000 points).');
  const points=[];
  scan.points.forEach((p,i)=>{
   if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw new Error('Point de scan invalide.');
   const r=Math.hypot(...p),q=scan.qualities?.[i];
   if(r>0&&r<=options.maxRange&&(options.minIntensity===0||(Number.isFinite(q)&&q>=options.minIntensity)))points.push(p);
  });
  if(points.length<12)throw new Error('Au moins 12 points valides sont nécessaires.');
  return points;
 }
 function config(input={}){
  const o={windowXY:1,windowTheta:15,maxRange:12,minIntensity:0,maxPoints:240,minCoverage:.6,minScore:.3,...input};
  if(!['windowXY','windowTheta','maxRange','minIntensity','maxPoints','minCoverage','minScore'].every(k=>Number.isFinite(o[k]))||o.windowXY<.1||o.windowXY>3||o.windowTheta<1||o.windowTheta>45||o.maxRange<=0||o.minIntensity<0||o.minIntensity>255||!Number.isInteger(o.maxPoints)||o.maxPoints<12||o.maxPoints>1000||o.minCoverage<0||o.minCoverage>1||o.minScore<0||o.minScore>1)throw new Error('Paramètres de recherche invalides (fenêtre : 0,1–3 m et 1–45°).');
  return o;
 }
 function likelihood(f,sigma){return Float32Array.from(f.distance,d=>Math.exp(-d*d/(2*sigma*sigma)));}
 function evaluate(f,points,p,sigma=.1,values=null){
  const {grid:g,distance}=f,{nx,ny,resolution:r}=g,a=p.theta*Math.PI/180,c=Math.cos(a),s=Math.sin(a),v=values||likelihood(f,sigma);
  let total=0,known=0,inside=0,square=0,near=0;
  for(const [px,py]of points){
   const X=p.x+c*px-s*py,Y=p.y+s*px+c*py,ix=Math.floor((X-g.x)/r),iy=Math.floor((Y-g.y)/r);
   if(ix<0||iy<0||ix>=nx||iy>=ny)continue;
   inside++;const index=iy*nx+ix;
   if(g.cells[index]===127)continue;
   known++;square+=distance[index]**2;if(distance[index]<=.2+1e-7)near++;
   // Cell-centred bilinear sampling. Unknown/outside corners contribute zero.
   const fx=(X-g.x)/r-.5,fy=(Y-g.y)/r-.5,x=Math.floor(fx),y=Math.floor(fy),dx=fx-x,dy=fy-y;
   for(let j=0;j<2;j++)for(let i=0;i<2;i++){
    if(x+i<0||y+j<0||x+i>=nx||y+j>=ny)continue;
    const k=(y+j)*nx+x+i;if(g.cells[k]!==127)total+=v[k]*(i?dx:1-dx)*(j?dy:1-dy);
   }
  }
  return{score:total/points.length,coverage:known/points.length,inside:inside/points.length,nearFraction:near/points.length,rmseM:known?Math.sqrt(square/known):null};
 }
 function separated(a,b){return Math.hypot(a.x-b.x,a.y-b.y)>=.25||Math.abs(wrap(a.theta-b.theta))>=4;}
 function select(candidates,count=6){
  candidates.sort((a,b)=>b.score-a.score||a.prior-b.prior);
  const out=[];for(const c of candidates)if(out.every(s=>separated(s,c))){out.push(c);if(out.length===count)break;}return out;
 }
 function* search(grid,scan,initial,input={}){
  const started=performance.now(),o=config(input),center=pose(initial);
  if(grid.scans?.some(s=>s.checksum&&s.checksum===scan.checksum))throw new Error('Ce scan est déjà dans la grille : utiliser une carte construite sans lui.');
  const all=prepare(scan,o),f=field(grid),points=all.length<=o.maxPoints?all:Array.from({length:o.maxPoints},(_,i)=>all[Math.floor(i*all.length/o.maxPoints)]);
  const inBounds=p=>Math.abs(p.x-center.x)<=o.windowXY+1e-8&&Math.abs(p.y-center.y)<=o.windowXY+1e-8&&Math.abs(wrap(p.theta-center.theta))<=o.windowTheta+1e-8&&p.x>=grid.x&&p.y>=grid.y&&p.x<grid.x+grid.nx*grid.resolution&&p.y<grid.y+grid.ny*grid.resolution;
  if(!inBounds(center))throw new Error('La pose initiale doit être dans la grille.');
  const stages=[{xy:.2,angle:3,rx:o.windowXY,ra:o.windowTheta,sigma:.30},{xy:.05,angle:.75,rx:.2,ra:3,sigma:.15},{xy:.025,angle:.25,rx:.05,ra:.75,sigma:.10}];
  let seeds=[center],tested=0,final=[],stagesReport=[];
  for(let level=0;level<stages.length;level++){
   const st=stages[level],v=likelihood(f,st.sigma),candidates=[],seen=new Set();
   const countX=Math.ceil(st.rx/st.xy),countA=Math.ceil(st.ra/st.angle);
   for(const seed of seeds)for(let it=-countA;it<=countA;it++)for(let iy=-countX;iy<=countX;iy++)for(let ix=-countX;ix<=countX;ix++){
    const p={x:seed.x+ix*st.xy,y:seed.y+iy*st.xy,theta:wrap(seed.theta+it*st.angle)};
    if(!inBounds(p))continue;
    const key=[p.x,p.y,p.theta].map(n=>n.toFixed(6)).join(',');if(seen.has(key))continue;seen.add(key);
    const e=evaluate(f,points,p,st.sigma,v),prior=(p.x-center.x)**2+(p.y-center.y)**2+(wrap(p.theta-center.theta)/30)**2;
    candidates.push({...p,...e,prior});tested++;
    if(tested%250===0)yield{level:level+1,tested};
   }
   if(!candidates.length)throw new Error('Aucune pose candidate.');
   seeds=select(candidates);stagesReport.push({level:level+1,translationStepM:st.xy,angleStepDeg:st.angle,sigmaM:st.sigma,candidates:candidates.length});final=candidates;
  }
  // Re-rank a bounded shortlist with every accepted scan point at the final scale.
  final.sort((a,b)=>b.score-a.score||a.prior-b.prior);
  const shortlist=[...new Set([...final.slice(0,60),...select(final,12)])],v=likelihood(f,.1);
  for(const candidate of shortlist)Object.assign(candidate,evaluate(f,all,candidate,.1,v));
  shortlist.sort((a,b)=>b.score-a.score||a.prior-b.prior);
  const best=shortlist[0],other=shortlist.find(p=>separated(best,p));
  const warnings=[];
  if(best.coverage<o.minCoverage)warnings.push('Couverture insuffisante de cellules connues.');
  if(best.score<o.minScore)warnings.push('Score de correspondance faible.');
  const boundary=Math.abs(best.x-center.x)>o.windowXY-.026||Math.abs(best.y-center.y)>o.windowXY-.026||Math.abs(wrap(best.theta-center.theta))>o.windowTheta-.26;
  if(boundary)warnings.push('Solution au bord de la fenêtre : agrandir ou corriger la pose initiale.');
  const gap=other?best.score-other.score:null;
  if(gap!==null&&gap<.015)warnings.push('Une autre solution testée possède un score voisin.');
  return{format:'tp-lidar-grid-localisation-v1',method:'coarse-to-fine-correlative-chamfer',initial:center,pose:pose(best),before:evaluate(f,all,center),after:evaluate(f,all,best),tested,stages:stagesReport,acceptedPoints:all.length,sampledPoints:points.length,elapsedMs:performance.now()-started,options:o,alternativeGap:gap,alternative:other?pose(other):null,quality:warnings.length?'a_verifier':'criteres_satisfaits',warnings,
   caveat:'Recherche locale heuristique. Score non probabiliste ; absence de concurrent dans la liste limitée ne prouve pas une solution unique.'};
 }
 function match(...args){const iterator=search(...args);let step;do{step=iterator.next();}while(!step.done);return step.value;}
 async function matchAsync(grid,scan,initial,options={},progress=()=>{},cancelled=()=>false){
  const iterator=search(grid,scan,initial,options);while(true){if(cancelled())throw new Error('Recherche annulée.');const step=iterator.next();if(step.done)return step.value;progress(step.value);await new Promise(resolve=>setTimeout(resolve,0));}
 }
 return{field,evaluate,match,matchAsync,wrap,config,prepare};
});
