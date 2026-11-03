// Run: node visualisation/test_core.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('./core.js');
let passed = 0;
function test(name, fn) { fn(); console.log('OK', name); passed++; }
const csv = 'point_index,angle_deg,dist_mm,intensity\n0,0,1000,210\n1,90,2000,210\n2,180,0,0\n';
test('Conversion polaire, unités, exclusion des distances nulles', () => {
  const s = C.parseScan(csv, 'scan.csv'); assert.equal(s.points.length, 2); assert.equal(s.invalid, 1);
  assert.deepEqual(s.points[0], [1, -0]); assert.ok(Math.abs(s.points[1][1] + 2) < 1e-12);
});
test('Convention antihoraire explicite pour les CSV polaires seuls', () => {
  assert.equal(C.parseScan(csv, 'scan.csv', false).points[1][1], 2);
});
test('Rotation de 90 degrés et translation, sans modifier le point local', () => {
  const p = [2, 0]; const q = C.transform(p, { x: 1, y: 3, theta: 90 });
  assert.ok(Math.abs(q[0] - 1) < 1e-12 && Math.abs(q[1] - 5) < 1e-12); assert.deepEqual(p, [2, 0]);
});
test('Les deux poses restent indépendantes', () => {
  const a = C.parseScan(csv, 'a'), b = C.parseScan(csv, 'b'); a.pose.x = 3;
  assert.equal(b.pose.x, 0); assert.equal(C.transform(a.points[0], a.pose)[0], 4);
  assert.equal(C.transform(b.points[0], b.pose)[0], 1);
});
test('Lecture CSV cité, BOM et délimiteur point-virgule', () => {
  const s = C.parseScan('\ufeff"angle_deg";"dist_mm"\n0;1000\n', 'a'); assert.equal(s.points.length, 1);
  assert.deepEqual(C.table('a,b\n"x,y","z""w"\n'), [['a','b'], ['x,y','z"w']]);
});
test('Données manquantes, infinies et fichier fusionné refusés', () => {
  for (const data of ['angle_deg,dist_mm\n0,\n', 'angle_deg,dist_mm\n0,Infinity\n', 'source_scan,angle_deg,dist_mm\na,0,1000\n']) assert.throws(() => C.parseScan(data, 'bad'));
});
test('Export des seuls scans visibles et échappement du nom', () => {
  const a = C.parseScan(csv, 'a,"b.csv'), b = C.parseScan(csv, 'hidden'); b.visible = false;
  const rows = C.table(C.exportPoints([a, b])); assert.equal(rows.length, 3); assert.equal(rows[1][0], 'a,"b.csv');
});
test('Sauvegarde/rechargement des poses avec contrôle du scan', () => {
  const a = C.parseScan(csv, 'a'); a.pose = { x: 1.2, y: -3, theta: 37 };
  const json = C.savePoses([a]); const b = C.parseScan(csv, 'a');
  const update = C.readPoses(json, [b]); assert.deepEqual(update[0].pose, a.pose);
  assert.throws(() => C.readPoses(json, [C.parseScan(csv, 'different')]));
  const invalid = JSON.parse(json); invalid.scans[0].pose.x = null;
  assert.throws(() => C.readPoses(JSON.stringify(invalid), [b]));
});
test('Six couleurs différentes', () => assert.equal(new Set(Array.from({length:6}, (_,i) => C.color(i))).size, 6));
test('Dix-sept couleurs distinctes compatibles avec l’export JSON de segments',()=>{const colors=Array.from({length:17},(_,i)=>C.color(i));assert.equal(new Set(colors).size,17);assert.ok(colors.every(c=>/^#[0-9a-f]{6}$/i.test(c)));});
test('Six vrais scans, séquences contrôlées, coordonnées métriques fidèles', () => {
  const sandbox = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'examples.js'), 'utf8'), sandbox);
  const scans = Array.from(sandbox.window.LIDAR_EXAMPLES, e => C.parseScan(e.text, e.name));
  assert.equal(scans.length, 6); assert.deepEqual(scans.map(s => s.points.length), [454,457,456,456,457,457]);
  assert.equal(scans.reduce((n,s) => n+s.invalid, 0), 4);
  assert.equal(scans.reduce((n,s) => n+s.wraps, 0), 0);
  const raw = C.table(sandbox.window.LIDAR_EXAMPLES[0].text); const h = raw[0];
  assert.equal(scans[0].points[0][0], Number(raw[1][h.indexOf('x_lib_mm')])/1000);
  const poses = scans.map(s => ({...s.pose})); scans[3].pose.theta = 17;
  assert.deepEqual(scans[2].pose, poses[2]);
});
test('Onze nouveaux scans contrôlés, 17 acquisitions et 7745 points valides',()=>{
 const sandbox={window:{}};for(const file of ['examples.js','new-examples.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,file),'utf8'),sandbox);
 const all=Array.from(sandbox.window.LIDAR_EXAMPLES).concat(Array.from(sandbox.window.LIDAR_NEW_EXAMPLES));
 assert.equal(sandbox.window.LIDAR_NEW_EXAMPLES.length,11);assert.equal(all.length,17);
 const scans=all.map(e=>C.parseScan(e.text,e.name));assert.equal(scans.reduce((n,s)=>n+s.points.length,0),7745);assert.equal(scans.reduce((n,s)=>n+s.invalid,0),15);assert.equal(scans.reduce((n,s)=>n+s.wraps,0),0);
});
console.log(`${passed} checks passed.`);
