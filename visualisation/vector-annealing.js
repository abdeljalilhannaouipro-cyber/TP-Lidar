(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./vector-localisation.js'),require('./grid-localisation.js'));else root.LidarVectorAnnealing=factory(root.LidarVectorLocalisation,root.LidarGridLocalisation);})(globalThis,function(V,L){
 'use strict';
 function* search(map,scan,initial,input={}){
  const started=performance.now(),o={...V.config(input),chains:8,annealIterations:400,seed:20261103,...input};
  if(!Number.isInteger(o.chains)||o.chains<1||o.chains>16||!Number.isInteger(o.annealIterations)||o.annealIterations<10||o.annealIterations>2000||!Number.isInteger(o.seed)||o.seed<0||o.seed>4294967295)throw new Error('Recuit : chaînes 1–16, itérations 10–2000 et graine entière 0–4294967295.');
  if(!initial||!['x','y','theta'].every(k=>Number.isFinite(initial[k])))throw new Error('Pose initiale invalide.');
  const center={x:initial.x,y:initial.y,theta:L.wrap(initial.theta)},segments=V.geometry(map),points=L.prepare(scan,o);
  if(map.scans?.some(s=>s.checksum&&s.checksum===scan.checksum))throw new Error('Ce scan est déjà dans la carte vectorielle : utiliser une carte construite sans lui.');
  if((1+o.chains*(o.annealIterations+1))*points.length*segments.length>V.MAX_WORK)throw new Error('Budget de recuit trop grand : réduire le nombre de chaînes ou d’itérations.');
  const bounds=[o.windowXY,o.windowXY,o.windowTheta],toPose=q=>({x:center.x+q[0],y:center.y+q[1],theta:L.wrap(center.theta+q[2])});
  let random=o.seed>>>0;const uniform=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return(random+.5)/4294967296;},normal=()=>Math.sqrt(-2*Math.log(uniform()))*Math.cos(2*Math.PI*uniform());
  let tested=0;const cost=q=>{tested++;return V.evaluate(segments,points,toPose(q),o.capM).cost;};
  let best=[0,0,0],bestCost=cost(best),attempted=0,accepted=0,uphill=0,outside=0;const trace=[];
  for(let chain=0;chain<o.chains;chain++){
   let q=chain===0?[0,0,0]:bounds.map(b=>(2*uniform()-1)*b),E=chain===0?bestCost:cost(q);
   if(E<bestCost){best=[...q];bestCost=E;}
   trace.push({chain:chain+1,iteration:0,attempted,currentCost:E,bestCost,temperature:.04,pose:toPose(q),bestPose:toPose(best)});
   for(let iteration=0;iteration<o.annealIterations;iteration++){
    const t=iteration/(o.annealIterations-1),temperature=.04*(.00002/.04)**t,xy=.25*(.004/.25)**t,angle=4*(.08/4)**t;
    const next=q.map((v,i)=>v+normal()*(i===2?angle:xy));attempted++;
    if(next.every((v,i)=>Math.abs(v)<=bounds[i])){
     const Enew=cost(next);
     if(Enew<=E||uniform()<Math.exp((E-Enew)/temperature)){if(Enew>E)uphill++;q=next;E=Enew;accepted++;}
     if(E<bestCost){best=[...q];bestCost=E;}
    }else outside++;
    if((iteration+1)%20===0||iteration+1===o.annealIterations){trace.push({chain:chain+1,iteration:iteration+1,attempted,currentCost:E,bestCost,temperature,pose:toPose(q),bestPose:toPose(best)});yield{chain:chain+1,chains:o.chains,iteration:iteration+1,tested,attempted};}
   }
  }
  const pose=toPose(best),before=V.evaluate(segments,points,center,o.capM),after=V.evaluate(segments,points,pose,o.capM),warnings=[];
  if(after.nearFraction<.5)warnings.push('Moins de 50 % des impacts sont à 20 cm des segments.');
  if(Math.abs(best[0])>bounds[0]-.01||Math.abs(best[1])>bounds[1]-.01||Math.abs(best[2])>bounds[2]-.1)warnings.push('Pose au bord de la fenêtre.');
  if(after.cost>=before.cost-1e-12)warnings.push('Aucune amélioration du coût.');
  return{format:'tp-lidar-vector-localisation-v1',method:'annealing-point-to-finite-segments',initial:center,pose,before,after,tested,trace,seed:o.seed,attemptedMoves:attempted,acceptedMoves:accepted,uphillMoves:uphill,rejectedOutside:outside,rejectedMetropolis:attempted-outside-accepted,acceptedPoints:points.length,segments:segments.length,elapsedMs:performance.now()-started,options:o,quality:warnings.length?'a_verifier':'criteres_satisfaits',warnings,caveat:'Optimisation stochastique par recuit, pas un posterior de pose calibré. Fin de budget sans garantie d’optimum global.'};
 }
 function match(...args){const it=search(...args);let s;do{s=it.next();}while(!s.done);return s.value;}
 async function matchAsync(map,scan,initial,options={},progress=()=>{},cancelled=()=>false){const it=search(map,scan,initial,options);while(true){if(cancelled())throw new Error('Recherche annulée.');const s=it.next();if(s.done)return s.value;progress(s.value);await new Promise(resolve=>setTimeout(resolve,0));}}
 return{match,matchAsync};
});
