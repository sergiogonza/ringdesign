import { makeGeometry } from './mesh-utils.js';
import { sampleMap } from './image-relief.js';

function active(map, u, v) {
  return sampleMap(map, 'mask', u, v) > 0;
}

function surfaceZ(map, params, u, v) {
  const lum = sampleMap(map, 'luminance', u, v);
  const edge = sampleMap(map, 'edge', u, v);
  const ink = Math.pow(Math.max(0, 1 - lum), 1.1);
  const base = params.pendantBase;
  const depth = params.reliefDepth * params.reliefDetail;

  if (params.relief === 'laser') {
    // Preserve the source drawing: dark strokes and detected edges become shallow cuts.
    const cut = Math.min(1, edge * 0.78 + ink * 0.42);
    return Math.max(0.45, base - depth * cut);
  }
  if (params.relief === 'emboss') return base + depth * ink;
  return Math.max(0.45, base + depth * (0.55 - lum) * 1.45);
}

export function buildPendantGeometry(map, params, resolution = 150) {
  const aspect = map?.aspect || 0.78;
  const nx = Math.max(40, resolution);
  const ny = Math.max(40, Math.round(resolution / aspect));
  const width = params.pendantWidth;
  const height = width / aspect;
  const positions = [];
  const indices = [];
  const top = Array.from({ length: ny }, () => Array(nx).fill(-1));
  const bottom = Array.from({ length: ny }, () => Array(nx).fill(-1));

  // Cell-centered pixels make silhouette extrusion robust and guarantee matching top/bottom topology.
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const u = (x + 0.5) / nx;
      const v = (y + 0.5) / ny;
      if (!active(map, u, v)) continue;
      const X = (u - 0.5) * width;
      const Y = (0.5 - v) * height;
      top[y][x] = positions.length / 3;
      positions.push(X, Y, surfaceZ(map, params, u, v));
      bottom[y][x] = positions.length / 3;
      positions.push(X, Y, 0);
    }
  }

  // Surface quads are emitted only when all four neighboring samples belong to the silhouette.
  for (let y = 0; y < ny - 1; y++) {
    for (let x = 0; x < nx - 1; x++) {
      const a = top[y][x], b = top[y][x + 1], c = top[y + 1][x + 1], d = top[y + 1][x];
      if ([a,b,c,d].some(i => i < 0)) continue;
      const A = bottom[y][x], B = bottom[y][x + 1], C = bottom[y + 1][x + 1], D = bottom[y + 1][x];
      indices.push(a, d, b, b, d, c);
      indices.push(A, B, D, B, C, D);
    }
  }

  // Add walls along every silhouette transition. The tiny pixel-step contour is smoothed visually by normals.
  const addWall = (a, b, A, B, flip) => {
    if (a < 0 || b < 0 || A < 0 || B < 0) return;
    if (flip) indices.push(a, b, A, b, B, A);
    else indices.push(a, A, b, b, A, B);
  };

  for (let y = 0; y < ny - 1; y++) {
    for (let x = 0; x < nx - 1; x++) {
      if (top[y][x] < 0) continue;
      if (x === 0 || top[y][x - 1] < 0) addWall(top[y][x], top[y + 1][x], bottom[y][x], bottom[y + 1][x], false);
      if (x === nx - 2 || top[y][x + 1] < 0) addWall(top[y][x], top[y + 1][x], bottom[y][x], bottom[y + 1][x], true);
      if (y === 0 || top[y - 1][x] < 0) addWall(top[y][x], top[y][x + 1], bottom[y][x], bottom[y][x + 1], true);
      if (y === ny - 2 || top[y + 1][x] < 0) addWall(top[y][x], top[y][x + 1], bottom[y][x], bottom[y][x + 1], false);
    }
  }

  return makeGeometry(positions, indices);
}
