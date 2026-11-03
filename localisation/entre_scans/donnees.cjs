const fs=require('node:fs'),path=require('node:path'),M=require('../../visualisation/scan-matching.js'),C=require('../../visualisation/core.js'),{scene}=require('../grid/scene.cjs');
const INITIALS=[
 {id:'proche_a',level:'proche',dx:.113,dy:-.087,angle:2.3},{id:'proche_b',level:'proche',dx:-.127,dy:.093,angle:-2.2},
 {id:'moyenne_a',level:'moyenne',dx:.437,dy:-.363,angle:7.3},{id:'moyenne_b',level:'moyenne',dx:-.417,dy:.453,angle:-8.2},
 {id:'difficile_a',level:'difficile',dx:.913,dy:-.787,angle:14.3},{id:'difficile_b',level:'difficile',dx:-.863,dy:.847,angle:-14.2}
];
function build(){
 const pairs=[],s=scene(),poses=[[{x:1.8,y:-1.5,theta:22},{x:1.95,y:-1.4,theta:27}],[{x:-2,y:1.5,theta:-35},{x:-1.7,y:1.7,theta:-29}],[{x:-2,y:-2,theta:110},{x:-1.75,y:-1.85,theta:118}]];
 poses.forEach(([a,b],i)=>pairs.push({id:`S${i+1}`,dataset:'simulation',reference:s.scan(a,360,.004,101+i),query:s.scan(b,360,.004,201+i),truth:M.relative(a,b),spacingM:Math.hypot(a.x-b.x,a.y-b.y),referenceType:'known_simulated_poses',uncertainty:'Poses exactes du simulateur ; bruit de portée indépendant déterministe ±4 mm.'}));
 const root=path.resolve(__dirname,'../..'),alignment=JSON.parse(fs.readFileSync(path.join(root,'traitement_complet/resultats/alignement.json'),'utf8'));
 for(const [number,component]of [1,2,4].entries()){
  const group=alignment.components.find(g=>g.component===component);let closest=null;
  for(let i=0;i<group.scans.length;i++)for(let j=i+1;j<group.scans.length;j++){const a=group.scans[i],b=group.scans[j],distance=Math.hypot(a.pose.x-b.pose.x,a.pose.y-b.pose.y);if(!closest||distance<closest.distance)closest={a,b,distance};}
  const {a,b,distance}=closest,read=r=>{const input=alignment.inputs[r.index];return C.parseScan(fs.readFileSync(path.join(root,input.path),'utf8'),input.name);};
  const diagnostics=alignment.pairwise.find(p=>(p.i===a.index&&p.j===b.index)||(p.i===b.index&&p.j===a.index));
  pairs.push({id:`R${number+1}`,dataset:'reel',reference:read(a),query:read(b),truth:M.relative(a.pose,b.pose),spacingM:distance,component,sourcePaths:{reference:alignment.inputs[a.index].path,query:alignment.inputs[b.index].path},referenceType:'TP1_estimated_relative_pose_not_measured',uncertainty:'Incertitude physique inconnue : aucune pose mesurée ni covariance de mesure disponible. Les résidus de recalage ne sont pas une incertitude de pose.',registrationDiagnostics:diagnostics?{inlierRmseM:diagnostics.inlier_rmse_m,movingOverlap:diagnostics.moving_overlap,fixedOverlap:diagnostics.fixed_overlap,accepted:diagnostics.accepted}:null});
 }
 return{pairs,initials:INITIALS};
}
module.exports={build,INITIALS};
