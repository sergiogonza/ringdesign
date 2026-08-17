import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { makeGeometry, validateMesh } from './src/mesh-utils.js';
import { analyzeRasterImage } from './src/image-relief.js';
import { buildPendantGeometry } from './src/pendant-engine.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const stage=$('#stage'),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,2000);camera.position.set(0,18,62);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;stage.prepend(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;scene.add(new THREE.HemisphereLight(0xfff2d7,0x151718,2.7));const key=new THREE.DirectionalLight(0xffcf72,4.1);key.position.set(25,35,45);scene.add(key);const fill=new THREE.DirectionalLight(0xffffff,1.2);fill.position.set(-25,15,35);scene.add(fill);const model=new THREE.Group();scene.add(model);const material=new THREE.MeshPhysicalMaterial({color:0xb98a32,metalness:.93,roughness:.25,clearcoat:.32,clearcoatRoughness:.18,side:THREE.DoubleSide});
let mesh=null,imageMap=null,sourceName='',sourceKind='',projects=JSON.parse(localStorage.getItem('organica-projects')||'[]');
let p={piece:'ring',diameter:18.2,width:4.2,minWall:1.2,flow:1.4,twist:.8,textureAmount:.65,textureScale:7,seed:2.1,mode:'liquid',texture:'smooth',pendantWidth:28,pendantBase:2.6,reliefDepth:.55,reliefDetail:.8,relief:'laser'};
const QUALITY={preview:[180,28],standard:[260,40],jewelry:[420,60],ultra:[600,80]};
function hash(x){const v=Math.sin(x*127.1+p.seed*311.7)*43758.5453;return v-Math.floor(v)}
function ringTexture(a,b){const A=p.textureAmount;switch(p.texture){case'voronoi':return(Math.sin(a*p.textureScale)+Math.sin(b*p.textureScale*1.3)+Math.sin((a+b)*p.textureScale*.7))*A*.09;case'hammered':return(Math.sin(a*13+Math.sin(b*7))+Math.sin(b*11+p.seed))*A*.13;case'ripple':return Math.sin(a*p.textureScale+b*2)*A*.2;case'bark':return(Math.sin(a*p.textureScale*1.8)+.45*Math.sin(a*p.textureScale*4.1+b))*A*.16;case'sand':return(hash(a*91+b*53)-.5)*A*.16;default:return 0}}
function ringGeometry(rn,tn){const pos=[],idx=[],inner=p.diameter/2;for(let i=0;i<rn;i++){const a=i/rn*Math.PI*2,wave=p.mode==='classic'?0:Math.sin(a*(p.mode==='coral'?7:3)+p.seed)*p.flow*.28;for(let j=0;j<tn;j++){const b=j/tn*Math.PI*2,bt=b+a*p.twist*.2,q=(Math.cos(bt)+1)*.5,band=Math.max(p.minWall,p.width+wave*q+ringTexture(a,b)*q),r=inner+q*band,y=Math.sin(bt)*Math.max(.7,p.width*.42)+(p.mode==='coral'?Math.sin(a*5)*p.flow*.18*q:0);pos.push(r*Math.cos(a),y,r*Math.sin(a))}}for(let i=0;i<rn;i++)for(let j=0;j<tn;j++){const ni=(i+1)%rn,nj=(j+1)%tn,a=i*tn+j,b=ni*tn+j,c=ni*tn+nj,d=i*tn+nj;idx.push(a,b,d,b,c,d)}return makeGeometry(pos,idx)}

function isSvg(file){return file.type==='image/svg+xml'||/\.svg$/i.test(file.name)}
function loadImageUrl(url,maxSide,label){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{try{resolve(analyzeRasterImage(img,maxSide))}catch(e){reject(e)}};img.onerror=reject;img.src=url})}
async function analyzeSource(file){
  if(!file){toast('Choose PNG, JPG, WEBP or SVG');return}
  const svg=isSvg(file),raster=file.type.startsWith('image/');
  if(!svg&&!raster){toast('Supported: PNG · JPG · WEBP · SVG');return}
  try{
    let map;
    if(svg){
      // SVG remains the authoring source. We rasterize it only into a dense analysis map so
      // vector curves enter the same watertight relief pipeline without losing their clean contour.
      const text=await file.text();
      const blob=new Blob([text],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);
      try{map=await loadImageUrl(url,900,'SVG')}finally{URL.revokeObjectURL(url)}
      sourceKind='SVG VECTOR';
    }else{
      const url=URL.createObjectURL(file);
      try{map=await loadImageUrl(url,460,'RASTER')}finally{URL.revokeObjectURL(url)}
      sourceKind='RASTER';
    }
    imageMap=map;sourceName=file.name;p.piece='pendant';
    $('#sourceState').textContent=`${file.name} · ${sourceKind} · ${map.alphaCutout?'alpha silhouette':'outer body'} · ${map.w}×${map.h}`;
    rebuild();toast(svg?'SVG loaded · vector contour sampled at high resolution':'Image loaded · relief map ready');
  }catch(error){console.error(error);toast(isSvg(file)?'Could not parse SVG':'Image analysis failed')}
}

function placeholderMap(){const w=120,h=150,mask=new Uint8Array(w*h),luminance=new Float32Array(w*h).fill(.92),edge=new Float32Array(w*h),detail=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const dx=(x-w/2)/(w*.47),dy=(y-h/2)/(h*.47);if(dx*dx+dy*dy<1)mask[y*w+x]=1}return{w,h,aspect:w/h,mask,luminance,edge,detail,alphaCutout:false}}
function clearModel(){while(model.children.length){const o=model.children.pop();o.geometry?.dispose()}}
function rebuild(){clearModel();let geometry;if(p.piece==='pendant'){geometry=buildPendantGeometry(imageMap||placeholderMap(),p,150);camera.position.set(0,0,Math.max(55,p.pendantWidth*2.4));controls.target.set(0,0,p.pendantBase*.4)}else{geometry=ringGeometry(...QUALITY.preview);camera.position.set(0,18,62);controls.target.set(0,0,0)}mesh=new THREE.Mesh(geometry,material);model.add(mesh);metrics();syncUI()}
function metrics(){const v=validateMesh(mesh.geometry);$('#verts').textContent=mesh.geometry.attributes.position.count.toLocaleString();$('#tris').textContent=(mesh.geometry.index.count/3).toLocaleString();$('#checkClosed').textContent=v.closed?'PASS ✓':'CHECK';$('#checkEdges').textContent=`${v.boundary} / ${v.nonManifold}`;$('#checkBox').textContent=`${v.size.x.toFixed(1)} × ${v.size.y.toFixed(1)} × ${v.size.z.toFixed(1)} mm`;$('#pieceMetric').textContent=p.piece.toUpperCase();$('#sizeMetric').textContent=p.piece==='ring'?`Ø ${p.diameter.toFixed(2)} mm`:`${p.pendantWidth.toFixed(1)} × ${(p.pendantWidth/(imageMap?.aspect||.8)).toFixed(1)} mm · ${p.pendantBase.toFixed(1)} mm base`}
function syncUI(){$('#ringTools').classList.toggle('hidden',p.piece!=='ring');$('#pendantTools').classList.toggle('hidden',p.piece!=='pendant');$$('[data-piece]').forEach(b=>b.classList.toggle('active',b.dataset.piece===p.piece));$$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===p.mode));$$('[data-texture]').forEach(b=>b.classList.toggle('active',b.dataset.texture===p.texture));$$('[data-relief]').forEach(b=>b.classList.toggle('active',b.dataset.relief===p.relief));$('#modeChip').textContent=p.piece.toUpperCase();$('#activeStyle').textContent=p.piece==='ring'?`RING / ${p.mode.toUpperCase()}`:`PENDANT / ${p.relief.toUpperCase()}`;$$('input[type=range]').forEach(input=>{if(p[input.dataset.p]!=null)input.value=p[input.dataset.p];const label=input.previousElementSibling?.querySelector('span');if(label)label.textContent=['diameter','minWall'].includes(input.dataset.p)?Number(input.value).toFixed(2):input.value})}
function productionMesh(){let geometry;if(p.piece==='pendant'){const q=$('#exportQuality').value==='ultra'?360:$('#exportQuality').value==='jewelry'?280:200;geometry=buildPendantGeometry(imageMap||placeholderMap(),p,q)}else geometry=ringGeometry(...QUALITY[$('#exportQuality').value]);return new THREE.Mesh(geometry,material)}
function download(name,data,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportFile(kind){const production=productionMesh(),check=validateMesh(production.geometry);if(!check.closed){toast(`Export blocked · ${check.boundary} open / ${check.nonManifold} non-manifold`);production.geometry.dispose();return}const group=new THREE.Group();group.add(production);const name=($('#projectName').value||`${p.piece}-design`).trim();if(kind==='stl')download(name+'_mm.stl',new STLExporter().parse(group,{binary:true}),'model/stl');else download(name+'_mm.obj',`# ORGANICA OS\n# units: millimeters\n# source: ${sourceName||'parametric'}\n# source-type: ${sourceKind||'parametric'}\n`+new OBJExporter().parse(group),'text/plain');production.geometry.dispose();toast(`${kind.toUpperCase()} exported · watertight · mm`)}
function saveProject(){const name=($('#projectName').value||`Jewel-${projects.length+1}`).trim();projects.unshift({id:Date.now(),name,date:new Date().toLocaleString(),params:{...p},source:sourceName,sourceKind});localStorage.setItem('organica-projects',JSON.stringify(projects));renderProjects();toast('Design saved')}
function renderProjects(){const grid=$('#fileGrid');grid.innerHTML=projects.length?'':'<div class="file-card"><b>NO DESIGNS</b><small>Create your first piece.</small></div>';projects.forEach(pr=>{const card=document.createElement('div');card.className='file-card';card.innerHTML=`<b>${pr.name}</b><small>${(pr.params?.piece||'ring').toUpperCase()} · ${pr.date}</small><button class="btn">OPEN</button>`;card.querySelector('button').onclick=()=>{p={...p,...pr.params};rebuild();closeWin('projectsWin')};grid.appendChild(card)})}
$$('input[type=range]').forEach(input=>input.oninput=()=>{p[input.dataset.p]=Number(input.value);rebuild()});$$('[data-piece]').forEach(b=>b.onclick=()=>{p.piece=b.dataset.piece;rebuild()});$$('[data-mode]').forEach(b=>b.onclick=()=>{p.mode=b.dataset.mode;rebuild()});$$('[data-texture]').forEach(b=>b.onclick=()=>{p.texture=b.dataset.texture;rebuild()});$$('[data-relief]').forEach(b=>b.onclick=()=>{p.relief=b.dataset.relief;rebuild()});$('#sourceInput').onchange=e=>analyzeSource(e.target.files?.[0]);$('#preflight').onclick=()=>{const v=validateMesh(mesh.geometry);toast(v.closed?'Watertight mesh · export ready':`Mesh check · ${v.boundary} open / ${v.nonManifold} non-manifold`)};$('#save').onclick=saveProject;$('#exportStl').onclick=()=>exportFile('stl');$('#exportObj').onclick=()=>exportFile('obj');
function openWin(id){$('#'+id)?.classList.remove('hidden')}function closeWin(id){$('#'+id)?.classList.add('hidden')}$$('[data-open]').forEach(b=>b.onclick=()=>openWin(b.dataset.open));$$('[data-close]').forEach(b=>b.onclick=()=>closeWin(b.dataset.close));$$('[data-max]').forEach(b=>b.onclick=()=>$('#'+b.dataset.max)?.classList.toggle('maximized'));
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2400)}
function resize(){const r=stage.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix()}new ResizeObserver(resize).observe(stage);resize();
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}animate();
function term(line){const div=document.createElement('div');div.innerHTML=line;$('#term').insertBefore(div,$('.terminal-input'))}$('#cmd').addEventListener('keydown',e=>{if(e.key!=='Enter')return;const c=e.target.value.trim().toLowerCase();term(`<span class="prompt">›</span> ${c}`);if(c==='projects')openWin('projectsWin');else if(c==='save')saveProject();else if(c==='obj')exportFile('obj');else if(c==='stl')exportFile('stl');else if(c==='check'){const v=validateMesh(mesh.geometry);term(v.closed?'<span class="gold">watertight / manifold / ready</span>':`open=${v.boundary} nonmanifold=${v.nonManifold}`)}else if(c==='clear')$$('#term>div:not(.terminal-input)').forEach(x=>x.remove());else term('commands: projects · save · obj · stl · check · clear');e.target.value='' });
renderProjects();rebuild();