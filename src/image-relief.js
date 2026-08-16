function blur(field, w, h) {
  const out = new Float32Array(field.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const sx = Math.max(0, Math.min(w - 1, x + ox));
          const sy = Math.max(0, Math.min(h - 1, y + oy));
          sum += field[sy * w + sx];
          count += 1;
        }
      }
      out[y * w + x] = sum / count;
    }
  }
  return out;
}

function sample(field, w, h, x, y) {
  x = Math.max(0, Math.min(w - 1, x));
  y = Math.max(0, Math.min(h - 1, y));
  return field[y * w + x];
}

function largestComponent(mask, w, h) {
  const seen = new Uint8Array(mask.length);
  let best = [];
  const directions = [[1,0],[-1,0],[0,1],[0,-1]];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const queue = [start];
    const component = [];
    seen[start] = 1;

    while (queue.length) {
      const id = queue.pop();
      component.push(id);
      const x = id % w;
      const y = Math.floor(id / w);
      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nid = ny * w + nx;
        if (mask[nid] && !seen[nid]) {
          seen[nid] = 1;
          queue.push(nid);
        }
      }
    }
    if (component.length > best.length) best = component;
  }

  const result = new Uint8Array(mask.length);
  for (const id of best) result[id] = 1;
  return result;
}

function closeMask(mask, w, h, passes = 2) {
  let current = mask;
  for (let pass = 0; pass < passes; pass++) {
    const dilated = new Uint8Array(current.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let on = 0;
      for (let oy = -1; oy <= 1 && !on; oy++) for (let ox = -1; ox <= 1; ox++) {
        const sx = x + ox, sy = y + oy;
        if (sx >= 0 && sy >= 0 && sx < w && sy < h && current[sy * w + sx]) { on = 1; break; }
      }
      dilated[y * w + x] = on;
    }
    const eroded = new Uint8Array(current.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let on = 1;
      for (let oy = -1; oy <= 1 && on; oy++) for (let ox = -1; ox <= 1; ox++) {
        const sx = x + ox, sy = y + oy;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h || !dilated[sy * w + sx]) { on = 0; break; }
      }
      eroded[y * w + x] = on;
    }
    current = eroded;
  }
  return current;
}

export function analyzeRasterImage(img, maxSide = 260) {
  const ratio = img.width / img.height;
  const w = ratio >= 1 ? maxSide : Math.max(64, Math.round(maxSide * ratio));
  const h = ratio >= 1 ? Math.max(64, Math.round(maxSide / ratio)) : maxSide;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  const alpha = new Float32Array(w * h);

  let borderLum = 0;
  let borderCount = 0;
  let transparentBorder = 0;
  for (let i = 0; i < w * h; i++) {
    alpha[i] = rgba[i * 4 + 3] / 255;
    lum[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
  }
  const addBorder = (id) => { borderLum += lum[id]; borderCount++; if (alpha[id] < 0.08) transparentBorder++; };
  for (let x = 0; x < w; x++) { addBorder(x); addBorder((h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { addBorder(y * w); addBorder(y * w + w - 1); }
  const hasAlphaCutout = transparentBorder > borderCount * 0.2;
  const bgLum = borderLum / Math.max(1, borderCount);

  let mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    if (hasAlphaCutout) mask[i] = alpha[i] > 0.18 ? 1 : 0;
    else {
      const distanceFromWhite = Math.abs(lum[i] - bgLum);
      mask[i] = alpha[i] > 0.08 && (bgLum < 0.72 || distanceFromWhite > 0.035 || lum[i] < 0.94) ? 1 : 0;
    }
  }

  mask = closeMask(mask, w, h, 2);
  mask = largestComponent(mask, w, h);

  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (maxX < minX) { minX = 0; minY = 0; maxX = w - 1; maxY = h - 1; mask.fill(1); }
  const pad = 2;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const croppedMask = new Uint8Array(cw * ch);
  const croppedLum = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const src = (y + minY) * w + x + minX;
    croppedMask[y * cw + x] = mask[src];
    croppedLum[y * cw + x] = lum[src];
  }

  const smooth = blur(croppedLum, cw, ch);
  const edge = new Float32Array(cw * ch);
  for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
    const gx = sample(smooth, cw, ch, x + 1, y) - sample(smooth, cw, ch, x - 1, y);
    const gy = sample(smooth, cw, ch, x, y + 1) - sample(smooth, cw, ch, x, y - 1);
    edge[y * cw + x] = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 5.5);
  }

  return { w: cw, h: ch, aspect: cw / ch, luminance: smooth, edge, mask: croppedMask, alphaCutout: hasAlphaCutout };
}

export function sampleMap(map, field, u, v) {
  const x = Math.max(0, Math.min(map.w - 1, Math.round(u * (map.w - 1))));
  const y = Math.max(0, Math.min(map.h - 1, Math.round(v * (map.h - 1))));
  return map[field][y * map.w + x];
}
