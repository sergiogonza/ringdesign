import { makeGeometry } from './mesh-utils.js';
import { sampleMap } from './image-relief.js';

function isActive(map,u,v){
  const s=map.silhouette?sampleMap(map,'silhouette',u,v):sampleMap(map,'mask',u,v);
  return s>.46;
}

function surfaceZ(map,params,u,v){
  const lum=sampleMap(map,'luminance',u,v);
  const edge=sampleMap(map,'edge',u,v);
  const detail=sampleMap(map,'detail',u,v);
  const ink=Math.pow(Math.max(0,1-lum),1.18);
  const base=Math.max(1.6,params.pendantBase);
  const depth=params.reliefDepth*params.reliefDetail;

  if(params.relief==='laser'){
    // Engraving is intentionally shallow: line/detail information dominates broad darkness.
    const line=Math.min(1,detail*.90+edge*.38+ink*.035);
    const eased=line*line*(3-2*line);
    return Math.max(base-.52,base-Math.min(depth,.52)*eased);
  }
  if(params.relief==='emboss'){
    const form=Math.min(1,detail*.42+ink*.66+edge*.08);
    const eased=form*form*(3-2*form);
    return base+Math.min(depth,2.0)*eased;
  }
  const mass=Math.pow(ink,.78),form=Math.max(0,Math.min(1,mass*.68+detail*.34+edge*.05));
  const eased=form*form*(3-2*form);
  return Math.max(base*.84,base+Math.min(depth,2.4)*(eased-.12));
}

function cellActive(map,x,y,nx,ny){return x>=0&&y>=0&&x<nx&&y<ny&&isActive(map,(x+.5)/nx,(y+.5)/ny)}

export function buildPendantGeometry(map,params,resolution=170){
  const aspect=map?.aspect||.78,nx=Math.max(64,resolution),ny=Math.max(64,Math.round(resolution/aspect));
  const width=params.pendantWidth,height=width/aspect,positions=[],indices=[];
  const top=Array.from({length:ny+1},()=>Array(nx+1).fill(-1)),bottom=Array.from({length:ny+1},()=>Array(nx+1).fill(-1));
  const active=[];
  for(let y=0;y<ny;y++){active[y]=[];for(let x=0;x<nx;x++)active[y][x]=cellActive(map,x,y,nx,ny)}

  // Each boundary corner is projected toward the interpolated silhouette instead of staying
  // on the pixel/grid coordinate. This removes the stacked horizontal 'stairs' on sidewalls.
  function projectedUV(x,y){
    let u=x/nx,v=y/ny;
    if(!map.silhouette)return[u,v];
    const s=sampleMap(map,'silhouette',u,v);
    if(s>.15&&s<.85){
      const du=1/Math.max(map.w,nx),dv=1/Math.max(map.h,ny);
      const gx=(sampleMap(map,'silhouette',Math.min(1,u+du),v)-sampleMap(map,'silhouette',Math.max(0,u-du),v))/(2*du);
      const gy=(sampleMap(map,'silhouette',u,Math.min(1,v+dv))-sampleMap(map,'silhouette',u,Math.max(0,v-dv)))/(2*dv);
      const g2=gx*gx+gy*gy;
      if(g2>1e-8){const shift=(.5-s)/g2;u=Math.max(0,Math.min(1,u+gx*shift));v=Math.max(0,Math.min(1,v+gy*shift))}
    }
    return[u,v];
  }

  function cornerNeeded(x,y){
    for(let oy=-1;oy<=0;oy++)for(let ox=-1;ox<=0;ox++){const cx=x+ox,cy=y+oy;if(cx>=0&&cy>=0&&cx<nx&&cy<ny&&active[cy][cx])return true}return false;
  }

  for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){
    if(!cornerNeeded(x,y))continue;
    const [u,v]=projectedUV(x,y),X=(u-.5)*width,Y=(.5-v)*height;
    top[y][x]=positions.length/3;positions.push(X,Y,surfaceZ(map,params,u,v));
    bottom[y][x]=positions.length/3;positions.push(X,Y,0);
  }

  const addFaces=(x,y)=>{
    const a=top[y][x],b=top[y][x+1],c=top[y+1][x+1],d=top[y+1][x],A=bottom[y][x],B=bottom[y][x+1],C=bottom[y+1][x+1],D=bottom[y+1][x];
    if([a,b,c,d,A,B,C,D].some(i=>i<0))return;
    indices.push(a,d,b,b,d,c,A,B,D,B,C,D);
  };
  const wall=(t1,t2,b1,b2,flip=false)=>{
    if([t1,t2,b1,b2].some(i=>i<0))return;
    if(flip)indices.push(t1,t2,b1,t2,b2,b1);else indices.push(t1,b1,t2,t2,b1,b2);
  };

  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    if(!active[y][x])continue;
    addFaces(x,y);
    if(x===0||!active[y][x-1])wall(top[y][x],top[y+1][x],bottom[y][x],bottom[y+1][x]);
    if(x===nx-1||!active[y][x+1])wall(top[y][x+1],top[y+1][x+1],bottom[y][x+1],bottom[y+1][x+1],true);
    if(y===0||!active[y-1][x])wall(top[y][x],top[y][x+1],bottom[y][x],bottom[y][x+1],true);
    if(y===ny-1||!active[y+1][x])wall(top[y+1][x],top[y+1][x+1],bottom[y+1][x],bottom[y+1][x+1]);
  }
  const geometry=makeGeometry(positions,indices);
  geometry.computeVertexNormals();
  return geometry;
}
