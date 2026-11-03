const assert=require('node:assert/strict');
const L=require('../../visualisation/grid-localisation.js'),{Grid}=require('../../visualisation/grid.js'),{scene}=require('./scene.cjs');
let count=0;function test(name,fn){fn();count++;console.log('OK',name);}
const s=scene(),truth={x:1.8,y:-1.5,theta:22},scan=s.scan(truth),initial={x:2.35,y:-1.9,theta:29};
test('Distance aux obstacles, cellules cardinales et diagonales',()=>{const g=new Grid({resolution:.1,width:1,height:1,x:0,y:0});g.cells.fill(0);g.cells[55]=255;const f=L.field(g);assert.equal(f.distance[55],0);assert(Math.abs(f.distance[56]-.1)<1e-6);assert(Math.abs(f.distance[66]-.1*Math.SQRT2)<1e-6);});
test('Grille vide ou invalide refusée',()=>{assert.throws(()=>L.field(new Grid()));assert.throws(()=>L.field({}));});
test('Inconnu et hors carte ne donnent aucun score',()=>{const f=L.field(s.grid);assert.equal(L.evaluate(f,[[100,100]],truth).score,0);const g=new Grid({resolution:.1,width:2,height:2,x:0,y:0});g.cells[0]=255;assert.equal(L.evaluate(L.field(g),[[1,1]],{x:0,y:0,theta:0}).score,0);});
test('Scan déjà intégré refusé indépendamment du nom',()=>{const g=Grid.load(s.grid.save());g.scans.push({checksum:scan.checksum});assert.throws(()=>L.match(g,scan,initial),/déjà/);});
test('Scan trop court, non fini, filtres et pose invalides refusés',()=>{assert.throws(()=>L.match(s.grid,{points:[[1,1]]},initial));assert.throws(()=>L.match(s.grid,{points:[[NaN,1]]},initial));assert.throws(()=>L.match(s.grid,scan,{x:NaN,y:0,theta:0}));assert.throws(()=>L.match(s.grid,scan,initial,{windowXY:Infinity}));assert.throws(()=>L.match(s.grid,scan,initial,{minIntensity:255}));});
let result;
test('Récupération de pose synthétique sans lire scan.pose, données inchangées',()=>{const before=s.grid.save(),points=JSON.stringify(scan.points);result=L.match(s.grid,{...scan,pose:{x:999,y:999,theta:999}},initial);assert(Math.hypot(result.pose.x-truth.x,result.pose.y-truth.y)<.15);assert(Math.abs(L.wrap(result.pose.theta-truth.theta))<1);assert(result.after.score>result.before.score);assert.equal(s.grid.save(),before);assert.equal(JSON.stringify(scan.points),points);});
test('Fenêtre bornée et angle circulaire',()=>{assert(Math.abs(result.pose.x-initial.x)<=1);assert(Math.abs(result.pose.y-initial.y)<=1);assert.equal(L.wrap(359),-1);assert.equal(L.wrap(-181),179);});
test('Recherche traversant la discontinuité -180/180 degrés',()=>{const p={x:1.8,y:-1.5,theta:179};const r=L.match(s.grid,s.scan(p),{x:2.1,y:-1.7,theta:-176});assert(Math.abs(L.wrap(r.pose.theta-p.theta))<1);assert(Math.hypot(r.pose.x-p.x,r.pose.y-p.y)<.15);});
test('Solution contrainte au bord de fenêtre signalée',()=>{const r=L.match(s.grid,scan,{x:2.6,y:-2,theta:22},{windowXY:.2,windowTheta:3});assert(r.warnings.some(w=>w.includes('bord')));});
test('Zone non couverte signalée sans prétendre localiser',()=>{const shifted={...scan,points:scan.points.map(p=>[p[0]*10,p[1]*10])};const r=L.match(s.grid,shifted,initial,{maxRange:100});assert.equal(r.quality,'a_verifier');assert(r.after.coverage<.6);});
(async()=>{
 await assert.rejects(L.matchAsync(s.grid,scan,initial,{},()=>{},()=>true),/annulée/);count++;console.log('OK Annulation asynchrone');
 const asyncResult=await L.matchAsync(s.grid,scan,initial);assert.deepEqual(asyncResult.pose,result.pose);count++;console.log('OK Résultat asynchrone identique');
 console.log(`${count} localisation checks passed.`,result.pose);
})().catch(e=>{console.error(e);process.exitCode=1;});
