const {Grid,line}=require('../../visualisation/grid.js');
const C=require('../../visualisation/core.js');
function scene(){
 const grid=new Grid({resolution:.1,x:-5,y:-4,width:10,height:9});
 const polygon=[[-4,-3],[4,-3],[4,1],[1,1],[1,4],[-4,4]],box=[[-1,-1],[.5,-1],[.5,.4],[-1,.4]];
 const edges=p=>p.map((a,i)=>[a,p[(i+1)%p.length]]),walls=[...edges(polygon),...edges(box)];
 function inside(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
 for(let y=0;y<grid.ny;y++)for(let x=0;x<grid.nx;x++){const p=[grid.x+(x+.5)*.1,grid.y+(y+.5)*.1];if(inside(p,polygon)&&!inside(p,box))grid.cells[grid.index(x,y)]=0;}
 for(const[a,b]of walls)for(const[x,y]of line(...grid.cell(...a),...grid.cell(...b)))grid.cells[grid.index(x,y)]=255;
 function scan(pose,n=360,noise=.004,sampleSeed=314159){
  const points=[];let random=sampleSeed>>>0;
  for(let i=0;i<n;i++){
   const a=(i*360/n+pose.theta)*Math.PI/180,d=[Math.cos(a),Math.sin(a)],cross=(u,v)=>u[0]*v[1]-u[1]*v[0];let range=Infinity;
   for(const[A,B]of walls){const v=[B[0]-A[0],B[1]-A[1]],w=[A[0]-pose.x,A[1]-pose.y],den=cross(d,v);if(Math.abs(den)<1e-12)continue;const t=cross(w,v)/den,u=cross(w,d)/den;if(t>0&&u>=0&&u<=1)range=Math.min(range,t);}
   random=(Math.imul(random,1664525)+1013904223)>>>0;range+=noise*(2*random/4294967296-1);
   if(Number.isFinite(range)){const local=i*2*Math.PI/n;points.push([range*Math.cos(local),range*Math.sin(local)]);}
  }
  return{name:'scene_synthetique.csv',checksum:C.checksum(points),points,qualities:points.map(()=>200),pose:{...pose},visible:true,opacity:.85};
 }
 return{grid,scan,walls};
}
module.exports={scene};
