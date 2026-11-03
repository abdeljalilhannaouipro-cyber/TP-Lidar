const assert=require('node:assert/strict'),B=require('../../visualisation/grid-brute-force.js'),L=require('../../visualisation/grid-localisation.js'),{scene}=require('./scene.cjs');
const s=scene(),truth={x:1.8,y:-1.5,theta:22},scan=s.scan(truth);
let count=0;function test(name,fn){fn();count++;console.log('OK',name);}
test('Comptage exact du domaine par défaut : 21 × 21 × 31',()=>{const d=B.lattice(s.grid,truth,B.config());assert.equal(d.candidates,13671);assert.equal(d.axes.x.length,21);assert.equal(d.axes.theta.length,31);});
test('Bornes non multiples du pas : domaine centré sans dépassement',()=>{const d=B.lattice(s.grid,truth,B.config({windowXY:.2,windowTheta:1,stepXY:.07,stepTheta:.3}));assert.equal(d.candidates,175);assert(d.axes.x.every(x=>Math.abs(x-truth.x)<=.2));assert(d.axes.theta.every(t=>Math.abs(L.wrap(t-truth.theta))<=1));assert(d.axes.x.includes(truth.x));});
test('Origines hors carte exclues explicitement du domaine',()=>{const d=B.lattice(s.grid,{x:-4.95,y:-3.95,theta:0},B.config({windowXY:.2,windowTheta:1}));assert.equal(d.candidates,27);assert(d.axes.x.every(x=>x>=s.grid.x));});
test('Pas invalides et budget excessif refusés sans simplification',()=>{for(const stepXY of [0,NaN,.001,2])assert.throws(()=>B.config({stepXY}));assert.throws(()=>B.config({stepTheta:Infinity}));assert.throws(()=>B.lattice(s.grid,truth,B.config({stepXY:.01,stepTheta:.1,windowXY:3,windowTheta:45})),/limite/);});
test('Scan déjà intégré, grille vide et mauvaise initialisation refusés',()=>{assert.throws(()=>B.match({...s.grid,scans:[{checksum:scan.checksum}]},scan,truth),/déjà/);assert.throws(()=>B.match(s.grid,scan,{x:999,y:0,theta:0}));assert.throws(()=>B.match(s.grid,{points:[]},truth));});
let result;
test('Toutes les poses et tous les points sont évalués, sans lire scan.pose',()=>{const before=s.grid.save();result=B.match(s.grid,{...scan,pose:{x:999,y:999,theta:999}},{x:truth.x+.537,y:truth.y-.413,theta:29.3},{maxPoints:12});assert.equal(result.tested,13671);assert.equal(result.sampledPoints,scan.points.length);assert.equal(result.complete,true);assert.equal(s.grid.save(),before);assert(Math.hypot(result.pose.x-truth.x,result.pose.y-truth.y)<.15);assert(Math.abs(L.wrap(result.pose.theta-truth.theta))<1);});
test('Maximum du score vérifié par une énumération indépendante',()=>{
 const initial={x:1.8,y:-1.5,theta:22},options={windowXY:.2,windowTheta:1,stepXY:.1,stepTheta:1};
 const r=B.match(s.grid,scan,initial,options),f=L.field(s.grid);let maximum=-Infinity,tested=0;
 for(const dt of [-1,0,1])for(const dy of [-.2,-.1,0,.1,.2])for(const dx of [-.2,-.1,0,.1,.2]){maximum=Math.max(maximum,L.evaluate(f,scan.points,{x:initial.x+dx,y:initial.y+dy,theta:initial.theta+dt}).score);tested++;}
 assert.equal(r.tested,tested);assert(Math.abs(r.after.score-maximum)<1e-12);
});
test('Angles circulaires et compteur conservé autour de ±180°',()=>{const p={x:1.8,y:-1.5,theta:179},r=B.match(s.grid,s.scan(p),{...p,theta:-179},{windowXY:.2,windowTheta:3});assert.equal(r.tested,175);assert(Math.abs(L.wrap(r.pose.theta-179))<1.1);});
test('Couverture faible détectée',()=>{const r=B.match(s.grid,{...scan,points:scan.points.map(p=>p.map(x=>x*10))},truth,{windowXY:.1,windowTheta:1,maxRange:100});assert.equal(r.quality,'a_verifier');assert(r.after.coverage<.6);});
(async()=>{
 await assert.rejects(B.matchAsync(s.grid,scan,truth,{},()=>{},()=>true),/annulée/);count++;console.log('OK Annulation sans résultat complet fictif');
 const options={windowXY:.2,windowTheta:2},sync=B.match(s.grid,scan,truth,options),asyncResult=await B.matchAsync(s.grid,scan,truth,options);assert.deepEqual(sync.pose,asyncResult.pose);assert.equal(sync.tested,asyncResult.tested);count++;console.log('OK Versions synchrone et asynchrone identiques');
 console.log(`${count} exhaustive checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
