// Depuis la racine du dépôt : node visualisation/exemple_mise_a_jour/generer.cjs
// Exemple déterministe de mise à jour d'une carte rechargée, avec deux scans réels.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../core.js'),{Grid}=require('../grid.js');
const repo=path.resolve(__dirname,'../..');
const metadata=JSON.parse(fs.readFileSync(path.join(__dirname,'poses_et_qualite.json'),'utf8'));
const first=C.parseScan(fs.readFileSync(path.join(repo,'controle_scans',metadata.reference),'utf8'),metadata.reference);
const second=C.parseScan(fs.readFileSync(path.join(repo,metadata.moving),'utf8'),metadata.moving);
second.pose={...metadata.pose};
const grid=new Grid({resolution:.1,width:20,height:20,x:-10,y:-10});
grid.integrate(first,C.transform);
const saved=grid.save();
fs.writeFileSync(path.join(__dirname,'grille_avant.json'),saved);
fs.writeFileSync(path.join(__dirname,'grille_avant.csv'),grid.csv());
const existing=Grid.load(saved);assert.deepEqual(existing.cells,grid.cells);
existing.integrate(second,C.transform);
const transitions={};let changed=0;
for(let i=0;i<grid.cells.length;i++)if(grid.cells[i]!==existing.cells[i]){changed++;const key=`${grid.cells[i]}->${existing.cells[i]}`;transitions[key]=(transitions[key]||0)+1;}
assert.ok(changed>0);assert.equal(existing.scans.length,2);assert.equal(grid.scans.length,1);
assert.equal(grid.save(),saved);
const final=Grid.load(existing.save());assert.deepEqual(final.cells,existing.cells);
assert.equal(final.integrate(second,C.transform).duplicate,true);
fs.writeFileSync(path.join(__dirname,'grille_apres.json'),existing.save());
fs.writeFileSync(path.join(__dirname,'grille_apres.csv'),existing.csv());
fs.writeFileSync(path.join(__dirname,'poses_manuelles.json'),C.savePoses([first,second]));
const report={reference:metadata.reference,new_scan:metadata.moving,resolution_m:.1,dimensions_cells:[200,200],
 first_scan_points:first.points.length,new_scan_points:second.points.length,before:grid.counts(),after:existing.counts(),changed_cells:changed,
 transitions,encoding:{free:0,unknown:127,occupied:255},procedure:'integrate first scan -> save JSON -> load existing grid -> integrate second scan -> save updated grid',
 assertions:'Initial map unchanged; saved/reloaded cells identical; updated map has two scan records; repeated second scan ignored.',
 caveat:'Second scan pose estimated automatically, not measured. State changes can reflect noise as well as scene changes.'};
fs.writeFileSync(path.join(__dirname,'bilan.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
