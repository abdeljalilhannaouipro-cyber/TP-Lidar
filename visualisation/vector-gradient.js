(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./vector-localisation.js'),require('./grid-localisation.js'));else root.LidarVectorGradient=factory(root.LidarVectorLocalisation,root.LidarGridLocalisation);})(globalThis,function(V,L){
 'use strict';
 const LEVER=2;
 function nearest(x,y,segments){
  let best={d2:Infinity,qx:0,qy:0};
  for(const s of segments){
   const ex=Math.max(s.xmin-x,0,x-s.xmax),ey=Math.max(s.ymin-y,0,y-s.ymax);if(ex*ex+ey*ey>=best.d2)continue;
   const px=x-s.ax,py=y-s.ay,t=Math.max(0,Math.min(1,(px*s.dx+py*s.dy)*s.inv)),qx=s.ax+t*s.dx,qy=s.ay+t*s.dy,d2=(x-qx)**2+(y-qy)**2;
   if(d2<best.d2)best={d2,qx,qy};
  }
  return best;
 }
 // Gradient in coordinates (x metres, y metres, 2 * theta radians).
 function objective(segments,points,p,capM=.5){
  const a=p.theta*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cap2=capM*capM;let cost=0,gx=0,gy=0,gz=0,active=0;
  for(const[px,py]of points){
   const rx=c*px-s*py,ry=s*px+c*py,x=p.x+rx,y=p.y+ry,n=nearest(x,y,segments);cost+=Math.min(n.d2,cap2);
   if(n.d2<cap2){const dx=x-n.qx,dy=y-n.qy;gx+=2*dx;gy+=2*dy;gz+=2*(-dx*ry+dy*rx)/LEVER;active++;}
  }
  const N=points.length;return{cost:cost/N,gradient:[gx/N,gy/N,gz/N],active};
 }
 function* search(map,scan,initial,input={}){
  const started=performance.now(),o={...V.config(input),maxIterations:100,...input};
  if(!Number.isInteger(o.maxIterations)||o.maxIterations<1||o.maxIterations>300)throw new Error('Budget de gradient : entier de 1 à 300.');
  if(!initial||!['x','y','theta'].every(k=>Number.isFinite(initial[k])))throw new Error('Pose initiale invalide.');
  const center={x:initial.x,y:initial.y,theta:L.wrap(initial.theta)},segments=V.geometry(map),points=L.prepare(scan,o);
  if(map.scans?.some(s=>s.checksum&&s.checksum===scan.checksum))throw new Error('Ce scan est déjà dans la carte vectorielle : utiliser une carte construite sans lui.');
  if(points.length*segments.length*(1+15*o.maxIterations)>V.MAX_WORK)throw new Error('Budget de calcul trop grand : réduire le nombre maximal d’itérations.');
  const toPose=q=>({x:center.x+q[0],y:center.y+q[1],theta:L.wrap(center.theta+q[2]/LEVER*180/Math.PI)});
  const bounds=[o.windowXY,o.windowXY,o.windowTheta*Math.PI/180*LEVER],project=q=>q.map((v,i)=>Math.max(-bounds[i],Math.min(bounds[i],v)));
  let tested=0;const cost=q=>{tested++;return objective(segments,points,toPose(q),o.capM);};
  let q=[0,0,0],current=cost(q),reason='iteration_limit',iterations=0;
  const trace=[{iteration:0,cost:current.cost,pose:toPose(q),activePoints:current.active}];
  for(let iteration=1;iteration<=o.maxIterations;iteration++){
   iterations=iteration;const g=current.gradient,norm=Math.hypot(...g);
   if(norm<1e-7){reason=current.active?'small_gradient':'flat_truncation';break;}
   let alpha=.25,accepted=false,next,proposal;
   for(let line=0;line<14;line++){
    next=project(q.map((v,i)=>v-alpha*g[i]/norm));proposal=cost(next);
    const directional=g.reduce((sum,gi,i)=>sum+gi*(next[i]-q[i]),0);
    if(directional<0&&proposal.cost<=current.cost+1e-4*directional){accepted=true;break;}alpha*=.5;
   }
   if(!accepted){reason='line_search_stalled';break;}
   const movement=Math.hypot(...next.map((v,i)=>v-q[i])),gain=current.cost-proposal.cost;q=next;current=proposal;
   trace.push({iteration,cost:current.cost,pose:toPose(q),activePoints:current.active});
   yield{iteration,tested,cost:current.cost};
   if(movement<1e-5&&gain<1e-10){reason='small_update';break;}
  }
  const best=toPose(q),before=V.evaluate(segments,points,center,o.capM),after=V.evaluate(segments,points,best,o.capM),warnings=[];
  if(after.nearFraction<.5)warnings.push('Moins de 50 % des impacts sont à 20 cm des segments.');
  if(q.some((v,i)=>Math.abs(v)>bounds[i]-.001))warnings.push('Pose au bord de la fenêtre.');
  if(reason==='iteration_limit')warnings.push('Limite d’itérations atteinte.');
  if(reason==='line_search_stalled')warnings.push('Aucun pas de descente accepté : minimum local ou changement de correspondances possible.');
  if(reason==='flat_truncation')warnings.push('Aucun point dans la zone active du coût tronqué : corriger la pose initiale.');
  return{format:'tp-lidar-vector-localisation-v1',method:'gradient-point-to-finite-segments',initial:center,pose:best,before,after,tested,iterations,stopReason:reason,trace,activePoints:current.active,acceptedPoints:points.length,segments:segments.length,elapsedMs:performance.now()-started,options:o,quality:warnings.length?'a_verifier':'criteres_satisfaits',warnings,caveat:'Descente locale du même coût tronqué que la recherche exhaustive. Petit gradient ou faible coût ne prouve pas une pose correcte.'};
 }
 function match(...args){const it=search(...args);let s;do{s=it.next();}while(!s.done);return s.value;}
 async function matchAsync(map,scan,initial,options={},progress=()=>{},cancelled=()=>false){const it=search(map,scan,initial,options);while(true){if(cancelled())throw new Error('Recherche annulée.');const s=it.next();if(s.done)return s.value;progress(s.value);await new Promise(resolve=>setTimeout(resolve,0));}}
 return{match,matchAsync,objective,nearest,LEVER};
});
