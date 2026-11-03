(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LidarGrid=api;})(globalThis,function(){
 'use strict';
 const FREE=0, UNKNOWN=127, OCCUPIED=255, LIMIT=1000000;
 function finite(value,name){if(!Number.isFinite(value))throw new Error(`${name} doit être fini.`);return value;}
 function line(x0,y0,x1,y1){
  if(![x0,y0,x1,y1].every(Number.isSafeInteger)||Math.abs(x1-x0)+Math.abs(y1-y0)>2*LIMIT)throw new Error('Indices de rayon invalides.');
  const result=[],dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;let error=dx+dy;
  while(true){result.push([x0,y0]);if(x0===x1&&y0===y1)break;const e=2*error;if(e>=dy){error+=dy;x0+=sx;}if(e<=dx){error+=dx;y0+=sy;}}
  return result;
 }
 class Grid{
  constructor({resolution=.1,width=30,height=30,x=-15,y=-15}={}){
   for(const [key,value]of Object.entries({resolution,width,height,x,y}))finite(value,key);
   if(resolution<.02||resolution>2||width<=0||height<=0)throw new Error('Résolution : 0,02 à 2 m ; dimensions strictement positives.');
   this.resolution=resolution;this.nx=Math.max(1,Math.ceil(width/resolution-1e-10));this.ny=Math.max(1,Math.ceil(height/resolution-1e-10));
   if(!Number.isSafeInteger(this.nx*this.ny)||this.nx*this.ny>LIMIT)throw new Error('Grille trop grande : maximum 1 000 000 cellules.');
   this.x=x;this.y=y;this.width=this.nx*resolution;this.height=this.ny*resolution;
   this.cells=new Uint8Array(this.nx*this.ny);this.cells.fill(UNKNOWN);this.scans=[];this.version=0;
  }
  inside(x,y){return x>=this.x&&y>=this.y&&x<this.x+this.width&&y<this.y+this.height;}
  cell(x,y){let i=Math.floor((x-this.x)/this.resolution+1e-10),j=Math.floor((y-this.y)/this.resolution+1e-10);if(x>=this.x&&x<this.x+this.width)i=Math.min(this.nx-1,i);if(y>=this.y&&y<this.y+this.height)j=Math.min(this.ny-1,j);return[i,j];}
  index(x,y){return y*this.nx+x;}
  integrate(scan,transform,{minIntensity=0,maxRange=12}={}){
   const pose={...scan.pose};for(const key of ['x','y','theta'])finite(pose[key],key);
   if(!this.inside(pose.x,pose.y))throw new Error(`${scan.name} : origine hors grille. Agrandir ou repositionner la grille.`);
   if(!Number.isFinite(minIntensity)||minIntensity<0||minIntensity>255||!Number.isFinite(maxRange)||maxRange<=0)throw new Error('Filtres invalides : intensité 0–255 et portée > 0 m.');
   const previous=this.scans.find(s=>s.checksum===scan.checksum&&s.name===scan.name);
   if(previous){
    if(['x','y','theta'].some(key=>previous.pose[key]!==pose[key])||previous.minIntensity!==minIntensity||previous.maxRange!==maxRange)throw new Error(`${scan.name} déjà intégré avec une autre pose ou d'autres filtres. Recréer la grille pour le corriger.`);
    return{duplicate:true,accepted:0,filtered:0,clipped:0};
   }
   const free=new Set(),hits=new Set(),start=this.cell(pose.x,pose.y);let accepted=0,filtered=0,clipped=0;
   // Prepare all observations before mutating the existing map.
   for(let i=0;i<scan.points.length;i++){
    const local=scan.points[i];
    if(!Array.isArray(local)||local.length!==2||!local.every(Number.isFinite))throw new Error('Point non fini ou invalide.');
    const range=Math.hypot(...local),quality=scan.qualities?.[i];
    if(range<=0||range>maxRange||(minIntensity>0&&(!Number.isFinite(quality)||quality<minIntensity))){filtered++;continue;}
    const impact=transform(local,pose);if(!impact.every(Number.isFinite))throw new Error('Impact non fini.');
    const occupied=this.inside(...impact);let t=1;
    if(!occupied){
     clipped++;const dx=impact[0]-pose.x,dy=impact[1]-pose.y;
     if(dx>0)t=Math.min(t,(this.x+this.width-pose.x)/dx);else if(dx<0)t=Math.min(t,(this.x-pose.x)/dx);
     if(dy>0)t=Math.min(t,(this.y+this.height-pose.y)/dy);else if(dy<0)t=Math.min(t,(this.y-pose.y)/dy);
    }
    const end=this.cell(pose.x+t*(impact[0]-pose.x),pose.y+t*(impact[1]-pose.y));
    end[0]=Math.max(0,Math.min(this.nx-1,end[0]));end[1]=Math.max(0,Math.min(this.ny-1,end[1]));
    const ray=line(...start,...end);
    ray.forEach(([x,y],j)=>{const key=this.index(x,y);if(occupied&&j===ray.length-1)hits.add(key);else free.add(key);});
    accepted++;
   }
   if(!accepted)throw new Error(`${scan.name} : aucune mesure après filtrage.`);
   for(const key of free)if(!hits.has(key))this.cells[key]=FREE;
   for(const key of hits)this.cells[key]=OCCUPIED;
   this.scans.push({name:scan.name,checksum:scan.checksum,pose,minIntensity,maxRange,accepted,filtered,clipped});this.version++;
   return{duplicate:false,accepted,filtered,clipped};
  }
  counts(){let free=0,occupied=0;for(const v of this.cells){if(v===FREE)free++;else if(v===OCCUPIED)occupied++;}return{free,occupied,unknown:this.cells.length-free-occupied};}
  save(){return JSON.stringify({format:'tp-lidar-grid-v1',model:'three-state-latest-scan-hit-priority',units:'metres/degrees-counterclockwise',resolution:this.resolution,x:this.x,y:this.y,nx:this.nx,ny:this.ny,states:{free:FREE,unknown:UNKNOWN,occupied:OCCUPIED},cells:Array.from(this.cells),scans:this.scans});}
  csv(){
   const rows=['# 0=libre;127=inconnu;255=occupe',`# resolution_m=${this.resolution};origin_x_m=${this.x};origin_y_m=${this.y};nx=${this.nx};ny=${this.ny};rows=top-to-bottom`];
   for(let y=this.ny-1;y>=0;y--)rows.push(Array.from(this.cells.subarray(y*this.nx,(y+1)*this.nx)).join(','));return rows.join('\r\n');
  }
  static load(text){
   const data=JSON.parse(text);
   if(data.format!=='tp-lidar-grid-v1'||data.model!=='three-state-latest-scan-hit-priority'||data.units!=='metres/degrees-counterclockwise'||!Number.isInteger(data.nx)||!Number.isInteger(data.ny)||data.nx<1||data.ny<1||data.nx*data.ny>LIMIT)throw new Error('Format, unités ou dimensions de grille invalides.');
   if(!Array.isArray(data.cells)||data.cells.length!==data.nx*data.ny||!data.cells.every(v=>[FREE,UNKNOWN,OCCUPIED].includes(v)))throw new Error('Cellules de grille invalides.');
   const grid=new Grid({resolution:data.resolution,width:data.nx*data.resolution,height:data.ny*data.resolution,x:data.x,y:data.y});
   // Use exact stored integer dimensions (floating division can slightly over-round).
   grid.nx=data.nx;grid.ny=data.ny;grid.width=data.nx*grid.resolution;grid.height=data.ny*grid.resolution;
   if(!Array.isArray(data.scans)||data.scans.length>10000)throw new Error('Historique de scans invalide.');
   for(const s of data.scans)if(typeof s.name!=='string'||typeof s.checksum!=='string'||!s.pose||![s.pose.x,s.pose.y,s.pose.theta,s.minIntensity,s.maxRange].every(Number.isFinite)||s.minIntensity<0||s.minIntensity>255||s.maxRange<=0)throw new Error('Historique de poses invalide.');
   grid.cells=Uint8Array.from(data.cells);grid.scans=data.scans;grid.version=1;return grid;
  }
 }
 return{Grid,line,FREE,UNKNOWN,OCCUPIED};
});
