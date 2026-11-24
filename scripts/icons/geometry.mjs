// Geometry for the icon compiler (R16-15): SVG path parsing, normalization to absolute commands,
// similarity transforms (translate, rotate, uniform scale, reflection), rounding, and bounds.
// Pure functions, no I/O, no dependencies.

/** @typedef {[number, number, number, number, number, number]} Matrix  a b c d e f */
/** @typedef {{ cmd: string, args: number[] }} Segment  absolute command with its numbers */

export const IDENTITY = /** @type {Matrix} */ ([1, 0, 0, 1, 0, 0]);
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;

/** Round to 3 decimals for deterministic, compact output. */
export function fmt(n) {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
}

/**
 * Parse path data into absolute segments (H and V kept, relative commands resolved).
 * @param {string} d
 * @returns {Segment[]}
 */
export function parsePath(d) {
  if (typeof d !== 'string' || !/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+eE-]*$/.test(d)) throw new Error('path data contains unsupported characters');
  /** @type {Segment[]} */
  const out = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i] ?? '')) i++;
  };
  const num = () => {
    skip();
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(d);
    if (!m) throw new Error(`number expected at ${String(i)}`);
    i = NUMBER.lastIndex;
    return Number(m[0]);
  };
  const flag = () => {
    skip();
    const c = d[i];
    if (c !== '0' && c !== '1') throw new Error(`arc flag expected at ${String(i)}`);
    i++;
    return Number(c);
  };
  for (;;) {
    skip();
    if (i >= d.length) break;
    const c = d[i] ?? '';
    if (/[A-Za-z]/.test(c)) {
      cmd = c;
      i++;
    } else if (cmd === '' || cmd === 'Z' || cmd === 'z') throw new Error(`command expected at ${String(i)}`);
    else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    if (!Object.hasOwn(ARITY, upper)) throw new Error(`unsupported command ${cmd}`);
    if (upper === 'Z') {
      out.push({ cmd: 'Z', args: [] });
      x = sx;
      y = sy;
      continue;
    }
    if (upper === 'A') {
      const rx = num();
      const ry = num();
      const rot = num();
      const large = flag();
      const sweep = flag();
      let ex = num();
      let ey = num();
      if (rel) {
        ex += x;
        ey += y;
      }
      out.push({ cmd: 'A', args: [rx, ry, rot, large, sweep, ex, ey] });
      x = ex;
      y = ey;
      continue;
    }
    if (upper === 'H') {
      const v = num() + (rel ? x : 0);
      out.push({ cmd: 'H', args: [v] });
      x = v;
      continue;
    }
    if (upper === 'V') {
      const v = num() + (rel ? y : 0);
      out.push({ cmd: 'V', args: [v] });
      y = v;
      continue;
    }
    const args = [];
    for (let k = 0; k < ARITY[upper]; k += 2) {
      args.push(num() + (rel ? x : 0), num() + (rel ? y : 0));
    }
    out.push({ cmd: upper, args });
    x = args[args.length - 2] ?? x;
    y = args[args.length - 1] ?? y;
    if (upper === 'M') {
      sx = x;
      sy = y;
    }
  }
  if (out.length > 0 && out[0]?.cmd !== 'M') throw new Error('path must start with M');
  return out;
}

/** Serialize absolute segments compactly. */
export function serializePath(/** @type {Segment[]} */ segments) {
  return segments.map((s) => s.cmd + s.args.map(fmt).join(' ')).join('');
}

/** Multiply transforms: apply `b` first, then `a`. */
export function multiply(/** @type {Matrix} */ a, /** @type {Matrix} */ b) {
  return /** @type {Matrix} */ ([
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ]);
}

/**
 * Parse a transform list of translate(), rotate(), and scale(); throws for anything else.
 * @param {string} text
 * @returns {Matrix}
 */
export function parseTransform(text) {
  let m = IDENTITY;
  const re = /\s*(translate|rotate|scale)\s*\(([^)]*)\)\s*/gy;
  let consumed = 0;
  for (let match = re.exec(text); match; match = re.exec(text)) {
    consumed = re.lastIndex;
    const n = (match[2] ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (n.some((v) => !Number.isFinite(v))) throw new Error(`invalid transform numbers: ${match[0].trim()}`);
    let t;
    if (match[1] === 'translate') {
      if (n.length < 1 || n.length > 2) throw new Error('translate takes 1 or 2 numbers');
      t = /** @type {Matrix} */ ([1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]);
    } else if (match[1] === 'scale') {
      if (n.length < 1 || n.length > 2) throw new Error('scale takes 1 or 2 numbers');
      t = /** @type {Matrix} */ ([n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]);
    } else {
      if (n.length !== 1 && n.length !== 3) throw new Error('rotate takes 1 or 3 numbers');
      const a = ((n[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      t = /** @type {Matrix} */ ([cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy]);
    }
    m = multiply(m, t);
  }
  if (consumed !== text.length) throw new Error(`unsupported transform: ${text}`);
  return m;
}

/** Scale factor and reflection of a similarity transform; throws for skew or non-uniform scale. */
export function similarity(/** @type {Matrix} */ m) {
  const s1 = Math.hypot(m[0], m[1]);
  const s2 = Math.hypot(m[2], m[3]);
  const dot = m[0] * m[2] + m[1] * m[3];
  if (Math.abs(s1 - s2) > 1e-9 || Math.abs(dot) > 1e-9) throw new Error('only translate, rotate, uniform scale, and reflection are allowed');
  const det = m[0] * m[3] - m[1] * m[2];
  return { scale: s1, reflected: det < 0, angle: (Math.atan2(m[1], m[0]) * 180) / Math.PI };
}

const apply = (/** @type {Matrix} */ m, /** @type {number} */ x, /** @type {number} */ y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/**
 * Transform absolute segments by a similarity transform (H and V become L when rotated).
 * @param {Segment[]} segments
 * @param {Matrix} m
 * @returns {Segment[]}
 */
export function transformPath(segments, m) {
  if (m.every((v, k) => v === IDENTITY[k])) return segments;
  const { scale, reflected } = similarity(m);
  /** @type {Segment[]} */
  const out = [];
  let x = 0;
  let y = 0;
  for (const s of segments) {
    if (s.cmd === 'Z') {
      out.push(s);
      continue;
    }
    if (s.cmd === 'H' || s.cmd === 'V') {
      const nx = s.cmd === 'H' ? (s.args[0] ?? 0) : x;
      const ny = s.cmd === 'V' ? (s.args[0] ?? 0) : y;
      out.push({ cmd: 'L', args: apply(m, nx, ny) });
      x = nx;
      y = ny;
      continue;
    }
    if (s.cmd === 'A') {
      const [rx, ry, rot, large, sweep, ex, ey] = s.args;
      // The ellipse's x axis maps to M * (cos, sin); its angle is the new rotation.
      const t = ((rot ?? 0) * Math.PI) / 180;
      const newRot = (Math.atan2(m[1] * Math.cos(t) + m[3] * Math.sin(t), m[0] * Math.cos(t) + m[2] * Math.sin(t)) * 180) / Math.PI;
      out.push({ cmd: 'A', args: [(rx ?? 0) * scale, (ry ?? 0) * scale, ((newRot % 180) + 180) % 180, large ?? 0, reflected ? 1 - (sweep ?? 0) : (sweep ?? 0), ...apply(m, ex ?? 0, ey ?? 0)] });
      x = ex ?? 0;
      y = ey ?? 0;
      continue;
    }
    const args = [];
    for (let k = 0; k < s.args.length; k += 2) args.push(...apply(m, s.args[k] ?? 0, s.args[k + 1] ?? 0));
    out.push({ cmd: s.cmd, args });
    x = s.args[s.args.length - 2] ?? x;
    y = s.args[s.args.length - 1] ?? y;
  }
  return out;
}

/** Points on an elliptical arc (endpoint parameterization, SVG 1.1 appendix F.6). */
function arcPoints(x1, y1, rx, ry, rotDeg, large, sweep, x2, y2, steps = 24) {
  if (rx === 0 || ry === 0) return [[x2, y2]];
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  let arx = Math.abs(rx);
  let ary = Math.abs(ry);
  const lambda = (x1p * x1p) / (arx * arx) + (y1p * y1p) / (ary * ary);
  if (lambda > 1) {
    arx *= Math.sqrt(lambda);
    ary *= Math.sqrt(lambda);
  }
  const num = arx * arx * ary * ary - arx * arx * y1p * y1p - ary * ary * x1p * x1p;
  const den = arx * arx * y1p * y1p + ary * ary * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * arx * y1p) / ary;
  const cyp = (-coef * ary * x1p) / arx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / arx, (y1p - cyp) / ary);
  let dt = ang((x1p - cxp) / arx, (y1p - cyp) / ary, (-x1p - cxp) / arx, (-y1p - cyp) / ary);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const pts = [];
  for (let k = 1; k <= steps; k++) {
    const t = t1 + (dt * k) / steps;
    pts.push([cos * arx * Math.cos(t) - sin * ary * Math.sin(t) + cx, sin * arx * Math.cos(t) + cos * ary * Math.sin(t) + cy]);
  }
  return pts;
}

/**
 * Sample points along absolute segments (curves and arcs sampled), for bounds and checks.
 * @param {Segment[]} segments
 * @returns {number[][]}
 */
export function samplePath(segments) {
  const pts = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cpx = 0;
  let cpy = 0;
  let prev = '';
  const bez = (p0, p1, p2, p3, t) => (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3;
  const quad = (p0, p1, p2, t) => (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
  for (const s of segments) {
    const a = s.args;
    switch (s.cmd) {
      case 'M':
        [x, y] = [a[0] ?? 0, a[1] ?? 0];
        [sx, sy] = [x, y];
        pts.push([x, y]);
        break;
      case 'L':
        [x, y] = [a[0] ?? 0, a[1] ?? 0];
        pts.push([x, y]);
        break;
      case 'H':
        x = a[0] ?? 0;
        pts.push([x, y]);
        break;
      case 'V':
        y = a[0] ?? 0;
        pts.push([x, y]);
        break;
      case 'C':
      case 'S': {
        const [c1x, c1y] = s.cmd === 'C' ? [a[0] ?? 0, a[1] ?? 0] : prev === 'C' || prev === 'S' ? [2 * x - cpx, 2 * y - cpy] : [x, y];
        const [c2x, c2y, ex, ey] = s.cmd === 'C' ? [a[2] ?? 0, a[3] ?? 0, a[4] ?? 0, a[5] ?? 0] : [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, a[3] ?? 0];
        for (let k = 1; k <= 16; k++) pts.push([bez(x, c1x, c2x, ex, k / 16), bez(y, c1y, c2y, ey, k / 16)]);
        [cpx, cpy, x, y] = [c2x, c2y, ex, ey];
        break;
      }
      case 'Q':
      case 'T': {
        const [qx, qy] = s.cmd === 'Q' ? [a[0] ?? 0, a[1] ?? 0] : prev === 'Q' || prev === 'T' ? [2 * x - cpx, 2 * y - cpy] : [x, y];
        const [ex, ey] = s.cmd === 'Q' ? [a[2] ?? 0, a[3] ?? 0] : [a[0] ?? 0, a[1] ?? 0];
        for (let k = 1; k <= 16; k++) pts.push([quad(x, qx, ex, k / 16), quad(y, qy, ey, k / 16)]);
        [cpx, cpy, x, y] = [qx, qy, ex, ey];
        break;
      }
      case 'A':
        pts.push(...arcPoints(x, y, a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, a[3] ?? 0, a[4] ?? 0, a[5] ?? 0, a[6] ?? 0));
        [x, y] = [a[5] ?? 0, a[6] ?? 0];
        break;
      default:
        [x, y] = [sx, sy];
    }
    prev = s.cmd;
  }
  return pts;
}

/** Bounding box [minX, minY, maxX, maxY] of points. */
export function bounds(/** @type {number[][]} */ points) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [px = 0, py = 0] of points) b = [Math.min(b[0], px), Math.min(b[1], py), Math.max(b[2], px), Math.max(b[3], py)];
  return b;
}

/**
 * A basic shape as absolute path segments (for transforms and bounds).
 * @param {string} tag
 * @param {Record<string, number>} a numeric attributes
 * @returns {Segment[]}
 */
export function shapeToPath(tag, a) {
  const n = (k) => a[k] ?? 0;
  switch (tag) {
    case 'line':
      return [{ cmd: 'M', args: [n('x1'), n('y1')] }, { cmd: 'L', args: [n('x2'), n('y2')] }];
    case 'circle':
    case 'ellipse': {
      const rx = tag === 'circle' ? n('r') : n('rx');
      const ry = tag === 'circle' ? n('r') : n('ry');
      return [
        { cmd: 'M', args: [n('cx') - rx, n('cy')] },
        { cmd: 'A', args: [rx, ry, 0, 1, 0, n('cx') + rx, n('cy')] },
        { cmd: 'A', args: [rx, ry, 0, 1, 0, n('cx') - rx, n('cy')] },
        { cmd: 'Z', args: [] },
      ];
    }
    case 'rect': {
      const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')];
      let rx = a.rx ?? a.ry ?? 0;
      let ry = a.ry ?? a.rx ?? 0;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (rx === 0 || ry === 0) return [{ cmd: 'M', args: [x, y] }, { cmd: 'L', args: [x + w, y] }, { cmd: 'L', args: [x + w, y + h] }, { cmd: 'L', args: [x, y + h] }, { cmd: 'Z', args: [] }];
      return [
        { cmd: 'M', args: [x + rx, y] },
        { cmd: 'L', args: [x + w - rx, y] },
        { cmd: 'A', args: [rx, ry, 0, 0, 1, x + w, y + ry] },
        { cmd: 'L', args: [x + w, y + h - ry] },
        { cmd: 'A', args: [rx, ry, 0, 0, 1, x + w - rx, y + h] },
        { cmd: 'L', args: [x + rx, y + h] },
        { cmd: 'A', args: [rx, ry, 0, 0, 1, x, y + h - ry] },
        { cmd: 'L', args: [x, y + ry] },
        { cmd: 'A', args: [rx, ry, 0, 0, 1, x + rx, y] },
        { cmd: 'Z', args: [] },
      ];
    }
    default:
      throw new Error(`no path for <${tag}>`);
  }
}

/**
 * Outline of an open polyline drawn with a round-capped stroke of `width` (miter joins), as path
 * segments: the shape a stroke covers, for knockouts in filled variants (a check cut out of a disc).
 * @param {number[][]} points
 * @param {number} width
 * @returns {Segment[]}
 */
export function strokeOutline(points, width) {
  if (points.length < 2) throw new Error('a stroke outline needs at least two points');
  const h = width / 2;
  const dirs = [];
  for (let k = 1; k < points.length; k++) {
    const [ax = 0, ay = 0] = points[k - 1] ?? [];
    const [bx = 0, by = 0] = points[k] ?? [];
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) throw new Error('a stroke outline needs distinct points');
    dirs.push([(bx - ax) / len, (by - ay) / len]);
  }
  const normal = ([dx, dy]) => [-dy, dx];
  /** Offset points on one side (sign 1: the normal side, -1: the other). */
  const side = (sign) => points.map(([px = 0, py = 0], k) => {
    if (k === 0 || k === points.length - 1) {
      const [nx, ny] = normal(dirs[Math.min(k, dirs.length - 1)] ?? [1, 0]);
      return [px + sign * nx * h, py + sign * ny * h];
    }
    const [n1x, n1y] = normal(dirs[k - 1] ?? [1, 0]);
    const [n2x, n2y] = normal(dirs[k] ?? [1, 0]);
    const dot = n1x * n2x + n1y * n2y;
    if (dot < -0.5) throw new Error('stroke outline joins sharper than 60 degrees are not supported');
    const f = (sign * h) / (1 + dot);
    return [px + (n1x + n2x) * f, py + (n1y + n2y) * f];
  });
  const left = side(1);
  const right = side(-1).reverse();
  /** @type {Segment[]} */
  const out = [{ cmd: 'M', args: left[0] ?? [0, 0] }];
  for (const p of left.slice(1)) out.push({ cmd: 'L', args: p });
  out.push({ cmd: 'A', args: [h, h, 0, 0, 0, ...(right[0] ?? [0, 0])] });
  for (const p of right.slice(1)) out.push({ cmd: 'L', args: p });
  out.push({ cmd: 'A', args: [h, h, 0, 0, 0, ...(left[0] ?? [0, 0])] });
  out.push({ cmd: 'Z', args: [] });
  return out;
}

/**
 * Points of a polyline or polygon `points` attribute.
 * @param {string} text
 * @returns {number[][]}
 */
export function parsePoints(text) {
  const nums = text.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (nums.length < 4 || nums.length % 2 !== 0 || nums.some((v) => !Number.isFinite(v))) throw new Error('points needs pairs of numbers');
  const out = [];
  for (let k = 0; k < nums.length; k += 2) out.push([nums[k] ?? 0, nums[k + 1] ?? 0]);
  return out;
}
