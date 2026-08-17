import { makeGeometry } from './mesh-utils.js';
import { sampleMap } from './image-relief.js';

function isActive(map,u,v){return sampleMap(map,'mask',u,v)>0}

function surfaceZ(map,params,u,v){
  const lum=sampleMap(map,'luminance',u,v);
  const edge=sampleMap(map,'edge',u,v);
  const detail=sampleMap(map,'detail',u,v);
  const ink=Math.pow(Math.max(0,1-lum),1.12);
  const base=Math.max(1.4,params.pendantBase);
  const depth=params.reliefDepth*params.reliefDetail;

  if(params.relief==='laser'){
    // Local dark detail + restrained edges mimic an engraved line instead of punching holes.
    const cut=Math.min(1,detail*.78+edge*.34+ink*.06);
    return Math.max(base-.48,base-Math.min(depth,.48)*cut);
  }
  if(params.relief==='emboss'){
    const form=Math.min(1,detail*.38+ink*.72);
    return base+Math.min(depth,2.0)*Math.pow(form,.82);
  }
  // Sculpted: broad tonal mass plus local detail. A soft clamp prevents spikes and pits.
  const mass=Math.pow(ink,.72);
  const form=Math.max(0,Math.min(1,mass*.72+detail*.38));
  return Math.max(base*.82,base+Math.min(depth,2.5)*(form-.18));
}

function cornerActive(map,x,y,nx,ny){
  for(let oy=-1;oy<=0;oy++)for(let ox=-1;ox<=0;ox++){
    const cx=x+ox,cy=y+oy;
    if(cx<0||cy<0||cx>=nx||cy>=ny)continue;
    if(isActive(map,(cx+.5)/nx,(cy+.5)/ny))return true;
  }
  return false;
}

export function buildPendantGeometry(map,params,resolution=170){
  const aspect=map?.aspect||.78,nx=Math.max(56,resolution),ny=Math.max(56,Math.round(resolution/aspect));
  const width=params.pendantWidth,height=width/aspect,positions=[],indices=[];
  const top=Array.from({length:ny+1},()=>Array(nx+1).fill(-1)),bottom=Array.from({length:ny+1},()=>Array(nx+1).fill(-1));

  for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){
    if(!cornerActive(map,x,y,nx,ny))continue;
    const u=x/nx,v=y/ny,X=(u-.5)*width,Y=(.5-v)*height;
    top[y][x]=positions.length/3;positions.push(X,Y,surfaceZ(map,params,u,v));
    bottom[y][x]=positions.length/3;positions.push(X,Y,0);
  }

  const cellActive=(x,y)=>x>=0&&y>=0&&x<nx&&y<ny&&isActive(map,(x+.5)/nx,(y+.5)/ny);
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
    if(!cellActive(x,y))continue;
    addFaces(x,y);
    if(!cellActive(x-1,y))wall(top[y][x],top[y+1][x],bottom[y][x],bottom[y+1][x]);
    if(!cellActive(x+1,y))wall(top[y][x+1],top[y+1][x+1],bottom[y][x+1],bottom[y+1][x+1],true);
    if(!cellActive(x,y-1))wall(top[y][x],top[y][x+1],bottom[y][x],bottom[y][x+1],true);
    if(!cellActive(x,y+1))wall(top[y+1][x],top[y+1][x+1],bottom[y+1][x],bottom[y+1][x+1]);
  }
  return makeGeometry(positions,indices);
}
