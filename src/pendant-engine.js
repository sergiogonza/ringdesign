import { makeGeometry } from './mesh-utils.js';
import { sampleMap } from './image-relief.js';

function isActive(map, u, v) {
  return sampleMap(map, 'mask', u, v) > 0;
}

function surfaceZ(map, params, u, v) {
  const lum = sampleMap(map, 'luminance', u, v);
  const edge = sampleMap(map, 'edge', u, v);
  const ink = Math.pow(Math.max(0, 1 - lum), 1.05);
  const base = Math.max(1.2, params.pendantBase);
  const depth = params.reliefDepth * params.reliefDetail;

  if (params.relief === 'laser') {
    // Laser engraving should stay shallow and crisp, not become a melted bas-relief.
    const cut = Math.min(1, edge * 0.92 + ink * 0.18);
    return Math.max(base * 0.72, base - Math.min(depth, 0.55) * cut);
  }

  if (params.relief === 'emboss') {
    return base + Math.min(depth, 2.2) * Math.pow(ink, 0.9);
  }

  // Sculpted mode keeps broad volumes but limits extreme spikes.
  const broad = Math.pow(ink, 0.78);
  return Math.max(base * 0.72, base + Math.min(depth, 2.8) * (broad - 0.28));
}

function cornerActive(map, x, y, nx, ny) {
  // A corner belongs to the body if one of its adjacent cells belongs to the silhouette.
  for (let oy = -1; oy <= 0; oy++) {
    for (let ox = -1; ox <= 0; ox++) {
      const cx = x + ox;
      const cy = y + oy;
      if (cx < 0 || cy < 0 || cx >= nx || cy >= ny) continue;
      const u = (cx + 0.5) / nx;
      const v = (cy + 0.5) / ny;
      if (isActive(map, u, v)) return true;
    }
  }
  return false;
}

export function buildPendantGeometry(map, params, resolution = 170) {
  const aspect = map?.aspect || 0.78;
  const nx = Math.max(56, resolution);
  const ny = Math.max(56, Math.round(resolution / aspect));
  const width = params.pendantWidth;
  const height = width / aspect;

  const positions = [];
  const indices = [];
  const top = Array.from({ length: ny + 1 }, () => Array(nx + 1).fill(-1));
  const bottom = Array.from({ length: ny + 1 }, () => Array(nx + 1).fill(-1));

  // Shared corner vertices. This is the key difference from the previous implementation:
  // neighboring cells now share the exact same vertex IDs, so the solid can be manifold.
  for (let y = 0; y <= ny; y++) {
    for (let x = 0; x <= nx; x++) {
      if (!cornerActive(map, x, y, nx, ny)) continue;
      const u = x / nx;
      const v = y / ny;
      const X = (u - 0.5) * width;
      const Y = (0.5 - v) * height;

      top[y][x] = positions.length / 3;
      positions.push(X, Y, surfaceZ(map, params, u, v));

      bottom[y][x] = positions.length / 3;
      positions.push(X, Y, 0);
    }
  }

  const cellActive = (x, y) => {
    if (x < 0 || y < 0 || x >= nx || y >= ny) return false;
    return isActive(map, (x + 0.5) / nx, (y + 0.5) / ny);
  };

  const addTopBottom = (x, y) => {
    const a = top[y][x];
    const b = top[y][x + 1];
    const c = top[y + 1][x + 1];
    const d = top[y + 1][x];
    const A = bottom[y][x];
    const B = bottom[y][x + 1];
    const C = bottom[y + 1][x + 1];
    const D = bottom[y + 1][x];
    if ([a,b,c,d,A,B,C,D].some(i => i < 0)) return;
    indices.push(a, d, b, b, d, c);
    indices.push(A, B, D, B, C, D);
  };

  const addWall = (t1, t2, b1, b2, flip = false) => {
    if ([t1,t2,b1,b2].some(i => i < 0)) return;
    if (flip) indices.push(t1, t2, b1, t2, b2, b1);
    else indices.push(t1, b1, t2, t2, b1, b2);
  };

  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      if (!cellActive(x, y)) continue;
      addTopBottom(x, y);

      // Only exposed cell borders become walls. Every edge is therefore used exactly twice.
      if (!cellActive(x - 1, y)) addWall(top[y][x], top[y + 1][x], bottom[y][x], bottom[y + 1][x], false);
      if (!cellActive(x + 1, y)) addWall(top[y][x + 1], top[y + 1][x + 1], bottom[y][x + 1], bottom[y + 1][x + 1], true);
      if (!cellActive(x, y - 1)) addWall(top[y][x], top[y][x + 1], bottom[y][x], bottom[y][x + 1], true);
      if (!cellActive(x, y + 1)) addWall(top[y + 1][x], top[y + 1][x + 1], bottom[y + 1][x], bottom[y + 1][x + 1], false);
    }
  }

  return makeGeometry(positions, indices);
}
