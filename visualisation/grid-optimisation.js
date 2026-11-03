(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./grid-localisation.js'));else root.LidarGridOptimisation=factory(root.LidarGridLocalisation);})(globalThis,function(L){
 'use strict';
 const LEVER=2;
 function config(input={}){
  const o={...L.config(input),method:'gradient',maxIterations:100,chains:8,annealIterations:400,seed:20261103,...input};
  if(!['gradient','pyramid','annealing'].includes(o.method)||!Number.isInteger(o.maxIterations)||o.maxIterations<1||o.maxIterations>300||!Number.isInteger(o.chains)||o.chains<1||o.chains>16||!Number.isInteger(o.annealIterations)||o.annealIterations<10||o.annealIterations>2000||!Number.isInteger(o.seed)||o.seed<0||o.seed>4294967295)throw new Error('Méthode, budget ou graine invalide.');
  return o;
 }
 function setup(grid,scan,initial,input){
  const o=config(input);
  if(!initial||!['x','y','theta'].every(k=>Number.isFinite(initial[k])))throw new Error('Pose initiale invalide.');
  const center={x:initial.x,y:initial.y,theta:L.wrap(initial.theta)},f=L.field(grid);
  if(center.x<grid.x||center.y<grid.y||center.x>=grid.x+grid.nx*grid.resolution||center.y>=grid.y+grid.ny*grid.resolution)throw new Error('Pose initiale hors grille.');
  if(grid.scans?.some(s=>s.checksum&&s.checksum===scan.checksum))throw new Error('Ce scan est déjà dans la grille : utiliser une carte construite sans lui.');
  const points=L.prepare(scan,o),epsilon=1e-8;
  const bounds=[
   [Math.max(-o.windowXY,grid.x-center.x),Math.min(o.windowXY,grid.x+grid.nx*grid.resolution-center.x-epsilon)],
   [Math.max(-o.windowXY,grid.y-center.y),Math.min(o.windowXY,grid.y+grid.ny*grid.resolution-center.y-epsilon)],
   [-o.windowTheta*Math.PI/180*LEVER,o.windowTheta*Math.PI/180*LEVER]
  ];
  const toPose=q=>({x:center.x+q[0],y:center.y+q[1],theta:L.wrap(center.theta+q[2]/LEVER*180/Math.PI)});
  return{o,center,f,points,bounds,toPose,project:q=>q.map((v,i)=>Math.max(bounds[i][0],Math.min(bounds[i][1],v)))};
 }
 // Continuous bilinear interpolation of a capped squared-distance field.
 // Unknown and outside cells have cost 1 m²; all accepted points stay in the denominator.
 function costField(f){return Float32Array.from(f.distance,(d,i)=>f.grid.cells[i]===127?1:Math.min(d,1)**2);}
 function energy(f,points,p,values=costField(f)){
  const g=f.grid,r=g.resolution,a=p.theta*Math.PI/180,c=Math.cos(a),s=Math.sin(a);let sum=0;
  for(const[px,py]of points){
   const X=(p.x+c*px-s*py-g.x)/r-.5,Y=(p.y+s*px+c*py-g.y)/r-.5,x=Math.floor(X),y=Math.floor(Y),dx=X-x,dy=Y-y;
   for(let j=0;j<2;j++)for(let i=0;i<2;i++){
    const xx=x+i,yy=y+j,v=xx<0||yy<0||xx>=g.nx||yy>=g.ny?1:values[yy*g.nx+xx];sum+=v*(i?dx:1-dx)*(j?dy:1-dy);
   }
  }
  return sum/points.length;
 }
 function pyramid(grid){
  return [4,2,1].map(factor=>{
   if(factor===1)return grid;
   const nx=Math.ceil(grid.nx/factor),ny=Math.ceil(grid.ny/factor),cells=new Uint8Array(nx*ny);cells.fill(127);
   for(let y=0;y<grid.ny;y++)for(let x=0;x<grid.nx;x++){
    const value=grid.cells[y*grid.nx+x],i=Math.floor(y/factor)*nx+Math.floor(x/factor);
    if(value===255)cells[i]=255;else if(value===0&&cells[i]!==255)cells[i]=0;
   }
   return{x:grid.x,y:grid.y,nx,ny,resolution:grid.resolution*factor,cells,scans:grid.scans};
  });
 }
 function* gradient(s){
  const values=costField(s.f),trace=[];let tested=0;
  const cost=q=>{tested++;return energy(s.f,s.points,s.toPose(q),values);};
  let q=[0,0,0],E=cost(q),reason='iteration_limit',iterations=0;
  trace.push({iteration:0,energy:E,pose:s.toPose(q)});
  for(let iteration=1;iteration<=s.o.maxIterations;iteration++){
   iterations=iteration;
   const h=[.01,.01,.005],g=h.map((step,i)=>{const a=[...q],b=[...q];a[i]+=step;b[i]-=step;return(cost(a)-cost(b))/(2*step);});
   const norm=Math.hypot(...g);
   if(norm<1e-6){reason='small_gradient';break;}
   let accepted=false,alpha=.25,next,Enew;
   for(let line=0;line<14;line++){
    next=s.project(q.map((v,i)=>v-alpha*g[i]/norm));Enew=cost(next);
    const directional=g.reduce((v,gi,i)=>v+gi*(next[i]-q[i]),0);
    if(directional<0&&Enew<=E+1e-4*directional){accepted=true;break;}alpha*=.5;
   }
   if(!accepted){reason='line_search_stalled';break;}
   const movement=Math.hypot(...next.map((v,i)=>v-q[i])),gain=E-Enew;q=next;E=Enew;
   trace.push({iteration,energy:E,pose:s.toPose(q)});
   yield{method:'gradient',iteration,tested,energy:E};
   if(movement<.0005&&gain<1e-7){reason='small_update';break;}
  }
  return{pose:s.toPose(q),tested,iterations,stopReason:reason,objective:E,trace};
 }
 function* annealing(s){
  let random=s.o.seed>>>0;
  const uniform=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return(random+.5)/4294967296;};
  const normal=()=>Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform());
  const values=costField(s.f),trace=[],cost=q=>{tested++;return energy(s.f,s.points,s.toPose(q),values);};
  let tested=0,best=[0,0,0],bestE=cost(best),accepted=0,attempted=0,uphill=0;
  for(let chain=0;chain<s.o.chains;chain++){
   let q=chain===0?[0,0,0]:s.bounds.map(([lo,hi])=>lo+uniform()*(hi-lo)),E=cost(q);
   if(E<bestE){best=[...q];bestE=E;}
   for(let iteration=0;iteration<s.o.annealIterations;iteration++){
    attempted++;const t=iteration/(s.o.annealIterations-1),temperature=.08*(.0002/.08)**t,xy=.25*(.012/.25)**t,angle=4*(.15/4)**t*Math.PI/180*LEVER;
    const next=q.map((v,i)=>v+normal()*(i===2?angle:xy));
    if(next.every((v,i)=>v>=s.bounds[i][0]&&v<=s.bounds[i][1])){
     const Enew=cost(next);
     if(Enew<=E||uniform()<Math.exp((E-Enew)/temperature)){if(Enew>E)uphill++;q=next;E=Enew;accepted++;}
     if(E<bestE){best=[...q];bestE=E;}
    }
    if(iteration%40===0){trace.push({chain:chain+1,iteration,energy:bestE,temperature,pose:s.toPose(best)});yield{method:'annealing',chain:chain+1,chains:s.o.chains,iteration,tested};}
   }
  }
  return{pose:s.toPose(best),tested,iterations:attempted,stopReason:'annealing_budget_complete',objective:bestE,trace,seed:s.o.seed,acceptedMoves:accepted,uphillMoves:uphill,attemptedMoves:attempted};
 }
 function* multiresolution(s){
  const maps=pyramid(s.f.grid),stages=[{xy:.4,angle:4,rx:s.o.windowXY,ra:s.o.windowTheta},{xy:.1,angle:1,rx:.4,ra:4},{xy:.025,angle:.25,rx:.1,ra:1}];
  let seeds=[{...s.center}],tested=0,best=null;const levels=[];
  for(let level=0;level<maps.length;level++){
   const map=maps[level],f=L.field(map),sigma=Math.max(.1,map.resolution),values=Float32Array.from(f.distance,d=>Math.exp(-d*d/(2*sigma*sigma))),st=stages[level],candidates=[],seen=new Set();
   for(const seed of seeds)for(let it=-Math.ceil(st.ra/st.angle);it<=Math.ceil(st.ra/st.angle);it++)for(let iy=-Math.ceil(st.rx/st.xy);iy<=Math.ceil(st.rx/st.xy);iy++)for(let ix=-Math.ceil(st.rx/st.xy);ix<=Math.ceil(st.rx/st.xy);ix++){
    const p={x:seed.x+ix*st.xy,y:seed.y+iy*st.xy,theta:L.wrap(seed.theta+it*st.angle)},q=[p.x-s.center.x,p.y-s.center.y,L.wrap(p.theta-s.center.theta)*Math.PI/180*LEVER];
    if(!q.every((v,i)=>v>=s.bounds[i][0]-1e-9&&v<=s.bounds[i][1]+1e-9))continue;
    const key=[p.x,p.y,p.theta].map(v=>v.toFixed(6)).join(',');if(seen.has(key))continue;seen.add(key);
    const e=L.evaluate(f,s.points,p,sigma,values),prior=q.reduce((v,x)=>v+x*x,0);candidates.push({...p,...e,prior});tested++;
    if(tested%250===0)yield{method:'pyramid',level:level+1,tested};
   }
   if(!candidates.length)throw new Error('Aucune pose dans le domaine multi-résolution.');
   candidates.sort((a,b)=>b.score-a.score||a.prior-b.prior);best=candidates[0];seeds=[];
   for(const c of candidates)if(seeds.every(p=>Math.hypot(c.x-p.x,c.y-p.y)>=.2||Math.abs(L.wrap(c.theta-p.theta))>=3)){seeds.push(c);if(seeds.length===4)break;}
   levels.push({level:level+1,resolution:map.resolution,nx:map.nx,ny:map.ny,candidates:candidates.length,score:best.score,pose:{x:best.x,y:best.y,theta:best.theta}});
   yield{method:'pyramid',level:level+1,tested};
  }
  return{pose:{x:best.x,y:best.y,theta:best.theta},tested,iterations:3,stopReason:'pyramid_complete',levels,trace:levels};
 }
 function* search(grid,scan,initial,input={}){
  const started=performance.now(),s=setup(grid,scan,initial,input);
  const r=yield*(s.o.method==='gradient'?gradient(s):s.o.method==='annealing'?annealing(s):multiresolution(s));
  const before=L.evaluate(s.f,s.points,s.center),after=L.evaluate(s.f,s.points,r.pose),warnings=[];
  if(after.coverage<s.o.minCoverage)warnings.push('Couverture insuffisante de cellules connues.');
  if(after.score<s.o.minScore)warnings.push('Score de correspondance faible.');
  const q=[r.pose.x-s.center.x,r.pose.y-s.center.y,L.wrap(r.pose.theta-s.center.theta)*Math.PI/180*LEVER];
  if(q.some((v,i)=>Math.min(Math.abs(v-s.bounds[i][0]),Math.abs(v-s.bounds[i][1]))<.01))warnings.push('Pose au bord de la fenêtre.');
  if(r.stopReason==='iteration_limit')warnings.push('Limite d’itérations atteinte.');
  if(r.stopReason==='line_search_stalled')warnings.push('Pas de descente accepté : minimum local ou objectif non lisse possible.');
  return{format:'tp-lidar-grid-localisation-v1',...r,method:s.o.method,initial:s.center,before,after,acceptedPoints:s.points.length,sampledPoints:s.points.length,elapsedMs:performance.now()-started,options:s.o,quality:warnings.length?'a_verifier':'criteres_satisfaits',warnings,caveat:'Méthode bornée à la fenêtre initiale. Score non probabiliste ; le recuit est une optimisation stochastique, pas un posterior de pose calibré.'};
 }
 function match(...args){const it=search(...args);let step;do{step=it.next();}while(!step.done);return step.value;}
 async function matchAsync(grid,scan,initial,options={},progress=()=>{},cancelled=()=>false){const it=search(grid,scan,initial,options);while(true){if(cancelled())throw new Error('Recherche annulée.');const step=it.next();if(step.done)return step.value;progress(step.value);await new Promise(resolve=>setTimeout(resolve,0));}}
 return{match,matchAsync,config,pyramid,energy,costField};
});
