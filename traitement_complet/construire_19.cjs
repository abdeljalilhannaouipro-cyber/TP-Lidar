// Génère des jeux embarqués supplémentaires sans remplacer les 17 historiques.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),folder=path.join(__dirname,'resultats_19_scans');
const alignment=JSON.parse(fs.readFileSync(path.join(folder,'alignement.json'),'utf8'));
const extra=alignment.inputs.slice(17).map(r=>({name:r.name,text:fs.readFileSync(path.join(root,r.path),'utf8')}));
const presets=alignment.components.map(g=>({
 id:`19_groupe_${String(g.component).padStart(2,'0')}`,includeAB:true,
 title:`19 acquisitions · groupe ${g.component} · ${g.scans.length} scans`,
 description:'Anciennes captures + A/B. Poses estimées ; chaque groupe garde un repère séparé.',
 poses:JSON.parse(fs.readFileSync(path.join(folder,`groupe_${String(g.component).padStart(2,'0')}`,'poses.json'),'utf8'))
}));
presets.push({id:'19_exploratoire',includeAB:true,title:'19 scans · fusion exploratoire NON VALIDÉE',
 description:'Liens faibles inclus ; carte globale non validée, précision physique inconnue.',
 poses:JSON.parse(fs.readFileSync(path.join(folder,'exploratoire_19_scans/poses.json'),'utf8'))});
fs.writeFileSync(path.join(root,'visualisation/integration-19.js'),
 'window.LIDAR_AB_EXAMPLES = '+JSON.stringify(extra)+';\nwindow.LIDAR_POSE_PRESETS.push(...'+JSON.stringify(presets)+');\n');
console.log('A/B et huit jeux de poses supplémentaires embarqués.');
