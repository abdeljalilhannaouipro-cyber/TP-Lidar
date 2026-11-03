const fs=require('node:fs'),path=require('node:path'),M=require('../../visualisation/scan-matching.js'),C=require('../../visualisation/core.js'),{INITIALS}=require('./donnees.cjs');
const folder=path.join(__dirname,'campagne_mesuree'),measurement=JSON.parse(fs.readFileSync(path.join(folder,'mesures.json'),'utf8'));
if(!measurement.reference.file||!measurement.query.file||!measurement.measuredRelativePose||measurement.frameDefinitionVerified!==true)throw new Error('Captures ou pose physique déclarée incomplètes : ne pas inventer une référence.');
const read=r=>C.parseScan(fs.readFileSync(path.join(folder,r.file),'utf8'),path.basename(r.file)),reference=read(measurement.reference),query=read(measurement.query),truth=measurement.measuredRelativePose;
if(!['x','y','theta'].every(k=>Number.isFinite(truth[k])))throw new Error('Pose de référence non finie.');
const bounds=measurement.uncertaintyBounds,knownBounds=bounds&&['xM','yM','angleDeg'].every(k=>Number.isFinite(bounds[k])&&bounds[k]>=0),rows=[],seeds=[20261103,20261104,20261105];
const wrap=a=>((a+180)%360+360)%360-180,options={windowXY:1,windowTheta:15,voxelM:.1,capM:.5,stepXY:.1,stepTheta:1};
function uncertainty(error){
 if(!knownBounds)return{status:'unknown',reason:'Placement and orientation uncertainty not quantified by operator; graduation alone is insufficient.'};
 const delta=Math.hypot(bounds.xM,bounds.yM),pmin=Math.max(0,error.positionM-delta),pmax=error.positionM+delta,amin=Math.max(0,error.angleDeg-bounds.angleDeg),amax=Math.min(180,error.angleDeg+bounds.angleDeg);
 return{status:pmax<=.2&&amax<=2?'robust_pass':pmin>.2||amin>2?'robust_fail':'indeterminate',positionIntervalM:[pmin,pmax],angleIntervalDeg:[amin,amax],kind:'Conservative bounds, not a statistical confidence interval.'};
}
for(const start of INITIALS)for(const method of M.METHODS)for(const seed of method==='annealing'?seeds:[20261103]){
 const initial={x:truth.x+start.dx,y:truth.y+start.dy,theta:wrap(truth.theta+start.angle)};let row;
 try{const result=M.match(reference,query,initial,{...options,method,seed}),error={positionM:Math.hypot(result.pose.x-truth.x,result.pose.y-truth.y),angleDeg:Math.abs(wrap(result.pose.theta-truth.theta))};row={initialId:start.id,level:start.level,initial,method,seed,status:'returned',result,nominalError:error,successNominal:error.positionM<=.2&&error.angleDeg<=2,uncertainty:uncertainty(error)};}
 catch(e){row={initialId:start.id,level:start.level,initial,method,seed,status:'rejected',result:null,successNominal:false,failure:e.message,uncertainty:{status:knownBounds?'rejected':'unknown'}};}
 rows.push(row);console.log(`${start.id} ${method} ${seed} ${row.successNominal?'NOMINAL_OK':'NOMINAL_FAIL'} ${row.result?.pose?JSON.stringify(row.result.pose):row.failure}`);
}
const summaries=M.METHODS.map(method=>{const cases=rows.filter(r=>r.method===method),valid=cases.filter(r=>r.result),mean=f=>valid.length?valid.reduce((s,r)=>s+f(r),0)/valid.length:null;return{method,trials:cases.length,returned:valid.length,rejected:cases.length-valid.length,successNominal:cases.filter(r=>r.successNominal).length,meanPositionM:mean(r=>r.nominalError.positionM),meanAngleDeg:mean(r=>r.nominalError.angleDeg),meanTimeMs:mean(r=>r.result.elapsedMs),referenceUncertainty:knownBounds?'bounded':'unknown'};});
const report={format:'tp2-operator-measured-scan-pair-evaluation-v1',created:new Date().toISOString(),measurement,reference:{name:reference.name,checksum:reference.checksum},query:{name:query.name,checksum:query.checksum},thresholds:{positionM:.2,angleDeg:2},referenceType:'operator_declared_nominal_physical_placement',knownUncertaintyBounds:!!knownBounds,options,summaries,rows,caveat:'Nominal errors relative to operator-declared 0.50 m / 0 / 0 deg. Unknown uncertainty is not zero; nominal success is not a certified physical success rate.'};
fs.writeFileSync(path.join(folder,'evaluation.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(folder,'evaluation.csv'),['initial_id,level,method,seed,status,position_error_m,angle_error_deg,time_ms,success_nominal,uncertainty',...rows.map(r=>[r.initialId,r.level,r.method,r.seed,r.status,r.nominalError?.positionM??'',r.nominalError?.angleDeg??'',r.result?.elapsedMs??'',r.successNominal,r.uncertainty.status].join(','))].join('\n'));
const exampleInitial=INITIALS.find(s=>s.id==='moyenne_a'),demoRows=rows.filter(r=>r.initialId==='moyenne_a'&&r.seed===20261103).map(r=>({...r,success:r.successNominal,finalError:r.nominalError,initialError:{positionM:Math.hypot(exampleInitial.dx,exampleInitial.dy),angleDeg:Math.abs(exampleInitial.angle)},elapsedMs:r.result?.elapsedMs??0}));
fs.writeFileSync(path.join(folder,'exemple.json'),JSON.stringify({id:'A_B',reference,query,initial:demoRows[0].initial,results:demoRows,measurement}));
fs.writeFileSync(path.resolve(__dirname,'../../visualisation/scan-matching-measured-example.js'),'window.LIDAR_SCAN_MATCHING_MEASURED_EXAMPLE='+JSON.stringify({reference,query,initial:demoRows[0].initial,operatorNominalPose:truth,pairId:'A_B',measurementNote:measurement.uncertaintyStatus})+';\n');
const graphics={summaries:summaries.map(s=>({...s,dataset:'reel',byInitialLevel:['proche','moyenne','difficile'].map(level=>{const subset=rows.filter(r=>r.method===s.method&&r.level===level);return{level,trials:subset.length,success:subset.filter(r=>r.successNominal).length,successRate:subset.filter(r=>r.successNominal).length/subset.length};})}))};
fs.writeFileSync(path.join(folder,'graphiques.json'),JSON.stringify(graphics));
console.log(JSON.stringify(summaries,null,2));
