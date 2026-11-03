(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'),require('./grid-localisation.js'));else root.LidarScanMatching=factory(root.LidarCore,root.LidarGridLocalisation);})(globalThis,function(C,L){
 'use strict';
 const METHODS=['exhaustive','gradient','multiresolution','annealing','direct'],LEVER=2,WORK=12000000;
 function compose(a,b){const p=C.transform([b.x,b.y],a);return{x:p[0],y:p[1],theta:L.wrap(a.theta+b.theta)};}
 function relative(reference,query){const a=reference.theta*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=query.x-reference.x,y=query.y-reference.y;return{x:c*x+s*y,y:-s*x+c*y,theta:L.wrap(query.theta-reference.theta)};}
 function voxel(points,size){if(!size)return points;const bins=new Map();for(const[x,y]of points){const key=`${Math.floor(x/size)},${Math.floor(y/size)}`;let b=bins.get(key);if(!b){b=[0,0,0];bins.set(key,b);}b[0]+=x;b[1]+=y;b[2]++;}return[...bins.values()].map(b=>[b[0]/b[2],b[1]/b[2]]);}
 function tree(points,depth=0){if(!points.length)return null;const axis=depth%2,sorted=points.slice().sort((a,b)=>a[axis]-b[axis]),i=Math.floor(sorted.length/2);return{x:sorted[i][0],y:sorted[i][1],axis,left:tree(sorted.slice(0,i),depth+1),right:tree(sorted.slice(i+1),depth+1)};}
 function nearest(node,x,y,best={d2:Infinity,x:0,y:0}){
  if(!node)return best;const dx=x-node.x,dy=y-node.y,d2=dx*dx+dy*dy;if(d2<best.d2){best.d2=d2;best.x=node.x;best.y=node.y;}
  const delta=node.axis===0?dx:dy,near=delta<0?node.left:node.right,far=delta<0?node.right:node.left;nearest(near,x,y,best);if(delta*delta<best.d2)nearest(far,x,y,best);return best;
 }
 function evaluate(index,points,p,cap=.5,withGradient=false,fullDistance=false){
  const a=p.theta*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cap2=cap*cap;let E=0,near=0,square=0,gx=0,gy=0,gz=0,active=0;
  for(const[px,py]of points){
   const rx=c*px-s*py,ry=s*px+c*py,x=p.x+rx,y=p.y+ry,n=nearest(index,x,y,{d2:fullDistance?Infinity:cap2,x:0,y:0});
   E+=Math.min(n.d2,cap2);square+=n.d2;if(n.d2<=.04+1e-12)near++;
   if(withGradient&&n.d2<cap2){const dx=x-n.x,dy=y-n.y;gx+=2*dx;gy+=2*dy;gz+=2*(-dx*ry+dy*rx)/LEVER;active++;}
  }
  const N=points.length;return{cost:E/N,score:1-E/(N*cap2),nearFraction:near/N,rmseM:fullDistance?Math.sqrt(square/N):null,gradient:withGradient?[gx/N,gy/N,gz/N]:undefined,active};
 }
 function rigidFit(source,target){
  if(source.length!==target.length||source.length<2)throw new Error('Au moins deux correspondances sont requises.');
  const mean=p=>p.reduce((s,v)=>[s[0]+v[0]/p.length,s[1]+v[1]/p.length],[0,0]),a=mean(source),b=mean(target);let dot=0,cross=0,spread=0;
  for(let i=0;i<source.length;i++){const x=source[i][0]-a[0],y=source[i][1]-a[1],u=target[i][0]-b[0],v=target[i][1]-b[1];dot+=x*u+y*v;cross+=x*v-y*u;spread+=x*x+y*y;}
  if(spread<1e-10||Math.hypot(dot,cross)<1e-10)throw new Error('Correspondances dégénérées : rotation non déterminée.');
  const theta=Math.atan2(cross,dot)*180/Math.PI,q=C.transform(a,{x:0,y:0,theta});return{x:b[0]-q[0],y:b[1]-q[1],theta};
 }
 function config(input={}){
  const o={...L.config(input),method:'multiresolution',voxelM:.1,capM:.5,stepXY:.1,stepTheta:1,maxIterations:100,chains:8,annealIterations:400,seed:20261103,...input};
  if(!METHODS.includes(o.method)||![o.voxelM,o.capM,o.stepXY,o.stepTheta].every(Number.isFinite)||o.voxelM<0||o.voxelM>.5||o.capM<.2||o.capM>2||o.stepXY<.01||o.stepXY>o.windowXY||o.stepTheta<.1||o.stepTheta>o.windowTheta||!Number.isInteger(o.maxIterations)||o.maxIterations<1||o.maxIterations>300||!Number.isInteger(o.chains)||o.chains<1||o.chains>16||!Number.isInteger(o.annealIterations)||o.annealIterations<10||o.annealIterations>2000||!Number.isInteger(o.seed)||o.seed<0||o.seed>4294967295)throw new Error('Paramètres de scan matching invalides.');
  return o;
 }
 function setup(reference,query,initial,input){
  const o=config(input);if(!initial||!['x','y','theta'].every(k=>Number.isFinite(initial[k])))throw new Error('Pose relative initiale invalide.');
  if(reference===query||(reference.checksum&&reference.checksum===query.checksum))throw new Error('Choisir deux acquisitions différentes, pas le même scan renommé.');
  const fixed=voxel(L.prepare(reference,o),o.voxelM),moving=voxel(L.prepare(query,o),o.voxelM);
  if(Math.min(fixed.length,moving.length)<12||Math.max(fixed.length,moving.length)>5000)throw new Error('Chaque nuage traité doit contenir 12 à 5000 points.');
  const center={x:initial.x,y:initial.y,theta:L.wrap(initial.theta)},index=tree(fixed);let tested=0,work=0;
  const evaluatePose=(p,points=moving,kd=index,gradient=false)=>{work+=points.length;if(work>WORK)throw new Error('Budget de calcul dépassé : réduire la fenêtre ou les données.');tested++;return evaluate(kd,points,p,o.capM,gradient);};
  const inBounds=p=>Math.abs(p.x-center.x)<=o.windowXY+1e-9&&Math.abs(p.y-center.y)<=o.windowXY+1e-9&&Math.abs(L.wrap(p.theta-center.theta))<=o.windowTheta+1e-9;
  return{o,fixed,moving,center,index,evaluatePose,inBounds,get tested(){return tested;},get work(){return work;}};
 }
 function* exhaustive(s){
  const k=Math.floor(s.o.windowXY/s.o.stepXY+1e-9),n=Math.floor(s.o.windowTheta/s.o.stepTheta+1e-9),total=(2*k+1)**2*(2*n+1);
  if(total>500000||total*s.moving.length>WORK)throw new Error('Recherche exhaustive trop grande : réduire la fenêtre ou augmenter les pas.');
  let best=null;
  for(let it=-n;it<=n;it++)for(let iy=-k;iy<=k;iy++)for(let ix=-k;ix<=k;ix++){
   const p={x:s.center.x+ix*s.o.stepXY,y:s.center.y+iy*s.o.stepXY,theta:L.wrap(s.center.theta+it*s.o.stepTheta)},e=s.evaluatePose(p),prior=ix*ix+iy*iy+(it/10)**2;
   if(!best||e.cost<best.cost||(e.cost===best.cost&&prior<best.prior))best={...p,...e,prior};
   if(s.tested%100===0)yield{method:'exhaustive',tested:s.tested,total};
  }
  return{pose:{x:best.x,y:best.y,theta:best.theta},totalCandidates:total,complete:true};
 }
 function* gradient(s){
  const b=[s.o.windowXY,s.o.windowXY,s.o.windowTheta*Math.PI/180*LEVER],toPose=q=>({x:s.center.x+q[0],y:s.center.y+q[1],theta:L.wrap(s.center.theta+q[2]/LEVER*180/Math.PI)});
  let q=[0,0,0],current=s.evaluatePose(toPose(q),s.moving,s.index,true),reason='iteration_limit',iterations=0;const trace=[{iteration:0,cost:current.cost,pose:toPose(q)}];
  for(let iteration=1;iteration<=s.o.maxIterations;iteration++){
   iterations=iteration;const g=current.gradient,norm=Math.hypot(...g);if(norm<1e-7){reason=current.active?'small_gradient':'flat_cost';break;}
   let next,proposal,accepted=false,alpha=.25;
   for(let line=0;line<14;line++){next=q.map((v,i)=>Math.max(-b[i],Math.min(b[i],v-alpha*g[i]/norm)));proposal=s.evaluatePose(toPose(next),s.moving,s.index,true);const dot=g.reduce((v,x,i)=>v+x*(next[i]-q[i]),0);if(dot<0&&proposal.cost<=current.cost+1e-4*dot){accepted=true;break;}alpha*=.5;}
   if(!accepted){reason='line_search_stalled';break;}
   const shift=Math.hypot(...next.map((v,i)=>v-q[i])),gain=current.cost-proposal.cost;q=next;current=proposal;trace.push({iteration,cost:current.cost,pose:toPose(q)});yield{method:'gradient',iteration,tested:s.tested};
   if(shift<1e-5&&gain<1e-10){reason='small_update';break;}
  }
  return{pose:toPose(q),iterations,stopReason:reason,trace};
 }
 function* multiresolution(s){
  const stages=[{voxel:.4,xy:.4,angle:4,rx:s.o.windowXY,ra:s.o.windowTheta},{voxel:.2,xy:.1,angle:1,rx:.4,ra:4},{voxel:0,xy:.025,angle:.25,rx:.1,ra:1}];
  let seeds=[s.center],best=null;const levels=[];
  for(let level=0;level<3;level++){
   const st=stages[level],fixed=voxel(s.fixed,st.voxel),moving=voxel(s.moving,st.voxel),kd=level===2?s.index:tree(fixed),candidates=[],seen=new Set();
   const add=p=>{if(!s.inBounds(p))return;const key=[p.x,p.y,p.theta].map(v=>v.toFixed(7)).join(',');if(seen.has(key))return;seen.add(key);const e=s.evaluatePose(p,moving,kd),prior=(p.x-s.center.x)**2+(p.y-s.center.y)**2+(L.wrap(p.theta-s.center.theta)/30)**2;candidates.push({...p,...e,prior});};
   for(const seed of seeds)for(let it=-Math.ceil(st.ra/st.angle);it<=Math.ceil(st.ra/st.angle);it++)for(let iy=-Math.ceil(st.rx/st.xy);iy<=Math.ceil(st.rx/st.xy);iy++)for(let ix=-Math.ceil(st.rx/st.xy);ix<=Math.ceil(st.rx/st.xy);ix++){
    const count=s.tested;add({x:seed.x+ix*st.xy,y:seed.y+iy*st.xy,theta:L.wrap(seed.theta+it*st.angle)});if(s.tested!==count&&s.tested%100===0)yield{method:'multiresolution',level:level+1,tested:s.tested};
   }
   if(level===2)add(s.center);candidates.sort((a,b)=>a.cost-b.cost||a.prior-b.prior);if(!candidates.length)throw new Error('Aucune hypothèse multi-résolution.');best=candidates[0];seeds=[];
   for(const c of candidates)if(seeds.every(p=>Math.hypot(c.x-p.x,c.y-p.y)>=.2||Math.abs(L.wrap(c.theta-p.theta))>=3)){seeds.push(c);if(seeds.length===4)break;}
   levels.push({level:level+1,voxelM:st.voxel,referencePoints:fixed.length,queryPoints:moving.length,xyStepM:st.xy,angleStepDeg:st.angle,candidates:candidates.length,cost:best.cost,pose:{x:best.x,y:best.y,theta:best.theta}});yield{method:'multiresolution',level:level+1,tested:s.tested};
  }
  return{pose:{x:best.x,y:best.y,theta:best.theta},levels};
 }
 function* annealing(s){
  let random=s.o.seed>>>0;const u=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return(random+.5)/4294967296;},normal=()=>Math.sqrt(-2*Math.log(u()))*Math.cos(2*Math.PI*u());
  const b=[s.o.windowXY,s.o.windowXY,s.o.windowTheta],toPose=q=>({x:s.center.x+q[0],y:s.center.y+q[1],theta:L.wrap(s.center.theta+q[2])});
  if((1+s.o.chains*(s.o.annealIterations+1))*s.moving.length>WORK)throw new Error('Budget de recuit excessif.');
  let best=[0,0,0],bestCost=s.evaluatePose(toPose(best)).cost,attempted=0,accepted=0,uphill=0;const trace=[];
  for(let chain=0;chain<s.o.chains;chain++){
   let q=chain?b.map(v=>(2*u()-1)*v):[0,0,0],E=chain?s.evaluatePose(toPose(q)).cost:bestCost;if(E<bestCost){best=[...q];bestCost=E;}
   for(let i=0;i<s.o.annealIterations;i++){
    const t=i/(s.o.annealIterations-1),T=.04*(.00002/.04)**t,xy=.25*(.004/.25)**t,angle=4*(.08/4)**t,next=q.map((v,j)=>v+normal()*(j===2?angle:xy));attempted++;
    if(next.every((v,j)=>Math.abs(v)<=b[j])){const value=s.evaluatePose(toPose(next)).cost;if(value<=E||u()<Math.exp((E-value)/T)){if(value>E)uphill++;q=next;E=value;accepted++;}if(E<bestCost){best=[...q];bestCost=E;}}
    if((i+1)%40===0){trace.push({chain:chain+1,iteration:i+1,attempted,bestCost,currentCost:E});yield{method:'annealing',chain:chain+1,iteration:i+1,tested:s.tested};}
   }
  }
  return{pose:toPose(best),seed:s.o.seed,attemptedMoves:attempted,acceptedMoves:accepted,uphillMoves:uphill,trace};
 }
 function* direct(s){
  const source=[],target=[];
  for(const p of s.moving){const world=C.transform(p,s.center),n=nearest(s.index,...world);if(n.d2<s.o.capM**2){source.push(world);target.push([n.x,n.y]);}}
  if(source.length<12)throw new Error('Moins de 12 correspondances pour le calcul direct.');
  yield{method:'direct',pairs:source.length,tested:s.tested};
  const correction=rigidFit(source,target),pose=compose(correction,s.center);if(!s.inBounds(pose))throw new Error('Calcul direct hors fenêtre.');
  return{pose,correction,pairedPoints:source.length,onePass:true};
 }
 function* search(reference,query,initial,input={}){
  const started=performance.now(),s=setup(reference,query,initial,input),generators={exhaustive,gradient,multiresolution,annealing,direct},result=yield*generators[s.o.method](s);
  const before=evaluate(s.index,s.moving,s.center,s.o.capM,false,true),after=evaluate(s.index,s.moving,result.pose,s.o.capM,false,true),queryTree=tree(s.moving),reverse=evaluate(queryTree,s.fixed,relative(result.pose,{x:0,y:0,theta:0}),s.o.capM,false,true),warnings=[];
  if(after.nearFraction<.5||reverse.nearFraction<.5)warnings.push('Recouvrement insuffisant : moins de 50 % de voisins à 20 cm dans une direction.');
  if(after.cost>before.cost+1e-12)warnings.push('Le coût augmente : correspondances à vérifier.');
  if(result.stopReason==='iteration_limit'||result.stopReason==='flat_cost')warnings.push('Gradient arrêté sur sa limite ou un plateau.');
  if(Math.abs(result.pose.x-s.center.x)>s.o.windowXY-.026||Math.abs(result.pose.y-s.center.y)>s.o.windowXY-.026||Math.abs(L.wrap(result.pose.theta-s.center.theta))>s.o.windowTheta-.26)warnings.push('Solution au bord de la fenêtre.');
  return{format:'tp-lidar-scan-matching-v1',method:s.o.method,initial:s.center,...result,before,after,reverse,tested:s.tested,pointEvaluations:s.work,referencePoints:s.fixed.length,queryPoints:s.moving.length,options:s.o,elapsedMs:performance.now()-started,quality:warnings.length?'a_verifier':'criteres_satisfaits',warnings,convention:'Pose maps query-local coordinates into reference-local coordinates; degrees counterclockwise.',caveat:'Local matching; neighbour errors are not pose uncertainty. Physical pose references require independent measurements.'};
 }
 function match(...args){const it=search(...args);let s;do{s=it.next();}while(!s.done);return s.value;}
 async function matchAsync(reference,query,initial,options={},progress=()=>{},cancelled=()=>false){const it=search(reference,query,initial,options);while(true){if(cancelled())throw new Error('Recherche annulée.');const s=it.next();if(s.done)return s.value;progress(s.value);await new Promise(resolve=>setTimeout(resolve,0));}}
 return{METHODS,compose,relative,voxel,tree,nearest,evaluate,rigidFit,config,match,matchAsync};
});
