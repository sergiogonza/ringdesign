function blur(field, w, h, passes = 1, radius = 2) {
  let current = field;
  for (let pass = 0; pass < passes; pass++) {
    const out = new Float32Array(current.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sum = 0, weight = 0;
      for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
        const sx = Math.max(0, Math.min(w - 1, x + ox));
        const sy = Math.max(0, Math.min(h - 1, y + oy));
        const d = Math.abs(ox) + Math.abs(oy);
        const ww = d === 0 ? 5 : d === 1 ? 3 : d <= 2 ? 2 : 1;
        sum += current[sy * w + sx] * ww;
        weight += ww;
      }
      out[y * w + x] = sum / weight;
    }
    current = out;
  }
  return current;
}

function sample(field, w, h, x, y) {
  x = Math.max(0, Math.min(w - 1, x));
  y = Math.max(0, Math.min(h - 1, y));
  return field[y * w + x];
}

function largestComponent(mask, w, h) {
  const seen = new Uint8Array(mask.length);
  let best = [];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start], component = [];
    seen[start] = 1;
    while (stack.length) {
      const id = stack.pop();
      component.push(id);
      const x = id % w, y = Math.floor(id / w);
      for (const [dx,dy] of dirs) {
        const nx=x+dx, ny=y+dy;
        if(nx<0||ny<0||nx>=w||ny>=h) continue;
        const nid=ny*w+nx;
        if(mask[nid]&&!seen[nid]){seen[nid]=1;stack.push(nid)}
      }
    }
    if(component.length>best.length) best=component;
  }
  const result=new Uint8Array(mask.length);
  for(const id of best) result[id]=1;
  return result;
}

function majority(mask,w,h,passes=1){
  let current=mask;
  for(let pass=0;pass<passes;pass++){
    const next=new Uint8Array(current.length);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let n=0,total=0;
      for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
        const sx=x+ox,sy=y+oy;
        if(sx<0||sy<0||sx>=w||sy>=h) continue;
        total++;
        if(current[sy*w+sx])n++;
      }
      next[y*w+x]=n>=Math.ceil(total*.5)?1:0;
    }
    current=next;
  }
  return current;
}

function enclosedBodyMask(lum, alpha, w, h, bgLum) {
  // For JPG/opaque artwork we do NOT use every dark line as a cutout.
  // Flood only the exterior background from the canvas border. Everything enclosed by
  // the outer drawing/frame becomes one continuous printable body.
  const background = new Uint8Array(w*h);
  const tolerance = Math.max(.035, Math.min(.13, Math.abs(bgLum-.5)*.08+.04));
  for(let i=0;i<background.length;i++){
    const closeToBg=Math.abs(lum[i]-bgLum)<tolerance;
    const nearWhite=bgLum>.82&&lum[i]>.91;
    background[i]=alpha[i]<.08||(closeToBg||nearWhite)?1:0;
  }

  const exterior=new Uint8Array(w*h),stack=[];
  const push=id=>{if(id>=0&&id<w*h&&!exterior[id]&&background[id]){exterior[id]=1;stack.push(id)}};
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x)}
  for(let y=1;y<h-1;y++){push(y*w);push(y*w+w-1)}
  while(stack.length){
    const id=stack.pop(),x=id%w,y=Math.floor(id/w);
    if(x>0)push(id-1);if(x<w-1)push(id+1);if(y>0)push(id-w);if(y<h-1)push(id+w);
  }

  const body=new Uint8Array(w*h);
  for(let i=0;i<body.length;i++) body[i]=exterior[i]?0:1;
  return majority(largestComponent(body,w,h),w,h,1);
}

export function analyzeRasterImage(img,maxSide=460){
  const ratio=img.width/img.height;
  const w=ratio>=1?maxSide:Math.max(112,Math.round(maxSide*ratio));
  const h=ratio>=1?Math.max(112,Math.round(maxSide/ratio)):maxSide;
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.clearRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
  const rgba=ctx.getImageData(0,0,w,h).data;
  const lum=new Float32Array(w*h),alpha=new Float32Array(w*h);
  let borderLum=0,borderCount=0,transparentBorder=0;
  for(let i=0;i<w*h;i++){alpha[i]=rgba[i*4+3]/255;lum[i]=(0.2126*rgba[i*4]+0.7152*rgba[i*4+1]+0.0722*rgba[i*4+2])/255}
  const addBorder=id=>{borderLum+=lum[id];borderCount++;if(alpha[id]<.08)transparentBorder++};
  for(let x=0;x<w;x++){addBorder(x);addBorder((h-1)*w+x)}for(let y=1;y<h-1;y++){addBorder(y*w);addBorder(y*w+w-1)}
  const hasAlphaCutout=transparentBorder>borderCount*.2,bgLum=borderLum/Math.max(1,borderCount);

  let mask;
  if(hasAlphaCutout){
    mask=new Uint8Array(w*h);
    for(let i=0;i<mask.length;i++)mask[i]=alpha[i]>.16?1:0;
    mask=majority(mask,w,h,1);
    mask=largestComponent(mask,w,h);
  }else{
    mask=enclosedBodyMask(lum,alpha,w,h,bgLum);
  }

  let minX=w,maxX=-1,minY=h,maxY=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x]){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
  if(maxX<minX){minX=0;minY=0;maxX=w-1;maxY=h-1;mask.fill(1)}
  const pad=3;minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);maxX=Math.min(w-1,maxX+pad);maxY=Math.min(h-1,maxY+pad);
  const cw=maxX-minX+1,ch=maxY-minY+1,croppedMask=new Uint8Array(cw*ch),croppedLum=new Float32Array(cw*ch);
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
    const src=(y+minY)*w+x+minX;
    croppedMask[y*cw+x]=mask[src];
    croppedLum[y*cw+x]=lum[src];
  }

  // Fine field preserves pen/engraving lines; coarse field removes broad lighting gradients.
  const fine=blur(croppedLum,cw,ch,1,1);
  const smooth=blur(fine,cw,ch,2,2);
  const coarse=blur(smooth,cw,ch,2,3);
  const edge=new Float32Array(cw*ch),detail=new Float32Array(cw*ch);
  for(let y=1;y<ch-1;y++)for(let x=1;x<cw-1;x++){
    const gx=sample(fine,cw,ch,x+1,y)-sample(fine,cw,ch,x-1,y);
    const gy=sample(fine,cw,ch,x,y+1)-sample(fine,cw,ch,x,y-1);
    edge[y*cw+x]=Math.min(1,Math.sqrt(gx*gx+gy*gy)*3.6);
    // Dark local linework is stronger than broad shadows, producing a more natural engraving.
    detail[y*cw+x]=Math.max(0,Math.min(1,(coarse[y*cw+x]-fine[y*cw+x])*5.2));
  }

  return{w:cw,h:ch,aspect:cw/ch,luminance:smooth,edge,detail,mask:croppedMask,alphaCutout:hasAlphaCutout};
}

export function sampleMap(map,field,u,v){
  const fx=Math.max(0,Math.min(map.w-1,u*(map.w-1))),fy=Math.max(0,Math.min(map.h-1,v*(map.h-1)));
  const x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(map.w-1,x0+1),y1=Math.min(map.h-1,y0+1),tx=fx-x0,ty=fy-y0;
  const f=map[field];
  if(!f)return 0;
  if(field==='mask')return f[Math.round(fy)*map.w+Math.round(fx)];
  const a=f[y0*map.w+x0]*(1-tx)+f[y0*map.w+x1]*tx;
  const b=f[y1*map.w+x0]*(1-tx)+f[y1*map.w+x1]*tx;
  return a*(1-ty)+b*ty;
}
