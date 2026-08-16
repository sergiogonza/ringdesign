import * as THREE from 'three';

export function makeGeometry(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function validateMesh(geometry) {
  const index = geometry.index?.array;
  if (!index) {
    return { boundary: Infinity, nonManifold: Infinity, closed: false, size: new THREE.Vector3() };
  }

  const edges = new Map();
  const pushEdge = (a, b) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    edges.set(key, (edges.get(key) || 0) + 1);
  };

  for (let i = 0; i < index.length; i += 3) {
    const a = index[i];
    const b = index[i + 1];
    const c = index[i + 2];
    pushEdge(a, b);
    pushEdge(b, c);
    pushEdge(c, a);
  }

  let boundary = 0;
  let nonManifold = 0;
  for (const count of edges.values()) {
    if (count === 1) boundary += 1;
    else if (count !== 2) nonManifold += 1;
  }

  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox?.getSize(size);

  return { boundary, nonManifold, closed: boundary === 0 && nonManifold === 0, size };
}
