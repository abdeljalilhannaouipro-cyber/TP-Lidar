// Reconstruit les poses rechargeables embarquées après alignement.py et recalculer.cjs.
const fs=require('node:fs'),path=require('node:path');
const folder=path.join(__dirname,'resultats'),alignment=JSON.parse(fs.readFileSync(path.join(folder,'alignement.json'),'utf8'));
const presets=alignment.components.map(group=>{
 const id=`groupe_${String(group.component).padStart(2,'0')}`;
 return{id,title:`Groupe ${group.component} · ${group.scans.length} scan(s) · repère séparé`,description:`Référence : ${group.reference}. Poses estimées ; ce repère n’est pas celui des autres groupes.`,poses:JSON.parse(fs.readFileSync(path.join(folder,id,'poses.json'),'utf8'))};
});
presets.push({id:'exploratoire_17_scans',title:'17 scans · fusion exploratoire NON VALIDÉE',description:'Liens faibles ou ambigus inclus. Ne pas utiliser cette fusion comme carte de salle validée.',poses:JSON.parse(fs.readFileSync(path.join(folder,'exploratoire_17_scans','poses.json'),'utf8'))});
fs.writeFileSync(path.join(__dirname,'../visualisation/pose-presets.js'),'window.LIDAR_POSE_PRESETS = '+JSON.stringify(presets)+';\n');
console.log(`${presets.length} groupes de poses embarqués.`);
