import { makeGeometry } from './mesh-utils.js';

function appendTube(positions,indices,path,tubeN,radiusFn,closed=true){
  if(!path?.length||path.length<2)return;
  const base=positions.length/3,n=path.length;
  for(let i=0;i<n;i++){
    const p=path[i];
    const rr=Math.max(1e-6,Math.hypot(p.x,p.z));
    const rx=p.x/rr,rz=p.z/rr;
    for(let j=0;j<tubeN;j++){
      const b=j/tubeN*Math.PI*2;
      const r=Math.max(.38,radiusFn(i/Math.max(1,n-1),b,p));
      positions.push(p.x+rx*Math.cos(b)*r,p.y+Math.sin(b)*r,p.z+rz*Math.cos(b)*r);
    }
  }
  const segs=closed?n:n-1;
  for(let i=0;i<segs;i++)for(let j=0;j<tubeN;j++){
    const ni=closed?(i+1)%n:i+1,nj=(j+1)%tubeN;
    const a=base+i*tubeN+j,b=base+ni*tubeN+j,c=base+ni*tubeN+nj,d=base+i*tubeN+nj;
    indices.push(a,b,d,b,c,d);
  }
  if(!closed){
    const firstCenter=positions.length/3,first=path[0];positions.push(first.x,first.y,first.z);
    const lastCenter=positions.length/3,last=path[n-1];positions.push(last.x,last.y,last.z);
    for(let j=0;j<tubeN;j++){
      const nj=(j+1)%tubeN;
      indices.push(firstCenter,base+nj,base+j);
      const off=base+(n-1)*tubeN;
      indices.push(lastCenter,off+j,off+nj);
    }
  }
}

function circlePath(inner,offsetY,radialOffset,segments,phase=0,wave=0,freq=3){
  const out=[];
  for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI*2;
    const r=inner+radialOffset+wave*Math.sin(a*freq+phase);
    const y=offsetY+wave*.65*Math.cos(a*Math.max(1,freq-1)+phase);
    out.push({x:r*Math.cos(a),y,z:r*Math.sin(a),a});
  }
  return out;
}

function arcPath(inner,radialOffset,segments,gap,phase=0,lift=0,bulge=0){
  const out=[],start=gap/2,end=Math.PI*2-gap/2;
  for(let i=0;i<segments;i++){
    const t=i/Math.max(1,segments-1),a=start+(end-start)*t;
    const bell=Math.sin(Math.PI*t);
    const r=inner+radialOffset+Math.sin(a*2+phase)*lift*.18+bulge*bell;
    const y=Math.sin(a+phase)*lift*.65;
    out.push({x:r*Math.cos(a),y,z:r*Math.sin(a),a,t});
  }
  return out;
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
      const b=j/tubeN*Math.PI*2,bt=b+a*params.twist*.2,q=(Math.cos(bt)+1)*.5,tex=textureFn?textureFn(a,b):0;
      const band=Math.max(params.minWall,params.width*profile+wave*q+tex*q),r=inner+q*band;
      const y=Math.sin(bt)*Math.max(.7,params.width*.42)*profile+yWave*q+tex*Math.sin(bt)*.34;
      pos.push(r*Math.cos(a),y,r*Math.sin(a));
    }
  }
  for(let i=0;i<radialN;i++)for(let j=0;j<tubeN;j++){
    const ni=(i+1)%radialN,nj=(j+1)%tubeN,a=i*tubeN+j,b=ni*tubeN+j,c=ni*tubeN+nj,d=i*tubeN+nj;
    idx.push(a,b,d,b,c,d);
  }
  return makeGeometry(pos,idx);
}

export function buildRingGeometry(params,radialN=240,tubeN=46,textureFn=null){
  const tubularModes=new Set(['cage','branch','split','openflow','loop','cellular','fan','aero','leaf','shell']);
  if(!tubularModes.has(params.mode))return bandGeometry(params,radialN,tubeN,textureFn);

  const positions=[],indices=[],inner=params.diameter/2;
  const spread=Math.max(.1,params.structureSpread??2.2);
  const gap=Math.max(.08,(params.openGap??18)*Math.PI/180);
  const strand=Math.max(.5,params.strandRadius??1.05);
  const flow=Math.max(0,params.flow||1);
  const count=Math.max(2,Math.round(params.strandCount??4));

  const radiusFn=(phase=0,scale=1,taper=0)=>(t,b,p)=>{
    const tex=textureFn?textureFn(p.a??t*Math.PI*2,b):0;
    const taperFactor=taper?(.48+.52*Math.pow(Math.sin(Math.PI*t),.45)):1;
    return Math.max(.4,(strand*scale+tex*.20+Math.sin(t*Math.PI*6+phase)*flow*.02)*taperFactor);
  };

  if(params.mode==='cage'){
    for(let k=0;k<count;k++){
      const phase=k/count*Math.PI*2;
      appendTube(positions,indices,circlePath(inner,Math.sin(phase)*spread*.44,strand*1.1,radialN,phase,spread*.46,3+k%2),tubeN,radiusFn(phase,.72),true);
    }
  }else if(params.mode==='cellular'){
    for(let k=0;k<count;k++){
      const phase=k/count*Math.PI*2;
      appendTube(positions,indices,circlePath(inner,(k-(count-1)/2)*spread*.28,strand*(1+k*.04),radialN,phase,spread*.52,2+k),tubeN,radiusFn(phase,.62),true);
    }
  }else if(params.mode==='branch'){
    for(let k=0;k<count;k++){
      const phase=(k-(count-1)/2)*.42;
      appendTube(positions,indices,arcPath(inner,strand*1.05+k*.08,Math.max(90,radialN-40),gap+Math.abs(k-(count-1)/2)*.05,phase,spread*(.72+k*.05),spread*.25),tubeN,radiusFn(phase,.62+k*.035,1),false);
    }
  }else if(params.mode==='split'){
    for(const s of[-1,1])appendTube(positions,indices,circlePath(inner,s*spread*.52,strand*1.2,radialN,s*.9,spread*.30,2),tubeN,radiusFn(s,.86),true);
  }else if(params.mode==='openflow'){
    appendTube(positions,indices,arcPath(inner,strand*1.35,Math.max(110,radialN),Math.max(gap,.42),0,spread*.65,spread*.28),tubeN,radiusFn(0,1,1),false);
    appendTube(positions,indices,arcPath(inner,strand*1.25,Math.max(100,radialN-20),Math.max(gap+.38,.68),Math.PI,spread*.54,spread*.20),tubeN,radiusFn(2,.72,1),false);
  }else if(params.mode==='loop'){
    appendTube(positions,indices,circlePath(inner,0,strand*1.2,radialN,0,spread*.22,2),tubeN,radiusFn(0,.88),true);
    appendTube(positions,indices,circlePath(inner,spread*.62,strand*1.15,radialN,1.4,spread*.34,1),tubeN,radiusFn(1.4,.72),true);
  }else if(params.mode==='fan'){
    const ribs=Math.max(5,count+4);
    for(let k=0;k<ribs;k++){
      const t=k/(ribs-1),phase=(t-.5)*1.2;
      const path=arcPath(inner,strand*.95,Math.max(100,radialN-20),Math.max(.34,gap*.78),phase,spread*(.18+.95*Math.sin(Math.PI*t)),spread*(.15+.55*Math.sin(Math.PI*t)));
      appendTube(positions,indices,path,tubeN,radiusFn(phase,.45+.28*Math.sin(Math.PI*t),1),false);
    }
  }else if(params.mode==='aero'){
    appendTube(positions,indices,arcPath(inner,strand*1.1,Math.max(120,radialN),Math.max(.52,gap),-.8,spread*.92,spread*.55),tubeN,radiusFn(-.8,.72,1),false);
    appendTube(positions,indices,arcPath(inner,strand*1.1,Math.max(120,radialN),Math.max(.52,gap),.8,-spread*.92,spread*.55),tubeN,radiusFn(.8,.72,1),false);
    appendTube(positions,indices,circlePath(inner,0,strand*.85,radialN,0,spread*.12,2),tubeN,radiusFn(0,.5),true);
  }else if(params.mode==='leaf'){
    const ribs=Math.max(6,count+5);
    for(let k=0;k<ribs;k++){
      const t=k/(ribs-1),phase=(t-.5)*.9,lift=spread*(.35+.75*Math.sin(Math.PI*t));
      appendTube(positions,indices,arcPath(inner,strand*.82,Math.max(95,radialN-30),Math.max(.55,gap),phase,lift,spread*.55*Math.sin(Math.PI*t)),tubeN,radiusFn(phase,.42+.18*Math.sin(Math.PI*t),1),false);
    }
    appendTube(positions,indices,arcPath(inner,strand*1.05,Math.max(110,radialN),Math.max(.5,gap),0,spread*.18,spread*.65),tubeN,radiusFn(0,.78,1),false);
  }else if(params.mode==='shell'){
    const ribs=Math.max(5,count+3);
    for(let k=0;k<ribs;k++){
      const phase=k/ribs*Math.PI*2;
      appendTube(positions,indices,circlePath(inner,(k-(ribs-1)/2)*spread*.20,strand*(.92+k*.025),radialN,phase,spread*(.18+.32*k/ribs),2+k%3),tubeN,radiusFn(phase,.48+.04*k),true);
    }
  }

  if(positions.length<12||indices.length<12)return bandGeometry({...params,mode:'classic'},radialN,tubeN,textureFn);
  const g=makeGeometry(positions,indices);
  g.computeVertexNormals();
  return g;
}
