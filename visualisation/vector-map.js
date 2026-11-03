(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./segments.js'),require('./core.js'));else root.LidarVector=factory(root.LidarSegments,root.LidarCore);})(globalThis,function(S,C){
 'use strict';
 const LIMIT=3000;
 const DEFAULTS={gap:.30,residual:.05,minPoints:5,minLength:.15,angularDeg:8,positionM:.12,maxRange:12,minIntensity:0,cleanup:true,clearance:.15,minCrossings:3,maxMisses:3};
 const copy=value=>JSON.parse(JSON.stringify(value));
 function options(input={}){
  const result={...DEFAULTS};for(const key of Object.keys(DEFAULTS))if(key in input)result[key]=input[key];
  S.extract([],{gap:result.gap,residual:result.residual,minPoints:result.minPoints,minLength:result.minLength});
  S.proximity(S.segment([0,0],[1,0]),S.segment([0,0],[1,0]),result);
  if(!Number.isFinite(result.maxRange)||result.maxRange<=0||!Number.isFinite(result.minIntensity)||result.minIntensity<0||result.minIntensity>255||typeof result.cleanup!=='boolean'||!Number.isFinite(result.clearance)||result.clearance<=S.EPS||!Number.isInteger(result.minCrossings)||result.minCrossings<1||!Number.isInteger(result.maxMisses)||result.maxMisses<1)throw new Error('Paramètres de carte vectorielle invalides.');
  return result;
 }
 function pose(scan){const p=scan.pose;if(!p||![p.x,p.y,p.theta].every(Number.isFinite))throw new Error('Pose de scan invalide.');return{x:p.x,y:p.y,theta:p.theta};}
 function prepare(scan,config){
  if(typeof scan.name!=='string'||typeof scan.checksum!=='string'||!Array.isArray(scan.points)||scan.points.length>10000)throw new Error('Scan invalide ou trop grand (maximum 10000 points).');
  const origin=pose(scan),points=[];let filtered=0;
  for(let i=0;i<scan.points.length;i++){
   const p=scan.points[i];if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw new Error('Point de scan invalide.');
   const range=Math.hypot(...p),quality=scan.qualities?.[i];
   if(range<=0||range>config.maxRange||(config.minIntensity>0&&(!Number.isFinite(quality)||quality<config.minIntensity))){filtered++;continue;}
   points.push(C.transform(p,origin));
  }
  if(!points.length)throw new Error('Aucun point après filtrage.');
  return{origin,points,filtered};
 }
 class VectorMap{
  constructor(config={}){this.options=options(config);this.features=[];this.scans=[];this.nextId=1;this.version=0;}
  seed(segments){
   if(this.scans.length||this.features.length)throw new Error('Créer une carte vide avant d’importer les segments initiaux.');
   if(!Array.isArray(segments)||segments.length>LIMIT)throw new Error('Trop de segments initiaux.');
   const features=segments.map((segment,i)=>{if(S.length(segment)<this.options.minLength)throw new Error('Segment initial trop court.');return{id:i+1,segment:S.segment(segment.a,segment.b),supportScans:[],misses:0,lastSeen:0,lastFree:0};});
   this.features=features;this.nextId=features.length+1;this.version++;
  }
  integrate(scan){
   const currentPose=pose(scan),previous=this.scans.find(s=>s.name===scan.name&&s.checksum===scan.checksum);
   if(previous){if(['x','y','theta'].some(k=>previous.pose[k]!==currentPose[k]))throw new Error('Scan déjà intégré avec une autre pose : reconstruire la carte.');return{duplicate:true,features:this.features.length};}
   if(this.scans.length>=10000)throw new Error('Historique trop grand.');
   const data=prepare(scan,this.options),incoming=S.extract(data.points,this.options),step=this.scans.length+1,config=this.options;
   const originals=copy(this.features);let features=[],nextId=this.nextId,trimmed=0,removed=0,contradicted=0,merges=0,added=0;
   // Only unsupported OLD features may be contradicted by this scan's free rays.
   for(const feature of originals){
    const supported=incoming.some(segment=>S.proximity(feature.segment,segment,config).close);
    if(config.cleanup&&!supported){
     const rays=[],bearings=new Set();
     for(const impact of data.points){
      const ray=S.segment([data.origin.x,data.origin.y],impact),rayLength=S.length(ray);if(rayLength<=S.EPS)continue;
      const hit=S.intersection(feature.segment,ray);
      if(!hit.point||hit.alongB<=S.EPS||rayLength-hit.alongB<=config.clearance||hit.alongA<=S.EPS||S.length(feature.segment)-hit.alongA<=S.EPS)continue;
      const bearing=Math.round(Math.atan2(impact[1]-data.origin.y,impact[0]-data.origin.x)*180/Math.PI/.25);
      if(bearings.has(bearing))continue;bearings.add(bearing);rays.push({ray,along:hit.alongA});
     }
     if(rays.length>=config.minCrossings){
      contradicted++;feature.misses++;feature.lastFree=step;
      if(feature.misses>=config.maxMisses){removed++;continue;}
      rays.sort((a,b)=>a.along-b.along);
      const result=S.cutLongest(feature.segment,rays[Math.floor((rays.length-1)/2)].ray);
      if(result.changed){feature.segment=result.segment;trimmed++;}
      if(S.length(feature.segment)<config.minLength){removed++;continue;}
     }
    }
    features.push(feature);
   }
   // Add/merge observations. Each scan contributes at most once to a support set.
   for(const segment of incoming){
    let geometry=S.segment(segment.a,segment.b),id=null,supports=new Set([step]),again=true;
    while(again){again=false;
     for(let i=0;i<features.length;i++){
      const old=features[i];if(!S.proximity(old.segment,geometry,config).close)continue;
      geometry=S.merge(old.segment,geometry,config);id=id===null?old.id:Math.min(id,old.id);
      for(const source of old.supportScans)supports.add(source);
      features.splice(i,1);merges++;again=true;break;
     }
    }
    if(id===null){id=nextId++;added++;}
    features.push({id,segment:geometry,supportScans:[...supports].sort((a,b)=>a-b),misses:0,lastSeen:step,lastFree:0});
    if(features.length>LIMIT)throw new Error('Trop de primitives : augmenter les seuils ou limiter les scans.');
   }
   const report={duplicate:false,step,accepted:data.points.length,filtered:data.filtered,extracted:incoming.length,added,merges,contradicted,trimmed,removed,before:this.features.length,after:features.length};
   // Commit only after every calculation succeeds.
   this.features=features;this.nextId=nextId;
   this.scans.push({name:scan.name,checksum:scan.checksum,pose:data.origin,report:copy(report)});this.version++;
   return report;
  }
  save(){return JSON.stringify({format:'tp-lidar-vector-map-v1',units:'metres/degrees-counterclockwise',options:this.options,nextId:this.nextId,features:this.features,scans:this.scans});}
  csv(){return['# x1,y1,x2,y2 (metres)',...this.features.map(f=>[...f.segment.a,...f.segment.b].join(','))].join('\r\n');}
  stats(){return{features:this.features.length,scans:this.scans.length,confirmed:this.features.filter(f=>f.supportScans.length>=2).length,contradicted:this.features.filter(f=>f.misses>0).length,totalLengthM:this.features.reduce((sum,f)=>sum+S.length(f.segment),0)};}
  static load(text){
   const data=JSON.parse(text);
   if(data.format!=='tp-lidar-vector-map-v1'||data.units!=='metres/degrees-counterclockwise'||!data.options||!Array.isArray(data.scans)||data.scans.length>10000||!Array.isArray(data.features)||data.features.length>LIMIT)throw new Error('Format de carte vectorielle invalide.');
   const map=new VectorMap(data.options),ids=new Set();
   for(const scan of data.scans)if(typeof scan.name!=='string'||typeof scan.checksum!=='string'||!scan.pose||![scan.pose.x,scan.pose.y,scan.pose.theta].every(Number.isFinite))throw new Error('Historique de scans invalide.');
   for(const feature of data.features){
    if(!Number.isSafeInteger(feature.id)||feature.id<1||feature.id>=Number.MAX_SAFE_INTEGER||ids.has(feature.id)||S.length(feature.segment)<map.options.minLength-S.EPS||!Array.isArray(feature.supportScans)||feature.supportScans.length>data.scans.length||new Set(feature.supportScans).size!==feature.supportScans.length||!feature.supportScans.every(n=>Number.isInteger(n)&&n>=1&&n<=data.scans.length)||![feature.misses,feature.lastSeen,feature.lastFree].every(n=>Number.isInteger(n)&&n>=0)||feature.misses>=map.options.maxMisses||feature.lastSeen>data.scans.length||feature.lastFree>data.scans.length)throw new Error('Primitive vectorielle invalide.');
    ids.add(feature.id);
   }
   const maxId=Math.max(0,...ids);if(!Number.isSafeInteger(data.nextId)||data.nextId<=maxId)throw new Error('Compteur de primitives invalide.');
   map.features=copy(data.features);map.scans=copy(data.scans);map.nextId=data.nextId;map.version=1;return map;
  }
 }
 return{VectorMap,DEFAULTS,options,MAX_FEATURES:LIMIT};
});
