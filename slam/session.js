(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('../visualisation/core.js'),require('../visualisation/grid.js'),require('../visualisation/grid-localisation.js'));
 else root.LidarSlam=factory(root.LidarCore,root.LidarGrid,root.LidarGridLocalisation);
})(globalThis,function(C,G,L){
 'use strict';
 const DEFAULTS={resolution:.1,x:-20,y:-20,width:40,height:40,windowXY:1,windowTheta:15,
  maxRange:12,minIntensity:0,minScore:.45,minCoverage:.6,minHitFraction:.55,maxFreeConflict:.2,minAlternativeGap:.015};
 function pose(p){if(!p||!['x','y','theta'].every(k=>Number.isFinite(p[k])))throw Error('Pose invalide.');return{x:p.x,y:p.y,theta:L.wrap(p.theta)};}
 function copyScan(scan){
  if(!scan||typeof scan.name!=='string')throw Error('Nom du scan manquant.');
  // Validate geometry and recompute identity; a renamed capture remains a duplicate.
  L.prepare(scan,{maxRange:12,minIntensity:0});
  return{name:scan.name,checksum:C.checksum(scan.points),points:scan.points.map(p=>p.slice()),qualities:scan.qualities?.slice(),pose:{x:0,y:0,theta:0}};
 }
 class Session{
  constructor(options={}){
   this.options={...DEFAULTS,...options};L.config(this.options);
   for(const k of ['minHitFraction','maxFreeConflict','minAlternativeGap'])if(!Number.isFinite(this.options[k])||this.options[k]<0||this.options[k]>1)throw Error('Seuil SLAM invalide.');
   this.grid=new G.Grid(this.options);this.accepted=[];this.events=[];this.lastPose=null;this.busy=false;
  }
  _start(scan,prior){
   if(this.busy)throw Error('Une estimation SLAM est déjà en cours.');
   if(this.accepted.length>=500||this.events.length>=1000)throw Error('Session pleine : exporter et démarrer une nouvelle session.');
   const source=copyScan(scan);
   if(this.accepted.some(s=>s.checksum===source.checksum))throw Error('Capture déjà intégrée, même si renommée.');
   const initial=pose(prior||this.lastPose||{x:0,y:0,theta:0});
   if(!this.grid.inside(initial.x,initial.y))throw Error('Origine initiale hors de la grille.');
   return{source,initial,priorSource:prior?'explicit':'previous_estimate',started:performance.now()};
  }
  _seed(job){
   const placed={...job.source,pose:{...job.initial}},next=G.Grid.load(this.grid.save());
   const insertion=next.integrate(placed,C.transform,this.options);
   if(insertion.clipped)throw Error('Premier scan tronqué : agrandir la grille avant de démarrer.');
   const event={index:this.events.length,name:placed.name,checksum:placed.checksum,status:'anchor',pose:placed.pose,
    initial:job.initial,priorSource:'frame_definition',elapsedMs:performance.now()-job.started,insertion,
    note:'Premier scan : origine choisie, sans localisation indépendante.'};
   this.grid=next;this.accepted.push(placed);this.lastPose={...placed.pose};this.events.push(event);return event;
  }
  _finish(job,result){
   const reasons=[],o=this.options,p=pose(result.pose),points=L.prepare(job.source,o),field=L.field(this.grid);
   let hits=0,conflicts=0,outside=0;
   for(const point of points){
    const q=C.transform(point,p);
    if(!this.grid.inside(...q)){outside++;continue;}
    const [x,y]=this.grid.cell(...q),i=this.grid.index(x,y),d=field.distance[i];
    if(d<=.2+1e-8)hits++;
    if(this.grid.cells[i]===G.FREE&&d>.3)conflicts++;
   }
   const diagnostics={score:result.after.score,coverage:result.after.coverage,hitFraction:hits/points.length,
    freeConflictFraction:conflicts/points.length,outsideFraction:outside/points.length,alternativeGap:result.alternativeGap};
   if(diagnostics.score<o.minScore)reasons.push('score insuffisant');
   if(diagnostics.coverage<o.minCoverage)reasons.push('zone connue insuffisante');
   if(diagnostics.hitFraction<o.minHitFraction)reasons.push('trop peu d’impacts proches des obstacles');
   if(diagnostics.freeConflictFraction>o.maxFreeConflict)reasons.push('contradictions avec l’espace libre');
   if(diagnostics.outsideFraction>0)reasons.push('impacts hors grille');
   if(result.alternativeGap!==null&&result.alternativeGap<o.minAlternativeGap)reasons.push('pose concurrente ambiguë');
   if(Math.abs(p.x-job.initial.x)>o.windowXY-.026||Math.abs(p.y-job.initial.y)>o.windowXY-.026||Math.abs(L.wrap(p.theta-job.initial.theta))>o.windowTheta-.26)reasons.push('solution au bord de la fenêtre');
   const event={index:this.events.length,name:job.source.name,checksum:job.source.checksum,initial:job.initial,
    priorSource:job.priorSource,status:reasons.length?'rejected':'accepted',pose:p,diagnostics,reasons,
    match:result,elapsedMs:performance.now()-job.started};
   if(!reasons.length){
    // Localise on the OLD map. Prepare the new map separately; commit only on success.
    const placed={...job.source,pose:p},next=G.Grid.load(this.grid.save());
    event.insertion=next.integrate(placed,C.transform,o);
    this.grid=next;this.accepted.push(placed);this.lastPose={...p};
   }
   this.events.push(event);return event;
  }
  add(scan,prior=null){
   const job=this._start(scan,prior);if(!this.accepted.length)return this._seed(job);
   this.busy=true;try{return this._finish(job,L.match(this.grid,job.source,job.initial,this.options));}finally{this.busy=false;}
  }
  async addAsync(scan,prior=null,progress=()=>{},cancelled=()=>false){
   const job=this._start(scan,prior);if(cancelled())throw Error('SLAM annulé.');if(!this.accepted.length)return this._seed(job);
   this.busy=true;
   try{
    const result=await L.matchAsync(this.grid,job.source,job.initial,this.options,progress,cancelled);
    if(cancelled())throw Error('SLAM annulé.');
    return this._finish(job,result);
   }finally{this.busy=false;}
  }
  save(){
   if(this.busy)throw Error('Attendre la fin du calcul avant l’export.');
   return JSON.stringify({format:'tp-lidar-slam-session-v1',method:'incremental-scan-to-grid-before-insertion',
    units:'metres/degrees-counterclockwise',options:this.options,grid:JSON.parse(this.grid.save()),accepted:this.accepted,
    events:this.events,lastPose:this.lastPose,limitations:'SLAM frontal local sans odométrie ni fermeture de boucle. Poses estimées, incertitude physique inconnue. Complétude de la salle non certifiée.'});
  }
  static load(text){
   const d=JSON.parse(text);
   if(d.format!=='tp-lidar-slam-session-v1'||d.method!=='incremental-scan-to-grid-before-insertion'||d.units!=='metres/degrees-counterclockwise'||!Array.isArray(d.accepted)||!Array.isArray(d.events)||d.accepted.length>500||d.events.length>1000)throw Error('Session SLAM invalide.');
   const s=new Session(d.options),stored=G.Grid.load(JSON.stringify(d.grid)),identities=new Set();
   for(const raw of d.accepted){
    const scan=copyScan(raw);if(identities.has(scan.checksum))throw Error('Doublon dans la session.');identities.add(scan.checksum);
    scan.pose=pose(raw.pose);s.grid.integrate(scan,C.transform,s.options);s.accepted.push(scan);
   }
   if(s.grid.save()!==stored.save())throw Error('Carte incohérente avec les scans et poses de la session.');
   const entries=d.events.filter(e=>e.status==='anchor'||e.status==='accepted');
   if(entries.length!==s.accepted.length||entries.some((e,i)=>e.checksum!==s.accepted[i].checksum||JSON.stringify(pose(e.pose))!==JSON.stringify(s.accepted[i].pose)))throw Error('Historique incohérent.');
   s.events=d.events;s.lastPose=s.accepted.length?{...s.accepted.at(-1).pose}:null;
   if(JSON.stringify(s.lastPose)!==JSON.stringify(d.lastPose))throw Error('Dernière pose incohérente.');return s;
  }
 }
 return{Session,DEFAULTS};
});
