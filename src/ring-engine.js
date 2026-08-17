import { makeGeometry } from './mesh-utils.js';

function appendTube(positions,indices,path,tubeN,radiusFn,closed=true){
  const base=positions.length/3,n=path.length;
  for(let i=0;i<n;i++){
    const p=path[i],prev=path[closed?(i-1+n)%n:Math.max(0,i-1)],next=path[closed?(i+1)%n:Math.min(n-1,i+1)];
    const tx=next.x-prev.x,tz=next.z-prev.z,tl=Math.hypot(tx,tz)||1;
    const rx=p.x/Math.max(1e-6,Math.hypot(p.x,p.z)),rz=p.z/Math.max(1e-6,Math.hypot(p.x,p.z));
    for(let j=0;j<tubeN;j++){
      const b=j/tubeN*Math.PI*2,r=radiusFn(i/(n-1||1),b,p),cb=Math.cos(b),sb=Math.sin(b);
      positions.push(p.x+rx*cb*r,p.y+sb*r,p.z+rz*cb*r);
    }
  }
  const segs=closed?n:n-1;
  for(let i=0;i<segs;i++)for(let j=0;j<tubeN;j++){
    const ni=closed?(i+1)%n:i+1,nj=(j+1)%tubeN,a=base+i*tubeN+j,b=base+ni*tubeN+j,c=base+ni*tubeN+nj,d=base+i*tubeN+nj;
    indices.push(a,b,d,b,c,d);
  }
  if(!closed){
    const firstCenter=positions.length/3,first=path[0];positions.push(first.x,first.y,first.z);
    const lastCenter=positions.length/3,last=path[n-1];positions.push(last.x,last.y,last.z);
    for(let j=0;j<tubeN;j++){
      const nj=(j+1)%tubeN;
      indices.push(firstCenter,base+nj,base+j);
      const off=base+(n-1)*tubeN;indices.push(lastCenter,off+j,off+nj);
    }
  }
}

function circlePath(inner,offsetY,radialOffset,segments,phase=0,wave=0,freq=3){
  const out=[];for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI*2,r=inner+radialOffset+wave*Math.sin(a*freq+phase),y=offsetY+wave*.65*Math.cos(a*(freq-1)+phase);
    out.push({x:r*Math.cos(a),y,z:r*Math.sin(a),a});
  }return out;
}
function arcPath(inner,radialOffset,segments,gap,phase=0,lift=0){
  const out=[],start=gap/2,end=Math.PI*2-gap/2;
  for(let i=0;i<segments;i++){
    const t=i/(segments-1),a=start+(end-start)*t,r=inner+radialOffset+Math.sin(a*2+phase)*lift*.18,y=Math.sin(a+phase)*lift*.65;
    out.push({x:r*Math.cos(a),y,z:r*Math.sin(a),a,t});
  }return out;
}

function bandGeometry(params,radialN,tubeN,textureFn){
  const pos=[],idx=[],inner=params.diameter/2;
  for(let i=0;i<radialN;i++){
    const a=i/radialN*Math.PI*2;
    let wave=0,yWave=0,profile=1;
    if(params.mode!=='classic')wave=Math.sin(a*(params.mode==='coral'?7:3)+params.seed)*params.flow*.28;
    if(params.mode==='ribbon')profile=.72+.26*(.5+.5*Math.sin(a*2+params.seed));
    if(params.mode==='coral'){wave+=Math.sin(a*11+params.seed*1.7)*params.flow*.12;yWave=Math.sin(a*5)*params.flow*.18;}
    if(params.mode==='braid'){wave=Math.sin(a*5+params.seed)*params.flow*.22;yWave=Math.cos(a*3+params.seed)*params.flow*.22;}
    for(let j=0;j<tubeN;j++){
      const b=j/tubeN*Math.PI*2,bt=b+a*params.twist*.2,q=(Math.cos(bt)+1)*.5,tex=textureFn?textureFn(a,b):0,band=Math.max(params.minWall,params.width*profile+wave*q+tex*q),r=inner+q*band,y=Math.sin(bt)*Math.max(.7,params.width*.42)*profile+yWave*q+tex*Math.sin(bt)*.34;
      pos.push(r*Math.cos(a),y,r*Math.sin(a));
    }
  }
  for(let i=0;i<radialN;i++)for(let j=0;j<tubeN;j++){const ni=(i+1)%radialN,nj=(j+1)%tubeN,a=i*tubeN+j,b=ni*tubeN+j,c=ni*tubeN+nj,d=i*tubeN+nj;idx.push(a,b,d,b,c,d)}
  return makeGeometry(pos,idx);
}

export function buildRingGeometry(params,radialN=240,tubeN=46,textureFn=null){
  const tubularModes=new Set(['cage','branch','split','openflow','loop','cellular']);
  if(!tubularModes.has(params.mode))return bandGeometry(params,radialN,tubeN,textureFn);
  const positions=[],indices=[],inner=params.diameter/2,spread=params.structureSpread??2.2,gap=(params.openGap??18)*Math.PI/180,strand=Math.max(.55,params.strandRadius??1.05),flow=params.flow||1;
  const radiusFn=(phase=0,scale=1)=>(t,b,p)=>{
    const tex=textureFn?textureFn(p.a||t*Math.PI*2,b):0;
    return Math.max(.45,strand*scale+tex*.22+Math.sin(t*Math.PI*6+phase)*flow*.025);
  };
  if(params.mode==='cage'){
    const count=Math.max(3,Math.round(params.strandCount??4));
    for(let k=0;k<count;k++){
      const phase=k/count*Math.PI*2,path=circlePath(inner,Math.sin(phase)*spread*.45,strand*1.1,radialN,phase,spread*.48,3+k%2);
      appendTube(positions,indices,path,tubeN,radiusFn(phase,.72),true);
    }
  }else if(params.mode==='branch'){
    const count=Math.max(3,Math.round(params.strandCount??5));
    for(let k=0;k<count;k++){
      const phase=(k-count/2)*.42,path=arcPath(inner,strand*1.05+k*.08,Math.max(80,radialN-40),gap+Math.abs(k-count/2)*.05,phase,spread*(.72+k*.06));
      appendTube(positions,indices,path,tubeN,radiusFn(phase,.64+k*.035),false);
    }
  }else if(params.mode==='split'){
    for(const s of[-1,1]){
      const path=circlePath(inner,s*spread*.52,strand*1.2,radialN,s*.9,spread*.32,2);
      appendTube(positions,indices,path,tubeN,radiusFn(s,.85),true);
    }
  }else if(params.mode==='openflow'){
    const path=arcPath(inner,strand*1.35,Math.max(100,radialN),Math.max(gap,.42),0,spread*.65);
    appendTube(positions,indices,path,tubeN,radiusFn(0,1.0),false);
    const path2=arcPath(inner,strand*1.25,Math.max(90,radialN-20),Math.max(gap+.4,.7),Math.PI,spread*.54);
    appendTube(positions,indices,path2,tubeN,radiusFn(2,.72),false);
  }else if(params.mode==='loop'){
    const main=circlePath(inner,0,strand*1.2,radialN,0,spread*.22,2);appendTube(positions,indices,main,tubeN,radiusFn(0,.88),true);
    const upper=circlePath(inner,spread*.62,strand*1.15,radialN,1.4,spread*.34,1);appendTube(positions,indices,upper,tubeN,radiusFn(1.4,.72),true);
  }else if(params.mode==='cellular'){
    const count=Math.max(3,Math.round(params.strandCount??4));
    for(let k=0;k<count;k++){
      const phase=k/count*Math.PI*2,path=circlePath(inner,(k-(count-1)/2)*spread*.28,strand*(1.0+k*.04),radialN,phase,spread*.52,2+k);
      appendTube(positions,indices,path,tubeN,radiusFn(phase,.62),true);
    }
  }
  const g=makeGeometry(positions,indices);g.computeVertexNormals();return g;
}
