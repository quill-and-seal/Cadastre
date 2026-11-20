/**
 * Sols peints élément par élément, à taille réelle (1 case = 1,5 m) : litière de forêt de
 * feuillus, tapis d'aiguilles et de mousse de forêt de conifères. Chaque sol est une tuile carrée
 * qui se raccorde sur ses quatre bords (bruit périodique, éléments recopiés de l'autre côté), posée
 * en motif comme les autres sols. Marche dans la page comme dans un worker (OffscreenCanvas).
 */
import { mulberry32 } from "./catalog.js";
import { leafShape } from "./tree-gen.js";
import { makeCanvas } from "./tree-paint.js";

const CASE_M = 1.5;
/** Taille d'une tuile, en cases, et sa finesse par défaut (pixels par case). */
export const GROUND_TILE = 8;
export const GROUND_PPC = 128;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgb = (c, a = 1) => `rgba(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(",")},${a})`;

/**
 * Peint une tuile de sol.
 * @param {"litter"|"needles"} kind
 * @param {number} [ppc]
 * @param {number} [seed]
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
export function paintGround(kind, ppc = GROUND_PPC, seed = 1) {
  const T = GROUND_TILE * ppc, M = ppc / CASE_M;
  const canvas = makeCanvas(T, T), x = canvas.getContext("2d");
  const r = mulberry32(seed * 977 + (kind === "litter" ? 5 : 9));
  const pick = (arr, rr = r) => arr[Math.floor(rr() * arr.length)];
  const jitter = (c, k, rr = r) => c.map((v) => v * (1 + (rr() - 0.5) * k));
  const rand2 = () => [r() * T, r() * T];

  // Bruit doux périodique : la tuile se raccorde.
  const h2 = (i, j, s, pi, pj) => { i = ((i % pi) + pi) % pi; j = ((j % pj) + pj) % pj; const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  const vnoise = (px, py, scale, s) => {
    const per = Math.max(1, Math.round(T / scale)), sc = T / per;
    const u = px / sc, v = py / sc, i = Math.floor(u), j = Math.floor(v);
    let fx = u - i, fy = v - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = h2(i, j, s, per, per) + (h2(i + 1, j, s, per, per) - h2(i, j, s, per, per)) * fx;
    const b = h2(i, j + 1, s, per, per) + (h2(i + 1, j + 1, s, per, per) - h2(i, j + 1, s, per, per)) * fx;
    return a + (b - a) * fy;
  };
  const fbm = (px, py, scale, s) => 0.55 * vnoise(px, py, scale, s) + 0.3 * vnoise(px, py, scale / 2.3, s + 1) + 0.15 * vnoise(px, py, scale / 5, s + 2);

  /** Un élément près d'un bord est aussi dessiné de l'autre côté, à l'identique (même tirage). */
  const wrap = (px, py, reach, draw) => {
    const s = Math.floor(r() * 4294967296);
    for (const dx of [0, -T, T]) for (const dy of [0, -T, T]) {
      const qx = px + dx, qy = py + dy;
      if (qx < -reach || qy < -reach || qx > T + reach || qy > T + reach) continue;
      draw(qx, qy, mulberry32(s));
    }
  };

  /* ---------- briques ---------- */
  function soilBase(dark, light, s, grain) {
    const img = x.createImageData(T, T), d = img.data, A = hex(dark), B = hex(light);
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const n = fbm(i, j, ppc * 1.4, s), g = h2(i, j, s + 9, T, T);
      const col = mix(A, B, n * (1 - grain) + g * grain), o = (j * T + i) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }
  function crumbs(n, cols, size) {
    for (let i = 0; i < n; i++) {
      const [px, py] = rand2(), rad = Math.max(0.4, size * M * (0.4 + r()));
      x.fillStyle = rgb(hex(pick(cols)), 0.5 + r() * 0.5);
      wrap(px, py, rad, (qx, qy) => { x.beginPath(); x.arc(qx, qy, rad, 0, 6.28); x.fill(); });
    }
  }
  function pebble(px, py, rm, rr) {
    const rad = rm * M, pts = [];
    for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28, q = rad * (0.75 + rr() * 0.35); pts.push([px + Math.cos(a) * q, py + Math.sin(a) * q * 0.8]); }
    const path = new Path2D(); pts.forEach(([a, b], i) => (i ? path.lineTo(a, b) : path.moveTo(a, b))); path.closePath();
    const base = jitter(hex(pick(["#7d776c", "#8a8478", "#6b675f", "#958d7f"], rr)), 0.12, rr);
    x.save(); x.translate(rad * 0.25, rad * 0.3); x.fillStyle = "rgba(10,8,5,0.35)"; x.fill(path); x.restore();
    x.fillStyle = rgb(mix(base, [0, 0, 0], 0.25)); x.fill(path);
    x.save(); x.clip(path); x.fillStyle = rgb(base); x.beginPath(); x.ellipse(px - rad * 0.12, py - rad * 0.15, rad * 0.85, rad * 0.7, 0, 0, 6.28); x.fill();
    x.fillStyle = rgb(mix(base, [255, 255, 255], 0.35), 0.6); x.beginPath(); x.ellipse(px - rad * 0.35, py - rad * 0.35, rad * 0.35, rad * 0.22, -0.6, 0, 6.28); x.fill(); x.restore();
    x.strokeStyle = "rgba(20,16,10,0.6)"; x.lineWidth = Math.max(0.5, rad * 0.08); x.stroke(path);
  }
  /** Feuille morte posée à plat : forme de l'essence, nervure, moitié à l'ombre, parfois trouée. */
  function deadLeaf(px, py, kind2, lenM, col, decay, alpha, rr) {
    const L = lenM * M, a = rr() * 6.28, ca = Math.cos(a), sa = Math.sin(a);
    const l = { W: kind2 === "oak" ? 0.42 : kind2 === "beech" ? 0.36 : 0.34, lobes: 3.5 + Math.floor(rr() * 2) };
    const { top, bot } = leafShape(l, kind2, L < 8 ? 8 : 18);
    const f = 0.75 + rr() * 0.25;
    const P = (u, v) => [px + ((u - 0.5) * ca - v * f * sa) * L, py + ((u - 0.5) * sa + v * f * ca) * L];
    const path = new Path2D(); path.moveTo(...P(0, 0));
    for (const [u, v] of top) path.lineTo(...P(u, v));
    for (let i = bot.length - 1; i >= 0; i--) path.lineTo(...P(bot[i][0], bot[i][1]));
    path.closePath();
    x.globalAlpha = alpha;
    x.save(); x.translate(L * 0.04, L * 0.05); x.fillStyle = "rgba(15,10,5,0.3)"; x.fill(path); x.restore();
    x.fillStyle = rgb(col); x.fill(path);
    if (L > 5) {
      const half = new Path2D(); half.moveTo(...P(0, 0)); for (const [u, v] of bot) half.lineTo(...P(u, v)); half.closePath();
      x.fillStyle = rgb(mix(col, [20, 10, 0], 0.18)); x.fill(half);
      x.strokeStyle = rgb(mix(col, [255, 230, 180], 0.35), 0.7); x.lineWidth = Math.max(0.4, L * 0.02);
      x.beginPath(); x.moveTo(...P(-0.08, 0)); x.lineTo(...P(0.9, 0)); x.stroke();
      if (L > 10) {
        x.lineWidth = Math.max(0.3, L * 0.012);
        for (let k = 1; k < 5; k++) { const t = k / 5.5; x.beginPath(); x.moveTo(...P(t, 0)); x.lineTo(...P(t + 0.12, -l.W * 0.6)); x.moveTo(...P(t, 0)); x.lineTo(...P(t + 0.12, l.W * 0.6)); x.stroke(); }
      }
    }
    x.strokeStyle = rgb(mix(col, [20, 10, 0], 0.5), 0.65); x.lineWidth = Math.max(0.4, L * 0.025); x.stroke(path);
    if (decay > 0.5 && L > 6) {
      x.globalCompositeOperation = "destination-out";
      for (let k = 0; k < 3; k++) { const [hx, hy] = P(0.25 + rr() * 0.5, (rr() - 0.5) * 0.3); x.beginPath(); x.arc(hx, hy, L * (0.03 + rr() * 0.05), 0, 6.28); x.fill(); }
      x.globalCompositeOperation = "source-over";
    }
    x.globalAlpha = 1;
  }
  function twig(px, py, lenM, col, forks, rr) {
    const seg = (sx, sy, a, L, w, depth) => {
      const pts = [[sx, sy]]; let cx = sx, cy = sy;
      for (let k = 0; k < 5; k++) { a += (rr() - 0.5) * 0.35; cx += Math.cos(a) * L / 5; cy += Math.sin(a) * L / 5; pts.push([cx, cy]); }
      x.lineCap = "round";
      for (const [lw, cl] of [[w + 1.2, "rgba(20,12,6,0.7)"], [w, rgb(col)], [w * 0.35, rgb(mix(col, [255, 230, 190], 0.3), 0.6)]]) {
        x.strokeStyle = cl; x.lineWidth = lw; x.beginPath(); pts.forEach(([a1, b1], i) => (i ? x.lineTo(a1, b1) : x.moveTo(a1, b1))); x.stroke();
      }
      if (depth > 0) for (let k = 0; k < forks; k++) { const p = pts[1 + Math.floor(rr() * 3)]; seg(p[0], p[1], a + (rr() < 0.5 ? -1 : 1) * (0.5 + rr() * 0.5), L * 0.45, w * 0.6, depth - 1); }
    };
    seg(px, py, rr() * 6.28, lenM * M, Math.max(0.8, 0.012 * M), 1);
  }
  /** Tapis de mousse aux contours naturels (bruit), plus clairsemé vers le bord. */
  function mossField(th, s, cols, scale, n, base, tuft) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n * (pass ? tuft : 0.35); i++) {
        const [px, py] = rand2(), m = fbm(px, py, scale, s) + (r() - 0.5) * 0.04;
        if (m < th) continue;
        const k = Math.min(1, (m - th) / 0.08);
        if (r() > 0.25 + 0.75 * k) continue;
        if (pass === 0) {
          const rad = base * M * (0.6 + r());
          x.fillStyle = rgb(jitter(hex(cols[0]), 0.1), 0.55);
          wrap(px, py, rad, (qx, qy) => { x.beginPath(); x.arc(qx, qy, rad, 0, 6.28); x.fill(); });
          continue;
        }
        const lit = vnoise(px + 3, py + 3, 0.02 * M, s + 5) > 0.5;
        const col = jitter(hex(r() < 0.12 ? cols[3] : lit ? cols[2] : cols[1]), 0.18);
        const a = r() * 6.28, L = 0.006 * M * (0.6 + r());
        x.strokeStyle = rgb(col, 0.9); x.lineWidth = Math.max(0.6, 0.0035 * M); x.lineCap = "round";
        wrap(px, py, L, (qx, qy) => { x.beginPath(); x.moveTo(qx, qy); x.lineTo(qx + Math.cos(a) * L, qy + Math.sin(a) * L); x.stroke(); });
      }
    }
  }
  function acorn(px, py, rr) {
    const s = 0.022 * M;
    x.save(); x.translate(px, py); x.rotate(rr() * 6.28);
    x.fillStyle = "rgba(15,10,5,0.35)"; x.beginPath(); x.ellipse(s * 0.15, s * 0.2, s * 0.62, s * 0.45, 0, 0, 6.28); x.fill();
    x.fillStyle = "#7a5424"; x.beginPath(); x.ellipse(0, 0, s * 0.6, s * 0.42, 0, 0, 6.28); x.fill();
    x.fillStyle = "#a07433"; x.beginPath(); x.ellipse(-s * 0.08, -s * 0.08, s * 0.42, s * 0.28, 0, 0, 6.28); x.fill();
    if (rr() < 0.6) { x.fillStyle = "#5e4a2c"; x.beginPath(); x.arc(-s * 0.45, 0, s * 0.32, 0, 6.28); x.fill(); x.fillStyle = "#7a6440"; x.beginPath(); x.arc(-s * 0.48, -s * 0.05, s * 0.18, 0, 6.28); x.fill(); }
    x.restore();
  }
  function beechnut(px, py, rr) {
    const s = 0.025 * M;
    x.save(); x.translate(px, py); x.rotate(rr() * 6.28);
    for (let k = 0; k < 4; k++) { x.rotate(Math.PI / 2); x.fillStyle = "#6a4a2a"; x.beginPath(); x.ellipse(s * 0.3, 0, s * 0.35, s * 0.2, 0, 0, 6.28); x.fill(); x.strokeStyle = "rgba(30,18,8,0.7)"; x.lineWidth = Math.max(0.4, s * 0.06); x.stroke(); }
    x.restore();
  }
  function cone(px, py, lenM, spruce, rr) {
    const L = lenM * M, w = L * (spruce ? 0.28 : 0.4);
    x.save(); x.translate(px, py); x.rotate(rr() * 6.28);
    x.fillStyle = "rgba(10,6,3,0.4)"; x.beginPath(); x.ellipse(L * 0.06, L * 0.08, L / 2, w / 2, 0, 0, 6.28); x.fill();
    x.fillStyle = spruce ? "#6e4a2a" : "#5e3e22"; x.beginPath(); x.ellipse(0, 0, L / 2, w / 2, 0, 0, 6.28); x.fill();
    const rows = Math.max(3, Math.round(L / 2.2));
    for (let k = 0; k < rows; k++) {
      const t = -0.45 + 0.9 * k / rows, ww = Math.sqrt(Math.max(0, 1 - (2 * t) ** 2)) * w / 2;
      x.strokeStyle = "rgba(30,16,6,0.75)"; x.lineWidth = Math.max(0.4, L * 0.03);
      x.beginPath(); x.moveTo(t * L - L * 0.04, -ww); x.lineTo(t * L + L * 0.04, 0); x.lineTo(t * L - L * 0.04, ww); x.stroke();
      x.strokeStyle = "rgba(190,140,90,0.45)"; x.lineWidth = Math.max(0.3, L * 0.015);
      x.beginPath(); x.moveTo(t * L, -ww * 0.8); x.lineTo(t * L + L * 0.06, 0); x.stroke();
    }
    x.restore();
  }
  function needles(n, cols, lenM) {
    x.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const [px, py] = rand2(), a = r() * 6.28, L = lenM * M * (0.6 + r() * 0.6);
      x.strokeStyle = rgb(jitter(hex(pick(cols)), 0.2), 0.75 + r() * 0.25); x.lineWidth = Math.max(0.5, 0.0036 * M);
      wrap(px, py, L, (qx, qy) => {
        x.beginPath(); x.moveTo(qx, qy);
        x.quadraticCurveTo(qx + Math.cos(a + 0.2) * L * 0.5, qy + Math.sin(a + 0.2) * L * 0.5, qx + Math.cos(a) * L, qy + Math.sin(a) * L); x.stroke();
      });
    }
  }
  function sprout(px, py, col, rr) {
    const n = 3 + Math.floor(rr() * 2), L = 0.03 * M * (0.7 + rr() * 0.6), a0 = rr() * 6.28;
    for (let k = 0; k < n; k++) {
      const a = a0 + k / n * 6.28;
      x.fillStyle = rgb(jitter(hex(col), 0.15, rr)); x.beginPath(); x.ellipse(px + Math.cos(a) * L * 0.5, py + Math.sin(a) * L * 0.5, L * 0.5, L * 0.32, a, 0, 6.28); x.fill();
      x.strokeStyle = "rgba(15,30,10,0.5)"; x.lineWidth = 0.5; x.stroke();
    }
  }
  function flower(px, py, col) {
    const s = 0.012 * M;
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; x.fillStyle = col; x.beginPath(); x.ellipse(px + Math.cos(a) * s, py + Math.sin(a) * s, s * 0.9, s * 0.55, a, 0, 6.28); x.fill(); }
    x.fillStyle = "#e8c23a"; x.beginPath(); x.arc(px, py, s * 0.5, 0, 6.28); x.fill();
  }
  function bark(px, py, rr) {
    const L = (0.04 + rr() * 0.06) * M, w = L * 0.4;
    x.save(); x.translate(px, py); x.rotate(rr() * 6.28);
    x.fillStyle = "rgba(10,6,3,0.35)"; x.fillRect(-L / 2 + 1, -w / 2 + 1, L, w);
    x.fillStyle = pick(["#4a3220", "#5a3e26", "#3e2a1a"], rr); x.fillRect(-L / 2, -w / 2, L, w);
    x.strokeStyle = "rgba(20,10,4,0.7)"; x.lineWidth = 0.6;
    for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(-L / 2, -w / 2 + w * (k + 0.5) / 3); x.lineTo(L / 2, -w / 2 + w * (k + 0.5) / 3 + (rr() - 0.5)); x.stroke(); }
    x.restore();
  }
  /** n éléments posés au hasard (raccordés aux bords) ; keep(px, py) : filtre facultatif. */
  const scatter = (n, reachM, draw, keep = null) => {
    for (let i = 0; i < n; i++) {
      const [px, py] = rand2();
      if (keep && !keep(px, py)) continue;
      wrap(px, py, reachM * M, draw);
    }
  };
  /** Relief doux d'ensemble ; mossOnly : seulement sur la mousse (pixels plus verts que rouges). */
  const relief = (scale, s, lo, amp, mossOnly = false) => {
    const g = x.getImageData(0, 0, T, T), d = g.data;
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const o = (j * T + i) * 4;
      if (mossOnly && !(d[o + 1] > d[o] + 6)) continue;
      const k = lo + vnoise(i, j, scale, s) * amp;
      d[o] *= k; d[o + 1] *= k; d[o + 2] *= k;
    }
    x.putImageData(g, 0, 0);
  };

  const area = GROUND_TILE * GROUND_TILE;
  if (kind === "litter") {
    soilBase("#2e2014", "#4c3420", 3, 0.15);
    crumbs(area * 900, ["#5a3e26", "#3a2818", "#6b4c2e", "#241810"], 0.004);
    // Litière : couches profondes (feuilles brunies, rongées) puis feuilles fraîches dessus.
    const deep = ["#4a2e18", "#5a3820", "#3e2814", "#634228"], fresh = ["#9a5a22", "#b06a2a", "#8a4a1c", "#c48a3a", "#a87a3c", "#7d6a2a", "#b8963e"];
    const kinds = [["oak", 0.11], ["beech", 0.075], ["birch", 0.05]];
    for (let layer = 0; layer < 3; layer++) {
      scatter(area * [260, 220, 150][layer], 0.1, (qx, qy, rr) => {
        const [k, m] = pick(kinds, rr);
        const col = jitter(hex(layer < 2 ? pick(deep, rr) : pick(fresh, rr)), 0.12, rr);
        deadLeaf(qx, qy, k, m * (0.8 + rr() * 0.4), layer === 0 ? mix(col, [40, 30, 20], 0.35) : col, layer === 0 ? rr() : rr() * 0.6, layer === 0 ? 0.85 : 1, rr);
      }, (px, py) => fbm(px, py, ppc * 1.1, 21) >= 0.33 || r() >= 0.85);   // clairières de terre nue
    }
    scatter(area * 1.6, 0.4, (qx, qy, rr) => twig(qx, qy, 0.15 + rr() * 0.35, jitter(hex("#4e3620"), 0.15, rr), 2, rr));
    scatter(area * 1.2, 0.06, (qx, qy, rr) => bark(qx, qy, rr));
    scatter(area * 5, 0.03, (qx, qy, rr) => (rr() < 0.55 ? acorn : beechnut)(qx, qy, rr));
    scatter(area * 0.8, 0.08, (qx, qy, rr) => pebble(qx, qy, 0.02 + rr() * 0.05, rr));
    mossField(0.63, 40, ["#1a2a0e", "#2f4e18", "#5a7e2a", "#8aa83e"], ppc * 1.3, area * 9000, 0.012, 1);
    // Quelques feuilles tombées depuis, par-dessus la mousse.
    scatter(area * 60, 0.1, (qx, qy, rr) => { const [k, m] = pick(kinds, rr); deadLeaf(qx, qy, k, m * (0.8 + rr() * 0.4), jitter(hex(pick(fresh, rr)), 0.12, rr), rr() * 0.4, 1, rr); });
    scatter(area * 0.6, 0.4, (qx, qy, rr) => twig(qx, qy, 0.15 + rr() * 0.35, jitter(hex("#4e3620"), 0.15, rr), 2, rr));
    scatter(area * 2, 0.03, (qx, qy, rr) => (rr() < 0.55 ? acorn : beechnut)(qx, qy, rr));
    scatter(area * 6, 0.04, (qx, qy, rr) => sprout(qx, qy, pick(["#4a8a34", "#3d7a2c", "#5e9a3c"], rr), rr), (px, py) => fbm(px, py, ppc * 0.9, 50) > 0.55);
    scatter(area * 2.5, 0.03, (qx, qy) => flower(qx, qy, "rgba(245,245,240,0.95)"), (px, py) => fbm(px, py, ppc * 0.7, 60) > 0.62);
    relief(ppc * 2.2, 99, 0.85, 0.3);
  } else {
    // Sol d'aiguilles : peu de grain, aiguilles peu contrastées, mousse en coussins lisses.
    soilBase("#3a2414", "#5a3820", 7, 0.03);
    needles(area * 1500, ["#6e4426", "#7a4c2a", "#6a4a32", "#74502e"], 0.06);
    needles(area * 700, ["#8e5a2c", "#9a6634", "#a87440"], 0.07);
    mossField(0.56, 70, ["#2a4a16", "#3a6020", "#5a8228", "#7a9e34"], ppc * 1.6, area * 7000, 0.03, 0.25);
    relief(0.08 * M, 71, 0.9, 0.2, true);
    needles(area * 250, ["#8e5a2c", "#9a6634", "#a87440"], 0.07);
    scatter(area * 1.2, 0.35, (qx, qy, rr) => twig(qx, qy, 0.12 + rr() * 0.3, jitter(hex("#5a3a20"), 0.15, rr), 3, rr));
    scatter(area * 1.5, 0.06, (qx, qy, rr) => bark(qx, qy, rr));
    scatter(area * 2.2, 0.08, (qx, qy, rr) => cone(qx, qy, 0.06 + rr() * 0.08, rr() < 0.6, rr));
    scatter(area * 1.1, 0.08, (qx, qy, rr) => pebble(qx, qy, 0.02 + rr() * 0.06, rr));
    scatter(area * 3, 0.02, (qx, qy, rr) => { x.fillStyle = rgb(jitter(hex("#a8b48a"), 0.1, rr), 0.85); x.beginPath(); x.arc(qx, qy, 0.01 * M * (0.6 + rr()), 0, 6.28); x.fill(); }, (px, py) => fbm(px, py, ppc, 80) > 0.6);
    scatter(area * 5, 0.04, (qx, qy, rr) => sprout(qx, qy, pick(["#3e7a30", "#4f8a36"], rr), rr), (px, py) => fbm(px, py, ppc * 0.9, 90) > 0.58);
    relief(ppc * 2.2, 99, 0.85, 0.3);
  }
  return canvas;
}
