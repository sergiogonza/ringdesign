import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const stage=$('#stage'), scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(34,1,.1,2000);
camera.position.set(0,18,62);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.25;
stage.prepend(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xffefd1,0x111412,2.1));
const key=new THREE.DirectionalLight(0xffd67d,5.5); key.position.set(30,45,30); scene.add(key);
const rim=new THREE.PointLight(0xb8fff1,65,120); rim.position.set(-35,10,25); scene.add(rim);
const floor=new THREE.GridHelper(100,20,0x554a31,0x181b19); floor.position.y=-16; scene.add(floor);
const model=new THREE.Group(); scene.add(model);
const gold=new THREE.MeshPhysicalMaterial({color:0xd2a846,metalness:1,roughness:.18,clearcoat:.45,clearcoatRoughness:.12});

let mesh=null;
let p={diameter:18.2,width:4.2,depth:1.1,flow:1.4,frequency:3,twist:.8,asymmetry:.35,textureAmount:.65,textureScale:6,minWall:1.2,seed:2.1,mode:'liquid',texture:'smooth'};
let projects=JSON.parse(localStorage.getItem('organica-projects')||'[]');
const QUALITY={preview:[220,32],standard:[360,48],jewelry:[560,72],ultra:[800,96]};

function hash(x){const v=Math.sin(x*127.1+p.seed*311.7)*43758.5453;return v-Math.floor(v)}
function vor(a,b){let k=p.textureScale,ca=Math.floor(a*k/6.283),cb=Math.floor(b*k/6.283),best=9;for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++){let ix=ca+x,iy=cb+y,rx=(ix+.5+.35*hash(ix*9+iy*3))*6.283/k,ry=(iy+.5+.35*hash(iy*11+ix*5))*6.283/k,da=Math.atan2(Math.sin(a-rx),Math.cos(a-rx)),db=Math.atan2(Math.sin(b-ry),Math.cos(b-ry));best=Math.min(best,Math.sqrt(da*da+db*db)*k)}return Math.min(1,best)}
function skin(a,b){const A=p.textureAmount;switch(p.texture){case'voronoi':return(0.55-vor(a,b))*A*.42;case'hammered':return(Math.sin(a*p.textureScale*2.1+Math.sin(b*7))+Math.sin(b*p.textureScale*1.7+p.seed))*A*.13;case'ripple':return Math.sin(a*p.textureScale+b*2)*A*.22;case'bark':return(Math.sin(a*p.textureScale*1.8+p.seed)+.45*Math.sin(a*p.textureScale*4.1+b))*A*.18;case'sand':return(hash(a*91+b*53)-.5)*A*.18;default:return 0}}
function form(a){let radial=0,y=0,profile=1;switch(p.mode){case'classic':break;case'twist':radial=Math.sin(a*p.frequency+p.seed)*p.flow*.18;y=Math.sin(a*p.frequency*.5)*p.flow*.18;break;case'ribbon':radial=Math.sin(a*p.frequency+p.seed)*p.flow*.24;profile=.62+.32*(.5+.5*Math.sin(a*2+p.seed));break;case'coral':radial=(Math.sin(a*p.frequency+p.seed)+.55*Math.sin(a*(p.frequency+4)+p.seed*2))*p.flow*.28;y=Math.sin(a*3+p.seed)*p.asymmetry*.7;profile=.9+.18*Math.sin(a*7);break;case'braid':radial=Math.sin(a*p.frequency+p.seed)*p.flow*.2;y=Math.cos(a*p.frequency+p.seed)*p.flow*.28;profile=.78+.22*Math.sin(a*6);break;default:radial=Math.sin(a*p.frequency+p.seed)*p.flow*.32+Math.sin(a*7+p.seed*.7)*p.asymmetry*.28;y=Math.sin(a*2+p.seed)*p.asymmetry*.3}return{radial,y,profile}}

function buildRingGeometry(radialN,tubeN){
  const pos=[],idx=[],inner=p.diameter/2,halfH=Math.max(.45,p.width*.5*(.72+p.depth*.14));
  for(let i=0;i<radialN;i++){
    const a=i/radialN*Math.PI*2,F=form(a);
    for(let j=0;j<tubeN;j++){
      const b=j/tubeN*Math.PI*2;
      const bt=b+a*p.twist*.22;
      const q=(Math.cos(bt)+1)*.5; // 0 = protected inner circle, 1 = outer surface
      const outerDelta=F.radial+skin(a,b);
      const localWidth=Math.max(p.minWall,p.width*F.profile+outerDelta);
      const r=inner+q*localWidth;
      const y=(Math.sin(bt)*halfH)+(F.y*q*q);
      pos.push(r*Math.cos(a),y,r*Math.sin(a));
    }
  }
  for(let i=0;i<radialN;i++)for(let j=0;j<tubeN;j++){
    const ni=(i+1)%radialN,nj=(j+1)%tubeN;
    const a=i*tubeN+j,b=ni*tubeN+j,c=ni*tubeN+nj,d=i*tubeN+nj;
    idx.push(a,b,d,b,c,d);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

function clear(){while(model.children.length){const o=model.children.pop();o.geometry?.dispose()}}
function ring(){clear();const [rn,tn]=QUALITY.preview;mesh=new THREE.Mesh(buildRingGeometry(rn,tn),gold);model.add(mesh);metrics();labels();log(`preview ${p.mode}/${p.texture} · Ø${p.diameter.toFixed(2)}mm`)}
function labels(){$('#modeChip').textContent=p.mode.toUpperCase();$('#formMetric').textContent=p.mode.toUpperCase();$('#skinMetric').textContent=p.texture.toUpperCase();$('#activeStyle').textContent=p.mode.toUpperCase()+' / '+p.texture.toUpperCase()}

function validateGeometry(g){
  const pos=g.attributes.position,index=g.index.array,edgeMap=new Map(); let degenerate=0;
  const edge=(a,b)=>{const k=a<b?`${a}:${b}`:`${b}:${a}`;edgeMap.set(k,(edgeMap.get(k)||0)+1)};
  for(let i=0;i<index.length;i+=3){const a=index[i],b=index[i+1],c=index[i+2];edge(a,b);edge(b,c);edge(c,a);const A=new THREE.Vector3().fromBufferAttribute(pos,a),B=new THREE.Vector3().fromBufferAttribute(pos,b),C=new THREE.Vector3().fromBufferAttribute(pos,c);if(new THREE.Vector3().subVectors(B,A).cross(new THREE.Vector3().subVectors(C,A)).lengthSq()<1e-12)degenerate++}
  let boundary=0,nonManifold=0; for(const n of edgeMap.values()){if(n===1)boundary++;else if(n!==2)nonManifold++}
  g.computeBoundingBox(); const size=new THREE.Vector3(); g.boundingBox.getSize(size);
  let minRadius=Infinity;for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);minRadius=Math.min(minRadius,Math.hypot(x,z))}
  const innerError=Math.abs(minRadius-p.diameter/2);
  return{boundary,nonManifold,degenerate,size,innerError,closed:boundary===0&&nonManifold===0&&degenerate===0};
}
function runPreflight(g=mesh.geometry,notify=true){const v=validateGeometry(g);$('#checkClosed').textContent=v.closed?'PASS ✓':'FAIL';$('#checkEdges').textContent=`${v.boundary} / ${v.nonManifold}`;$('#checkInner').textContent=v.innerError.toFixed(3)+' mm';$('#checkBox').textContent=`${v.size.x.toFixed(2)} × ${v.size.y.toFixed(2)} × ${v.size.z.toFixed(2)} mm`;$('#checkClosed').closest('.metric').classList.toggle('good',v.closed);if(notify){toast(v.closed&&v.innerError<.02?'Manufacturing preflight passed':'Preflight needs attention');log(`preflight: boundary=${v.boundary}, nonmanifold=${v.nonManifold}, degenerate=${v.degenerate}, inner error=${v.innerError.toFixed(4)}mm`)}return v}
function metrics(){if(!mesh)return;const g=mesh.geometry;$('#diam').textContent=p.diameter.toFixed(2)+' mm';$('#verts').textContent=g.attributes.position.count.toLocaleString();$('#tris').textContent=Math.round(g.index.count/3).toLocaleString();$('#wall').textContent=p.minWall.toFixed(2)+' mm';runPreflight(g,false)}

function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}new ResizeObserver(resize).observe(stage);(function loop(){requestAnimationFrame(loop);controls.update();renderer.render(scene,camera)})();
function log(s){const t=$('#term');t.innerHTML+=`<div><span class="prompt">root@organica</span>: <span class="gold">~</span> ${s}</div>`;t.scrollTop=t.scrollHeight}
function toast(s){const x=$('#toast');x.textContent=s;x.classList.add('show');setTimeout(()=>x.classList.remove('show'),1800)}
function download(name,data,type='application/octet-stream'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function productionMesh(){const q=$('#exportQuality')?.value||'jewelry',[rn,tn]=QUALITY[q];return new THREE.Mesh(buildRingGeometry(rn,tn),gold)}
function exportOBJ(){const pm=productionMesh(),v=runPreflight(pm.geometry,true);if(!v.closed)return;const wrapper=new THREE.Group();wrapper.add(pm);const body=new OBJExporter().parse(wrapper);const header=`# ORGANICA OS Jewelry Geometry\n# Units: millimeters (1 model unit = 1 mm)\n# Inner diameter: ${p.diameter.toFixed(3)} mm\n# Preflight: closed manifold; boundary edges ${v.boundary}; non-manifold edges ${v.nonManifold}\n`;download((($('#projectName').value||'organic-jewel').trim())+'_mm.obj',header+body,'text/plain');pm.geometry.dispose()}
function exportSTL(){const pm=productionMesh(),v=runPreflight(pm.geometry,true);if(!v.closed)return;const wrapper=new THREE.Group();wrapper.add(pm);const buf=new STLExporter().parse(wrapper,{binary:true});download((($('#projectName').value||'organic-jewel').trim())+'_mm.stl',buf,'model/stl');pm.geometry.dispose();log('binary STL exported; coordinates are millimeters')}
function exportSpecs(){const spec={generator:'ORGANICA OS',units:'millimeters',scale:'1:1',innerDiameterMm:p.diameter,minimumRadialThicknessTargetMm:p.minWall,parameters:{...p},note:'STL and OBJ coordinates are authored in millimeters. STL itself does not encode a standardized unit; select millimeters when importing into CAD/slicer.'};download((($('#projectName').value||'organic-jewel').trim())+'_specs.json',JSON.stringify(spec,null,2),'application/json')}

function saveProject(){const name=($('#projectName').value||`Jewel-${String(projects.length+1).padStart(3,'0')}`).trim(),meta={id:Date.now(),name,date:new Date().toLocaleString(),params:{...p}};projects.unshift(meta);localStorage.setItem('organica-projects',JSON.stringify(projects));renderProjects();log(`saved parametric project /Designs/${name}`);toast('Design parameters saved')}
function renderProjects(){const g=$('#fileGrid');g.innerHTML=projects.length?'':'<div class="file-card"><b>NO DESIGNS</b><small>Save your first jewelry project.</small></div>';projects.forEach(pr=>{const d=document.createElement('div');d.className='file-card';d.innerHTML=`<b>◫ ${pr.name}</b><small>${pr.params?.mode||'ring'} / ${pr.params?.texture||'smooth'}<br>${pr.date}<br>PARAMETRIC · MM</small><button class="btn open">OPEN</button>`;d.querySelector('.open').onclick=()=>{p={...p,...pr.params};sync();ring();closeWin('projectsWin');toast(pr.name+' loaded')};g.appendChild(d)})}
function sync(){$$('input[type=range]').forEach(e=>{if(p[e.dataset.p]!=null)e.value=p[e.dataset.p];e.previousElementSibling.querySelector('span').textContent=e.dataset.p==='diameter'||e.dataset.p==='minWall'?Number(e.value).toFixed(2):e.value});$$('#formModes .tool').forEach(b=>b.classList.toggle('active',b.dataset.mode===p.mode));$$('#textureModes .tool').forEach(b=>b.classList.toggle('active',b.dataset.texture===p.texture));labels()}
$$('input[type=range]').forEach(e=>e.oninput=()=>{p[e.dataset.p]=+e.value;e.previousElementSibling.querySelector('span').textContent=e.dataset.p==='diameter'||e.dataset.p==='minWall'?Number(e.value).toFixed(2):e.value;ring()});
$$('#formModes .tool').forEach(b=>b.onclick=()=>{p.mode=b.dataset.mode;sync();ring()});$$('#textureModes .tool').forEach(b=>b.onclick=()=>{p.texture=b.dataset.texture;sync();ring()});
const presets={soft:{mode:'liquid',texture:'smooth',flow:1.2,frequency:3,twist:.5,asymmetry:.3},cellular:{mode:'liquid',texture:'voronoi',flow:1.5,frequency:4,twist:1.2,asymmetry:.5,textureAmount:1.35,textureScale:8},torsion:{mode:'twist',texture:'ripple',flow:2.2,frequency:5,twist:5,asymmetry:.4,textureAmount:.45},eroded:{mode:'coral',texture:'hammered',flow:2.4,frequency:6,twist:2.5,asymmetry:1.1,textureAmount:1.2},ripple:{mode:'ribbon',texture:'ripple',flow:1.4,frequency:4,twist:2,asymmetry:.35,textureAmount:.8,textureScale:10},coral:{mode:'coral',texture:'bark',flow:2.7,frequency:5,twist:1.5,asymmetry:1.2,textureAmount:.8,textureScale:7}};
$$('[data-preset]').forEach(b=>b.onclick=()=>{Object.assign(p,presets[b.dataset.preset]);sync();ring()});
$('#random').onclick=()=>{p.seed=Math.random()*40;p.flow=.4+Math.random()*3.2;p.asymmetry=Math.random()*1.5;p.textureAmount=Math.random()*1.8;sync();ring()};
$('#mutate').onclick=()=>{p.seed+=Math.random()*2-.5;p.flow=Math.max(0,p.flow+(Math.random()-.5)*.45);p.asymmetry=Math.max(0,p.asymmetry+(Math.random()-.5)*.25);sync();ring()};
$('#wire').onclick=()=>gold.wireframe=!gold.wireframe;
$('#resetView').onclick=()=>{camera.position.set(0,18,62);controls.target.set(0,0,0);controls.update()};
$('#save').onclick=saveProject; $('#exportObj').onclick=exportOBJ; $('#exportStl').onclick=exportSTL; $('#exportSpecs').onclick=exportSpecs; $('#preflight').onclick=()=>runPreflight();
$('#svgInput').onchange=e=>{const f=e.target.files[0];if(!f)return;new Response(f).text().then(txt=>{clear();const data=new SVGLoader().parse(txt),sh=[];data.paths.forEach(path=>sh.push(...SVGLoader.createShapes(path)));if(!sh.length)return toast('SVG needs closed filled paths');const g=new THREE.ExtrudeGeometry(sh,{depth:1.5,bevelEnabled:true,bevelThickness:.25,bevelSize:.2,bevelSegments:4,curveSegments:20});g.center();mesh=new THREE.Mesh(g,gold);model.add(mesh);metrics();log(`SVG ${f.name} → 3D geometry; verify intended SVG scale before production`)})};

function openWin(id){$('#'+id).classList.remove('hidden')}function closeWin(id){$('#'+id).classList.add('hidden')}window.closeWin=closeWin;
$$('[data-open]').forEach(b=>b.onclick=()=>openWin(b.dataset.open));$$('[data-close]').forEach(b=>b.onclick=()=>closeWin(b.dataset.close));$$('[data-max]').forEach(b=>b.onclick=()=>$('#'+b.dataset.max).classList.toggle('max'));
$$('.titlebar').forEach(bar=>{let sx,sy,l,t,w=bar.parentElement;bar.onpointerdown=e=>{if(e.target.tagName==='BUTTON')return;sx=e.clientX;sy=e.clientY;l=w.offsetLeft;t=w.offsetTop;bar.setPointerCapture(e.pointerId);bar.onpointermove=v=>{w.style.left=l+v.clientX-sx+'px';w.style.top=t+v.clientY-sy+'px'};bar.onpointerup=()=>bar.onpointermove=null}});
$('#cmd').onkeydown=e=>{if(e.key!=='Enter')return;const c=e.target.value.trim().toLowerCase();log('$ '+c);if(c==='projects')openWin('projectsWin');else if(c==='save')saveProject();else if(c==='obj')exportOBJ();else if(c==='stl')exportSTL();else if(c==='check')runPreflight();else if(c==='random')$('#random').click();else if(c==='mutate')$('#mutate').click();else if(c==='wire')$('#wire').click();else if(c==='clear')$('#term').innerHTML='';else log('commands: projects · save · obj · stl · check · random · mutate · wire · clear');e.target.value=''};
renderProjects();sync();ring();log('ORGANICA OS v0.4 production mesh kernel ready');log('watertight periodic topology · protected inner diameter · OBJ/STL millimeter coordinates');