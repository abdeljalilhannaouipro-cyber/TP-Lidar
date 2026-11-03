// Integration of the actual page handlers in a minimal DOM, not a visual browser test.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../../visualisation'),nodes=[];
const context2d={};for(const name of ['clearRect','fillRect','beginPath','arc','fill','stroke','fillText','moveTo','lineTo','strokeRect','drawImage','setTransform','putImageData'])context2d[name]=()=>{};
context2d.createImageData=(w,h)=>({data:new Uint8ClampedArray(w*h*4)});
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.value='';this.textContent='';this.dataset={};this.style={setProperty(){}};this.className='';this.classList={toggle:()=>{}};this.parentElement={};this.validity={valid:true};nodes.push(this);}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}
 setAttribute(key,v){this[key]=v;}removeAttribute(key){delete this[key];}addEventListener(){}focus(){}click(){if(this.onclick)this.onclick();}
 getContext(){return context2d;}getBoundingClientRect(){return{left:0,top:0,width:900,height:650};}
 querySelector(){return new Element('input');}
}
const html=fs.readFileSync(path.join(base,'index.html'),'utf8'),ids={};
for(const match of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new Element(match[1]);const value=/\bvalue="([^"]*)"/.exec(match[0]);if(value)e.value=value[1];e.checked=/\bchecked\b/.test(match[0]);ids[match[2]]=e;}
Object.assign(ids.viewMode,{value:'points'});ids.dragMode.value='pan';ids.angleMode.value='cw';
const sandbox={console,performance,Blob,Uint8Array,Float32Array,Uint8ClampedArray,URLSearchParams,setTimeout,location:{search:''},ResizeObserver:class{observe(){}},URL:{createObjectURL(){return'blob:test';},revokeObjectURL(){}},devicePixelRatio:1,
 document:{getElementById:id=>{assert.ok(ids[id],`Unknown element ${id}`);return ids[id];},createElement:tag=>new Element(tag),querySelectorAll:()=>nodes.filter(n=>n.className==='card'),querySelector:()=>null},addEventListener(){}};
sandbox.window=sandbox;vm.createContext(sandbox);
for(const file of ['core.js','examples.js','new-examples.js','pose-presets.js','integration-19.js','grid.js','segments.js','vector-map.js','grid-localisation.js','grid-brute-force.js','grid-optimisation.js','grid-localisation-example.js','viewer.js','segments-ui.js','vector-ui.js','grid-localisation-ui.js','vector-localisation.js','vector-gradient.js','vector-multiresolution.js','vector-annealing.js','vector-direct.js','vector-localisation-example.js','vector-localisation-ui.js','scan-matching.js','scan-matching-example.js','scan-matching-measured-example.js','scan-matching-ui.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),sandbox,{filename:file});
const run=code=>vm.runInContext(code,sandbox);
async function main(){
 ids.examples.click();assert.equal(run('state.scans.length'),6);
 ids.gridNew.click();assert.equal(run('state.grid.counts().unknown'),90000);
 ids.gridSelected.click();assert.equal(run('state.grid.scans.length'),1);assert.ok(run('state.grid.counts().occupied')>0);
 ids.gridSelected.click();assert.equal(run('state.grid.scans.length'),1);
 run('state.scans[5].pose.x=1');ids.gridSelected.click();assert.equal(run('state.grid.scans.length'),1);assert.ok(ids.notice.textContent.includes('autre pose'));
 run('state.scans[5].pose.x=0;state.selected=4');ids.gridSelected.click();assert.equal(run('state.grid.scans.length'),2);
 const saved=run('state.grid.save()');ids.gridNew.click();assert.equal(run('state.grid.scans.length'),0);
 ids.gridFile.files=[{text:async()=>saved}];await ids.gridFile.onchange({target:ids.gridFile});assert.equal(run('state.grid.scans.length'),2);
 ids.viewMode.value='grid';ids.viewMode.onchange();assert.ok(ids.gridStatus.textContent.includes('2 scan(s)'));
 run('state.selected=3');ids.gridSelected.click();assert.equal(run('state.grid.scans.length'),3);
 ids.segExtractSelected.click();assert.ok(run('state.segments.length')>0);assert.equal(ids.viewMode.value,'segmentsPoints');
 ids.segCase.value='cross';ids.segDemo.click();assert.equal(run('state.segments.length'),2);
 const cutterBefore=run('JSON.stringify(state.segments[1].segment)');ids.segCut.click();assert.equal(run('LidarSegments.length(state.segments[0].segment)'),3);assert.equal(run('JSON.stringify(state.segments[1].segment)'),cutterBefore);
 ids.segUndo.click();assert.equal(run('LidarSegments.length(state.segments[0].segment)'),4);
 for(const example of ['endpoint','outsideB','collinear']){ids.segCase.value=example;ids.segDemo.click();const before=run('JSON.stringify(state.segments)');ids.segCut.click();assert.equal(run('JSON.stringify(state.segments)'),before);}
 ids.segCase.value='tie';ids.segDemo.click();ids.segCut.click();assert.equal(run('state.segments[0].segment.a[0]'),0);assert.equal(run('state.segments[0].segment.b[0]'),2);
 ids.segCase.value='merge';ids.segDemo.click();ids.segMerge.click();assert.equal(run('state.segments.length'),1);assert.ok(run('LidarSegments.length(state.segments[0].segment)')>3.9);
 const segmentSaved=run('LidarSegments.save(state.segments)');ids.segCase.value='cross';ids.segDemo.click();ids.segFile.files=[{text:async()=>segmentSaved}];await ids.segFile.onchange({target:ids.segFile});assert.equal(run('state.segments.length'),1);
 ids.vecNew.click();assert.equal(run('state.vector.features.length'),0);assert.equal(run('state.vector.options.cleanup'),true);
 run('state.selected=3');ids.vecSelected.click();assert.equal(run('state.vector.scans.length'),1);assert.ok(run('state.vector.features.length')>0);
 ids.vecSelected.click();assert.equal(run('state.vector.scans.length'),1);
 const mapSaved=run('state.vector.save()');ids.vecNew.click();ids.vecFile.files=[{text:async()=>mapSaved}];await ids.vecFile.onchange({target:ids.vecFile});assert.equal(run('state.vector.scans.length'),1);
 run('state.selected=4;state.scans[4].pose={x:-.01958,y:.05924,theta:-.97338}');ids.vecSelected.click();assert.equal(run('state.vector.scans.length'),2);assert.ok(run('state.vector.stats().confirmed')>0);
 const vectorBefore=run('state.vector.save()');run('state.scans[4].pose.x=1');ids.vecSelected.click();assert.equal(run('state.vector.save()'),vectorBefore);assert.ok(ids.notice.textContent.includes('autre pose'));
 ids.vecToWorkshop.click();assert.equal(run('state.segments.length'),run('state.vector.features.length'));
 const workshopCount=run('state.segments.length');ids.vecSeed.click();assert.equal(run('state.vector.features.length'),workshopCount);assert.equal(run('state.vector.scans.length'),0);
 ids.examplesAll.click();assert.equal(run('state.scans.length'),17);assert.equal(run('state.scans.reduce((n,s)=>n+s.points.length,0)'),7745);
 ids.posePreset.value='groupe_01';ids.applyPreset.click();assert.equal(run('state.scans.filter(s=>s.visible).length'),5);
 ids.posePreset.value='exploratoire_17_scans';ids.applyPreset.click();assert.equal(run('state.scans.filter(s=>s.visible).length'),17);assert.ok(ids.notice.textContent.includes('Liens faibles'));
 ids.locDemo.click();assert.equal(run('state.grid.scans.length'),4);
 assert.equal(ids.locMethod.value,'exhaustive');
 const untouchedGrid=run('state.grid.save()'),initialPose=run('JSON.stringify(state.scans.find(s=>s.id===state.selected).pose)');
 await ids.locRun.onclick();assert.ok(run('localisationResult'),ids.notice.textContent);assert.equal(run('JSON.stringify(state.scans.find(s=>s.id===state.selected).pose)'),initialPose);
 assert.equal(run('localisationResult.result.tested'),13671);assert.equal(run('localisationResult.result.complete'),true);
 ids.locMethod.value='multilevel';ids.locMethod.onchange();await ids.locRun.onclick();assert.equal(run('localisationResult.result.method'),'coarse-to-fine-correlative-chamfer');
 for(const method of ['gradient','pyramid','annealing']){
  ids.locMethod.value=method;ids.locMethod.onchange();await ids.locRun.onclick();assert.ok(run('localisationResult'),ids.notice.textContent);assert.equal(run('localisationResult.result.method'),method);
  assert.equal(run('JSON.stringify(state.scans.find(s=>s.id===state.selected).pose)'),initialPose);assert.equal(run('state.grid.save()'),untouchedGrid);
 }
 ids.locMethod.value='gradient';ids.locMethod.onchange();await ids.locRun.onclick();
 assert.equal(ids.locApply.disabled,false);assert.ok(ids.locReport.textContent.includes('Pose proposée'));
 ids.locApply.click();assert.notEqual(run('JSON.stringify(state.scans.find(s=>s.id===state.selected).pose)'),initialPose);assert.equal(run('state.grid.save()'),untouchedGrid);
 ids.locDemo.click();const pending=ids.locRun.onclick();ids.locCancel.click();await pending;assert.ok(ids.notice.textContent.includes('annulée'));assert.equal(run('localisationResult'),null);
 await ids.locRun.onclick();run('state.grid.version++');ids.locApply.click();assert.ok(ids.notice.textContent.includes('périmé'));
 ids.locDemo.click();const changed=ids.locRun.onclick();run('state.grid.version++');await changed;assert.equal(run('localisationResult'),null);assert.ok(ids.notice.textContent.includes('modifié'));
 ids.locDemo.click();run('state.grid.scans.push({checksum:state.scans.find(s=>s.id===state.selected).checksum})');await ids.locRun.onclick();assert.ok(ids.notice.textContent.includes('déjà'));
 ids.vlDemo.click();assert.equal(run('state.vector.scans.length'),4);assert.equal(ids.viewMode.value,'vectorPoints');
 const vectorReference=run('state.vector.save()'),vectorInitial=run('JSON.stringify(state.scans.find(s=>s.id===state.selected).pose)');
 assert.equal(ids.vlMethod.value,'exhaustive');
 ids.vlXY.value='0.2';ids.vlAngle.value='3';await ids.vlRun.onclick();assert.ok(run('vectorLocResult'),ids.notice.textContent);assert.equal(run('vectorLocResult.result.tested'),175);
 assert.equal(run('JSON.stringify(state.scans.find(s=>s.id===state.selected).pose)'),vectorInitial);ids.vlApply.click();assert.equal(run('state.vector.save()'),vectorReference);assert.notEqual(run('JSON.stringify(state.scans.find(s=>s.id===state.selected).pose)'),vectorInitial);
 ids.vlDemo.click();ids.vlMethod.value='gradient';ids.vlMethod.onchange();ids.vlXY.value='1';ids.vlAngle.value='15';await ids.vlRun.onclick();assert.ok(run('vectorLocResult'),ids.notice.textContent);assert.equal(run('vectorLocResult.result.method'),'gradient-point-to-finite-segments');assert.equal(run('state.vector.save()'),vectorReference);assert.equal(run('JSON.stringify(state.scans.find(s=>s.id===state.selected).pose)'),vectorInitial);
 ids.vlMethod.value='multiresolution';ids.vlMethod.onchange();ids.vlXY.value='0.2';ids.vlAngle.value='3';await ids.vlRun.onclick();assert.ok(run('vectorLocResult'),ids.notice.textContent);assert.equal(run('vectorLocResult.result.method'),'multiresolution-point-to-finite-segments');assert.equal(run('vectorLocResult.result.levels.length'),3);assert.equal(run('state.vector.save()'),vectorReference);assert.equal(ids.vlIterations.disabled,true);assert.equal(ids.vlStepXY.disabled,true);
 ids.vlMethod.value='gradient';ids.vlMethod.onchange();ids.vlXY.value='1';ids.vlAngle.value='15';
 ids.vlMethod.value='annealing';ids.vlMethod.onchange();ids.vlChains.value='1';ids.vlAnnealIterations.value='40';await ids.vlRun.onclick();assert.ok(run('vectorLocResult'),ids.notice.textContent);assert.equal(run('vectorLocResult.result.method'),'annealing-point-to-finite-segments');assert.equal(run('vectorLocResult.result.attemptedMoves'),40);assert.equal(run('state.vector.save()'),vectorReference);assert.equal(run('JSON.stringify(state.scans.find(s=>s.id===state.selected).pose)'),vectorInitial);
 ids.vlMethod.value='gradient';ids.vlMethod.onchange();
 ids.vlMethod.value='direct';ids.vlMethod.onchange();await ids.vlRun.onclick();assert.ok(run('vectorLocResult'),ids.notice.textContent);assert.equal(run('vectorLocResult.result.method'),'direct-segment-orientation-and-translation');assert.equal(run('vectorLocResult.result.tested'),2);assert.equal(run('state.vector.save()'),vectorReference);assert.equal(run('JSON.stringify(state.scans.find(s=>s.id===state.selected).pose)'),vectorInitial);
 ids.vlMethod.value='gradient';ids.vlMethod.onchange();
 ids.vlDemo.click();const vectorPending=ids.vlRun.onclick();ids.vlCancel.click();await vectorPending;assert.ok(ids.notice.textContent.includes('annulée'));assert.equal(run('vectorLocResult'),null);
 await ids.vlRun.onclick();run('state.vector.version++');ids.vlApply.click();assert.ok(ids.notice.textContent.includes('périmé'));
 ids.vlDemo.click();run('state.vector.scans.push({checksum:state.scans.find(s=>s.id===state.selected).checksum})');await ids.vlRun.onclick();assert.ok(ids.notice.textContent.includes('déjà'));
 ids.s2Demo.click();assert.equal(run('state.scans.filter(s=>s.visible).length'),2);ids.s2Method.value='gradient';
 run('state.scans.find(s=>String(s.id)===$("s2Ref").value).pose={x:3,y:-2,theta:40}; state.scans.find(s=>s.id===state.selected).pose=LidarScanMatching.compose(state.scans.find(s=>String(s.id)===$("s2Ref").value).pose,LIDAR_SCAN_MATCHING_EXAMPLE.initial)');ids.s2Copy.click();
 const fixedPose=run('JSON.stringify(state.scans.find(s=>String(s.id)===$("s2Ref").value).pose)'),queryPose=run('JSON.stringify(state.scans.find(s=>s.id===state.selected).pose)');
 await ids.s2Run.onclick();assert.ok(run('scanMatchResult'),ids.notice.textContent);assert.equal(run('JSON.stringify(state.scans.find(s=>s.id===state.selected).pose)'),queryPose);
 const expectedPose=run('JSON.stringify(LidarScanMatching.compose(scanMatchResult.referencePose,scanMatchResult.result.pose))');ids.s2Apply.click();assert.equal(run('JSON.stringify(state.scans.find(s=>s.id===state.selected).pose)'),expectedPose);assert.equal(run('JSON.stringify(state.scans.find(s=>String(s.id)===$("s2Ref").value).pose)'),fixedPose);
 ids.s2Demo.click();const scanPending=ids.s2Run.onclick();ids.s2Cancel.click();await scanPending;assert.ok(ids.notice.textContent.includes('annulée'));assert.equal(run('scanMatchResult'),null);
 await ids.s2Run.onclick();run('scanMatchResult.reference.pose.x+=1');ids.s2Apply.click();assert.ok(ids.notice.textContent.includes('périmé'));
 ids.s2Demo.click();ids.s2Ref.value=String(run('state.selected'));await ids.s2Run.onclick();assert.ok(ids.notice.textContent.includes('différentes'));
 ids.s2MeasuredDemo.click();assert.equal(run('state.scans.find(s=>s.id===state.selected).points.length'),456);assert.equal(run('state.scans.find(s=>String(s.id)===$("s2Ref").value).points.length'),456);assert.ok(ids.s2Report.textContent.includes('incertitude totale'));
 ids.examples19.click();assert.equal(run('state.scans.length'),19);ids.posePreset.value='19_groupe_01';ids.applyPreset.click();assert.equal(run('state.scans.filter(s=>s.visible).length'),7);assert.equal(run('state.scans.filter(s=>s.visible).reduce((n,s)=>n+s.points.length,0)'),3196);
 console.log('UI handler integration passed: TP1, grid, vector and between-scan matching; frame composition, explicit apply, preserved references, cancellation, stale results and duplicates. Visual rendering not tested.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
