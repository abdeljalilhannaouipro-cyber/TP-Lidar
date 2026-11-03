const assert=require('node:assert/strict'),O=require('../../visualisation/grid-optimisation.js'),L=require('../../visualisation/grid-localisation.js'),{scene}=require('./scene.cjs');
const s=scene(),truth={x:1.8,y:-1.5,theta:22},scan=s.scan(truth),initial={x:2.337,y:-1.913,theta:29.3};
let count=0;function test(name,fn){fn();count++;console.log('OK',name);}
test('Pyramide réelle : dimensions et résolutions 4r, 2r, r',()=>{const p=O.pyramid(s.grid);assert.deepEqual(p.map(g=>g.resolution),[.4,.2,.1]);assert.equal(p[0].nx,Math.ceil(s.grid.nx/4));assert.strictEqual(p[2],s.grid);});
test('Agrégation : impact prioritaire sur libre et inconnu',()=>{const cells=new Uint8Array(16);cells.fill(127);cells[0]=0;cells[3]=255;const g={x:0,y:0,nx:4,ny:4,resolution:.1,cells,scans:[]},p=O.pyramid(g);assert.equal(p[0].cells[0],255);assert.equal(p[1].cells[0],0);assert.equal(p[1].cells[1],255);assert.equal(p[1].cells[2],127);});
test('Paramètres, graine et données invalides refusés',()=>{assert.throws(()=>O.config({method:'other'}));assert.throws(()=>O.config({maxIterations:Infinity}));assert.throws(()=>O.config({seed:-1}));assert.throws(()=>O.match(s.grid,{points:[]},truth));assert.throws(()=>O.match(s.grid,scan,{x:999,y:0,theta:0}));assert.throws(()=>O.match({...s.grid,scans:[{checksum:scan.checksum}]},scan,truth));});
test('Énergie inconnue/hors carte pénalisée et bornée',()=>{const f=L.field(s.grid);assert.equal(O.energy(f,[[100,100]],truth),1);assert(O.energy(f,scan.points,truth)<O.energy(f,scan.points,initial));});
let gd,sa,mr;
test('Gradient : énergie décroissante, budget borné et carte intacte',()=>{const before=s.grid.save();gd=O.match(s.grid,{...scan,pose:{x:999,y:999,theta:999}},initial,{method:'gradient'});assert.equal(s.grid.save(),before);assert(gd.trace.at(-1).energy<gd.trace[0].energy);assert(gd.trace.every((r,i)=>i===0||r.energy<=gd.trace[i-1].energy));assert(gd.iterations<=100);assert(gd.acceptedPoints===scan.points.length);});
test('Gradient : récupération près de la vraie pose',()=>{const r=O.match(s.grid,scan,{x:1.94,y:-1.52,theta:23},{method:'gradient'});assert(Math.hypot(r.pose.x-truth.x,r.pose.y-truth.y)<.15);assert(Math.abs(L.wrap(r.pose.theta-truth.theta))<1);});
test('Pyramide : trois grilles utilisées, pose récupérée et bornes respectées',()=>{mr=O.match(s.grid,scan,initial,{method:'pyramid'});assert.deepEqual(mr.levels.map(l=>l.resolution),[.4,.2,.1]);assert(Math.hypot(mr.pose.x-truth.x,mr.pose.y-truth.y)<.2);assert(Math.abs(L.wrap(mr.pose.theta-truth.theta))<2);assert(Math.abs(mr.pose.x-initial.x)<=1);});
test('Recuit : budget, graine reproductible, montées acceptées et pose améliorée',()=>{sa=O.match(s.grid,scan,initial,{method:'annealing'});const r=O.match(s.grid,scan,initial,{method:'annealing'});assert.deepEqual(r.pose,sa.pose);assert.equal(sa.attemptedMoves,3200);assert(sa.acceptedMoves>0&&sa.acceptedMoves<=sa.attemptedMoves);assert(sa.uphillMoves>0);assert(sa.objective<sa.trace[0].energy);assert(sa.trace.every((r,i)=>i===0||r.energy<=sa.trace[i-1].energy));});
test('Gradient et recuit restent dans leurs fenêtres angulaires circulaires',()=>{for(const method of ['gradient','annealing']){const p={...truth,theta:179},r=O.match(s.grid,s.scan(p),{...p,theta:-179},{method});assert(Math.abs(L.wrap(r.pose.theta+179))<=15);assert(Math.abs(r.pose.x-p.x)<=1);}});
(async()=>{
 for(const method of ['gradient','pyramid','annealing']){
  await assert.rejects(O.matchAsync(s.grid,scan,initial,{method},()=>{},()=>true),/annulée/);count++;
  const sync=method==='gradient'?gd:method==='pyramid'?mr:sa,r=await O.matchAsync(s.grid,scan,initial,{method});assert.deepEqual(r.pose,sync.pose);count++;
 }
 console.log(`${count} optimisation checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
