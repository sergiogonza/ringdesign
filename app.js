import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const stage = $('#stage');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 2000);
camera.position.set(0, 18, 62);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.prepend(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xfff2d7, 0x151718, 2.7));
const key = new THREE.DirectionalLight(0xffcf72, 4.1);
key.position.set(25, 35, 45);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 1.2);
fill.position.set(-25, 15, 35);
scene.add(fill);

const model = new THREE.Group();
scene.add(model);

const material = new THREE.MeshPhysicalMaterial({
  color: 0xb98a32,
  metalness: 0.93,
  roughness: 0.31,
  clearcoat: 0.22,
  side: THREE.DoubleSide
});

let mesh = null;
let imageMap = null;
let sourceName = '';
let projects = JSON.parse(localStorage.getItem('organica-projects') || '[]');

let p = {
  piece: 'ring',
  diameter: 18.2,
  width: 4.2,
  minWall: 1.2,
  flow: 1.4,
  twist: 0.8,
  textureAmount: 0.65,
  textureScale: 7,
  seed: 2.1,
  mode: 'liquid',
  texture: 'smooth',
  pendantWidth: 28,
  pendantBase: 2,
  reliefDepth: 0.65,
  reliefDetail: 0.85,
  relief: 'laser'
};

const QUALITY = {
  preview: [180, 28],
  standard: [260, 40],
  jewelry: [420, 60],
  ultra: [600, 80]
};

function hash(x) {
  const v = Math.sin(x * 127.1 + p.seed * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function ringTexture(a, b) {
  const A = p.textureAmount;
  switch (p.texture) {
    case 'voronoi':
      return (Math.sin(a * p.textureScale) + Math.sin(b * p.textureScale * 1.3) + Math.sin((a + b) * p.textureScale * 0.7)) * A * 0.09;
    case 'hammered':
      return (Math.sin(a * 13 + Math.sin(b * 7)) + Math.sin(b * 11 + p.seed)) * A * 0.13;
    case 'ripple':
      return Math.sin(a * p.textureScale + b * 2) * A * 0.2;
    case 'bark':
      return (Math.sin(a * p.textureScale * 1.8) + 0.45 * Math.sin(a * p.textureScale * 4.1 + b)) * A * 0.16;
    case 'sand':
      return (hash(a * 91 + b * 53) - 0.5) * A * 0.16;
    default:
      return 0;
  }
}

function makeGeometry(positions, indices) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function ringGeometry(radialN, tubeN) {
  const positions = [];
  const indices = [];
  const inner = p.diameter / 2;

  for (let i = 0; i < radialN; i++) {
    const a = (i / radialN) * Math.PI * 2;
    const wave = p.mode === 'classic' ? 0 : Math.sin(a * (p.mode === 'coral' ? 7 : 3) + p.seed) * p.flow * 0.28;

    for (let j = 0; j < tubeN; j++) {
      const b = (j / tubeN) * Math.PI * 2;
      const bt = b + a * p.twist * 0.2;
      const q = (Math.cos(bt) + 1) * 0.5;
      const band = Math.max(p.minWall, p.width + wave * q + ringTexture(a, b) * q);
      const r = inner + q * band;
      const y = Math.sin(bt) * Math.max(0.7, p.width * 0.42) + (p.mode === 'coral' ? Math.sin(a * 5) * p.flow * 0.18 * q : 0);
      positions.push(r * Math.cos(a), y, r * Math.sin(a));
    }
  }

  for (let i = 0; i < radialN; i++) {
    for (let j = 0; j < tubeN; j++) {
      const ni = (i + 1) % radialN;
      const nj = (j + 1) % tubeN;
      const a = i * tubeN + j;
      const b = ni * tubeN + j;
      const c = ni * tubeN + nj;
      const d = i * tubeN + nj;
      indices.push(a, b, d, b, c, d);
    }
  }

  return makeGeometry(positions, indices);
}

function sampleField(field, w, h, u, v) {
  const x = Math.max(0, Math.min(w - 1, Math.round(u * (w - 1))));
  const y = Math.max(0, Math.min(h - 1, Math.round(v * (h - 1))));
  return field[y * w + x];
}

function blurField(field, w, h) {
  const out = new Float32Array(field.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let yy = -1; yy <= 1; yy++) {
        for (let xx = -1; xx <= 1; xx++) {
          const sx = Math.max(0, Math.min(w - 1, x + xx));
          const sy = Math.max(0, Math.min(h - 1, y + yy));
          sum += field[sy * w + sx];
          n++;
        }
      }
      out[y * w + x] = sum / n;
    }
  }
  return out;
}

function buildImageMap(img) {
  const maxSide = 240;
  const ratio = img.width / img.height;
  const w = ratio >= 1 ? maxSide : Math.max(48, Math.round(maxSide * ratio));
  const h = ratio >= 1 ? Math.max(48, Math.round(maxSide / ratio)) : maxSide;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const rgba = ctx.getImageData(0, 0, w, h).data;
  const luminance = new Float32Array(w * h);
  const alpha = new Float32Array(w * h);

  for (let i = 0; i < w * h; i++) {
    luminance[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
    alpha[i] = rgba[i * 4 + 3] / 255;
  }

  // Crop only obvious empty/white margins. The remaining image itself becomes the pendant body.
  let minX = w - 1;
  let maxX = 0;
  let minY = h - 1;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const content = alpha[i] > 0.08 && luminance[i] < 0.985;
      if (content) {
        found = true;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (!found) {
    minX = 0; maxX = w - 1; minY = 0; maxY = h - 1;
  }

  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const cropped = new Float32Array(cw * ch);

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      cropped[y * cw + x] = luminance[(y + minY) * w + (x + minX)];
    }
  }

  const smooth = blurField(cropped, cw, ch);
  const edge = new Float32Array(cw * ch);

  // Simple Sobel-like edge field: useful for laser-style engraved lines.
  for (let y = 1; y < ch - 1; y++) {
    for (let x = 1; x < cw - 1; x++) {
      const gx = smooth[y * cw + x + 1] - smooth[y * cw + x - 1];
      const gy = smooth[(y + 1) * cw + x] - smooth[(y - 1) * cw + x];
      edge[y * cw + x] = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 4.5);
    }
  }

  return { w: cw, h: ch, luminance: smooth, edge, aspect: cw / ch };
}

function analyzeImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    toast('Please choose PNG, JPG or WEBP');
    return;
  }

  const img = new Image();
  const url = URL.createObjectURL(file);

  img.onload = () => {
    try {
      imageMap = buildImageMap(img);
      sourceName = file.name;
      p.piece = 'pendant';
      $('#sourceState').textContent = `${file.name} · ${imageMap.w}×${imageMap.h} analyzed`;
      rebuild();
      toast('Image loaded · engraving map ready');
    } catch (error) {
      console.error(error);
      toast('Image analysis failed');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    toast('Could not decode image');
  };

  img.src = url;
}

function pendantTopZ(u, v) {
  if (!imageMap) return p.pendantBase;
  const lum = sampleField(imageMap.luminance, imageMap.w, imageMap.h, u, v);
  const edge = sampleField(imageMap.edge, imageMap.w, imageMap.h, u, v);
  const ink = Math.pow(1 - lum, 1.15);

  if (p.relief === 'laser') {
    const cut = Math.max(edge * 0.95, ink * 0.32);
    return Math.max(0.35, p.pendantBase - p.reliefDepth * cut * p.reliefDetail);
  }
  if (p.relief === 'emboss') {
    return p.pendantBase + p.reliefDepth * ink * p.reliefDetail;
  }
  return Math.max(0.35, p.pendantBase + p.reliefDepth * (0.5 - lum) * 1.4 * p.reliefDetail);
}

// A regular rectangular closed solid is intentionally used here because it is predictable,
// watertight and export-safe. The image crop determines its aspect ratio; the image does not
// get placed inside a second medal/oval.
function pendantGeometry(nx, ny) {
  const aspect = imageMap?.aspect || 0.78;
  const W = p.pendantWidth;
  const H = W / aspect;
  const positions = [];
  const indices = [];

  const top = Array.from({ length: ny + 1 }, () => Array(nx + 1));
  const bottom = Array.from({ length: ny + 1 }, () => Array(nx + 1));

  for (let y = 0; y <= ny; y++) {
    for (let x = 0; x <= nx; x++) {
      const u = x / nx;
      const v = y / ny;
      const X = (u - 0.5) * W;
      const Y = (0.5 - v) * H;

      top[y][x] = positions.length / 3;
      positions.push(X, Y, pendantTopZ(u, v));

      bottom[y][x] = positions.length / 3;
      positions.push(X, Y, 0);
    }
  }

  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const a = top[y][x], b = top[y][x + 1], c = top[y + 1][x + 1], d = top[y + 1][x];
      const A = bottom[y][x], B = bottom[y][x + 1], C = bottom[y + 1][x + 1], D = bottom[y + 1][x];
      indices.push(a, d, b, b, d, c);
      indices.push(A, B, D, B, C, D);
    }
  }

  function wall(aTop, bTop, aBottom, bBottom, flip = false) {
    if (!flip) indices.push(aTop, aBottom, bTop, bTop, aBottom, bBottom);
    else indices.push(aTop, bTop, aBottom, bTop, bBottom, aBottom);
  }

  for (let x = 0; x < nx; x++) {
    wall(top[0][x], top[0][x + 1], bottom[0][x], bottom[0][x + 1], true);
    wall(top[ny][x], top[ny][x + 1], bottom[ny][x], bottom[ny][x + 1], false);
  }
  for (let y = 0; y < ny; y++) {
    wall(top[y][0], top[y + 1][0], bottom[y][0], bottom[y + 1][0], false);
    wall(top[y][nx], top[y + 1][nx], bottom[y][nx], bottom[y + 1][nx], true);
  }

  return makeGeometry(positions, indices);
}

function clearModel() {
  while (model.children.length) {
    const o = model.children.pop();
    o.geometry?.dispose();
  }
}

function rebuild() {
  clearModel();
  let geometry;

  if (p.piece === 'pendant') {
    const q = 100;
    const ny = Math.max(40, Math.round(q / (imageMap?.aspect || 0.78)));
    geometry = pendantGeometry(q, ny);
    camera.position.set(0, 0, Math.max(55, p.pendantWidth * 2.4));
    controls.target.set(0, 0, p.pendantBase * 0.4);
  } else {
    geometry = ringGeometry(...QUALITY.preview);
    camera.position.set(0, 18, 62);
    controls.target.set(0, 0, 0);
  }

  mesh = new THREE.Mesh(geometry, material);
  model.add(mesh);
  metrics();
  syncUI();
}

function validate(g) {
  const edgeMap = new Map();
  const index = g.index.array;

  for (let i = 0; i < index.length; i += 3) {
    const tri = [index[i], index[i + 1], index[i + 2]];
    for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
    }
  }

  let boundary = 0;
  let nonManifold = 0;
  for (const count of edgeMap.values()) {
    if (count === 1) boundary++;
    else if (count !== 2) nonManifold++;
  }

  g.computeBoundingBox();
  const size = new THREE.Vector3();
  g.boundingBox.getSize(size);

  return { boundary, nonManifold, closed: boundary === 0 && nonManifold === 0, size };
}

function metrics() {
  const v = validate(mesh.geometry);
  $('#verts').textContent = mesh.geometry.attributes.position.count.toLocaleString();
  $('#tris').textContent = (mesh.geometry.index.count / 3).toLocaleString();
  $('#checkClosed').textContent = v.closed ? 'PASS ✓' : 'CHECK';
  $('#checkEdges').textContent = `${v.boundary} / ${v.nonManifold}`;
  $('#checkBox').textContent = `${v.size.x.toFixed(1)} × ${v.size.y.toFixed(1)} × ${v.size.z.toFixed(1)} mm`;
  $('#pieceMetric').textContent = p.piece.toUpperCase();
  $('#sizeMetric').textContent = p.piece === 'ring'
    ? `Ø ${p.diameter.toFixed(2)} mm`
    : `${p.pendantWidth.toFixed(1)} × ${(p.pendantWidth / (imageMap?.aspect || 0.78)).toFixed(1)} mm`;
}

function syncUI() {
  $('#ringTools').classList.toggle('hidden', p.piece !== 'ring');
  $('#pendantTools').classList.toggle('hidden', p.piece !== 'pendant');
  $$('[data-piece]').forEach(b => b.classList.toggle('active', b.dataset.piece === p.piece));
  $$('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === p.mode));
  $$('[data-texture]').forEach(b => b.classList.toggle('active', b.dataset.texture === p.texture));
  $$('[data-relief]').forEach(b => b.classList.toggle('active', b.dataset.relief === p.relief));
  $('#modeChip').textContent = p.piece.toUpperCase();
  $('#activeStyle').textContent = p.piece === 'ring' ? `RING / ${p.mode.toUpperCase()}` : `PENDANT / ${p.relief.toUpperCase()}`;

  $$('input[type=range]').forEach(input => {
    if (p[input.dataset.p] != null) input.value = p[input.dataset.p];
    const labelValue = input.previousElementSibling?.querySelector('span');
    if (labelValue) {
      labelValue.textContent = ['diameter', 'minWall'].includes(input.dataset.p)
        ? Number(input.value).toFixed(2)
        : input.value;
    }
  });
}

function productionMesh() {
  let geometry;
  if (p.piece === 'pendant') {
    const q = $('#exportQuality').value === 'ultra' ? 260 : $('#exportQuality').value === 'jewelry' ? 190 : 140;
    geometry = pendantGeometry(q, Math.max(50, Math.round(q / (imageMap?.aspect || 0.78))));
  } else {
    geometry = ringGeometry(...QUALITY[$('#exportQuality').value]);
  }
  return new THREE.Mesh(geometry, material);
}

function download(name, data, type) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([data], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportFile(kind) {
  const production = productionMesh();
  const check = validate(production.geometry);

  if (!check.closed) {
    toast(`Export blocked: ${check.boundary} open edges`);
    production.geometry.dispose();
    return;
  }

  const group = new THREE.Group();
  group.add(production);
  const name = ($('#projectName').value || `${p.piece}-design`).trim();

  if (kind === 'stl') {
    download(name + '_mm.stl', new STLExporter().parse(group, { binary: true }), 'model/stl');
  } else {
    const header = `# ORGANICA OS\n# units: millimeters\n# source: ${sourceName || 'parametric'}\n`;
    download(name + '_mm.obj', header + new OBJExporter().parse(group), 'text/plain');
  }

  production.geometry.dispose();
  toast(`${kind.toUpperCase()} exported · watertight · mm`);
}

function saveProject() {
  const name = ($('#projectName').value || `Jewel-${projects.length + 1}`).trim();
  projects.unshift({ id: Date.now(), name, date: new Date().toLocaleString(), params: { ...p }, source: sourceName });
  localStorage.setItem('organica-projects', JSON.stringify(projects));
  renderProjects();
  toast('Design saved');
}

function renderProjects() {
  const grid = $('#fileGrid');
  grid.innerHTML = projects.length ? '' : '<div class="file-card"><b>NO DESIGNS</b><small>Create your first piece.</small></div>';
  projects.forEach(pr => {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.innerHTML = `<b>${pr.name}</b><small>${(pr.params?.piece || 'ring').toUpperCase()} · ${pr.date}</small><button class="btn">OPEN</button>`;
    card.querySelector('button').onclick = () => {
      p = { ...p, ...pr.params };
      rebuild();
      closeWin('projectsWin');
    };
    grid.appendChild(card);
  });
}

$$('input[type=range]').forEach(input => {
  input.oninput = () => {
    p[input.dataset.p] = Number(input.value);
    rebuild();
  };
});
$$('[data-piece]').forEach(b => b.onclick = () => { p.piece = b.dataset.piece; rebuild(); });
$$('[data-mode]').forEach(b => b.onclick = () => { p.mode = b.dataset.mode; rebuild(); });
$$('[data-texture]').forEach(b => b.onclick = () => { p.texture = b.dataset.texture; rebuild(); });
$$('[data-relief]').forEach(b => b.onclick = () => { p.relief = b.dataset.relief; rebuild(); });

$('#sourceInput').onchange = (e) => analyzeImage(e.target.files?.[0]);
$('#preflight').onclick = () => {
  const v = validate(mesh.geometry);
  toast(v.closed ? 'Watertight mesh · export ready' : `Open mesh · ${v.boundary} boundary edges`);
};
$('#save').onclick = saveProject;
$('#exportStl').onclick = () => exportFile('stl');
$('#exportObj').onclick = () => exportFile('obj');

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
})();

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function openWin(id) { $('#' + id).classList.remove('hidden'); }
function closeWin(id) { $('#' + id).classList.add('hidden'); }
$$('[data-open]').forEach(b => b.onclick = () => openWin(b.dataset.open));
$$('[data-close]').forEach(b => b.onclick = () => closeWin(b.dataset.close));
$$('[data-max]').forEach(b => b.onclick = () => $('#' + b.dataset.max).classList.toggle('max'));

$$('.titlebar').forEach(bar => {
  const win = bar.parentElement;
  let sx, sy, left, top;
  bar.onpointerdown = (e) => {
    if (e.target.tagName === 'BUTTON') return;
    sx = e.clientX; sy = e.clientY; left = win.offsetLeft; top = win.offsetTop;
    bar.setPointerCapture(e.pointerId);
    bar.onpointermove = (m) => {
      win.style.left = left + m.clientX - sx + 'px';
      win.style.top = top + m.clientY - sy + 'px';
    };
    bar.onpointerup = () => { bar.onpointermove = null; };
  };
});

$('#cmd').onkeydown = (e) => {
  if (e.key !== 'Enter') return;
  const command = e.target.value.trim().toLowerCase();
  if (command === 'projects') openWin('projectsWin');
  else if (command === 'save') saveProject();
  else if (command === 'obj') exportFile('obj');
  else if (command === 'stl') exportFile('stl');
  else if (command === 'check') $('#preflight').click();
  else if (command === 'clear') $('#term').innerHTML = '';
  e.target.value = '';
};

renderProjects();
rebuild();
