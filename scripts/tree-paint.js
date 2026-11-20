/**
 * Dessin d'un arbre généré (tree-gen.js), vu de dessus, en trois images :
 *   color  : l'arbre (fond transparent), branches encrées puis feuilles, de bas en haut ;
 *   data   : carte du vent — R souplesse (0 au pied, 1 au bout des branches), G phase de la
 *            grosse branche (selon le côté de l'arbre), B phase du rameau (feuilles seules) ;
 *   shadow : ombre portée au sol (noir transparent), avec l'ombre douce au pied du tronc.
 * Marche dans la page comme dans un worker (OffscreenCanvas).
 */
import { mulberry32 } from "./catalog.js";
import { leafShape, norm } from "./tree-gen.js";

const INK = "#13221a", INK_A = "rgba(19,34,26,0.7)";
const LIGHT = norm([-0.55, -0.7, 0.9]);
/** Décalage de l'ombre par case de hauteur (lumière en haut à gauche). */
export const SHADOW_SHIFT = [0.147, 0.193];
/** Marge autour de la couronne, en cases : les feuilles qui dépassent et le balancement au vent. */
export const SPRITE_MARGIN = 0.45;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgb = (c, a = 1) => `rgba(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(",")},${a})`;

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/** Taille des images d'un arbre, en pixels, et position du pied du tronc dans chacune. */
export function spriteLayout(built, ppc) {
  const { tree } = built;
  const half = Math.ceil((tree.R + SPRITE_MARGIN) * ppc);
  const sx = Math.ceil(tree.zmax * SHADOW_SHIFT[0] * ppc), sy = Math.ceil(tree.zmax * SHADOW_SHIFT[1] * ppc);
  const blur = Math.ceil(Math.max(1, ppc * 0.03) * 2);
  return {
    size: half * 2, half,
    shadow: { w: half * 2 + sx + blur, h: half * 2 + sy + blur, cx: half, cy: half }
  };
}

/**
 * Dessine un arbre. ppc : pixels par case.
 * @returns {{color, data, shadow, half:number, shadowW:number, shadowH:number}}
 */
export function paintTree(built, ppc, { wind = true } = {}) {
  const { tree, leaves, sp, seed } = built;
  const L = spriteLayout(built, ppc);
  const S = ppc, cx = L.half, cy = L.half;
  const color = makeCanvas(L.size, L.size), ctx = color.getContext("2d");
  const pal = sp.leaves;
  const vr = mulberry32((seed + 17) >>> 0);
  const tone = 1 + (vr() - 0.5) * 0.12;
  const cDark = hex(pal.dark).map((v) => v * tone), cMid = hex(pal.mid).map((v) => v * tone), cLight = hex(pal.light).map((v) => v * tone);
  const [barkD, barkL] = sp.bark.map(hex);
  const X = (p) => cx + p[0] * S, Y = (p) => cy + p[1] * S;
  const trunkW = tree.R * sp.trunkW * S;
  const zmax = tree.zmax;

  /* Ombre : silhouette projetée au sol, puis adoucie et posée en transparence. */
  const shadow = makeCanvas(L.shadow.w, L.shadow.h);
  {
    const raw = makeCanvas(L.shadow.w, L.shadow.h), s = raw.getContext("2d");
    s.fillStyle = s.strokeStyle = "#000"; s.lineCap = "round";
    const P = (p) => [cx + (p[0] + p[2] * SHADOW_SHIFT[0]) * S, cy + (p[1] + p[2] * SHADOW_SHIFT[1]) * S];
    for (const g of tree.segs) {
      const a = P(g.a), b = P(g.b);
      s.lineWidth = Math.max(1, trunkW * (g.w + g.w2) / 2);
      s.beginPath(); s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]); s.stroke();
    }
    for (const l of leaves) {
      const c = P(l.p), r = l.L * S * 0.5;
      s.beginPath(); s.ellipse(c[0] + Math.cos(l.ang) * r, c[1] + Math.sin(l.ang) * r, r * 1.05, Math.max(0.5, r * (l.needle ? 0.9 : l.W * 2 * l.f)), l.ang, 0, Math.PI * 2); s.fill();
    }
    const sc = shadow.getContext("2d");
    sc.save(); sc.globalAlpha = 0.34; sc.filter = `blur(${Math.max(1, S * 0.03)}px)`; sc.drawImage(raw, 0, 0); sc.restore();
    const g0 = sc.createRadialGradient(cx, cy, 0, cx, cy, tree.R * S * 0.6);
    g0.addColorStop(0, "rgba(0,0,0,0.35)"); g0.addColorStop(1, "rgba(0,0,0,0)");
    sc.fillStyle = g0; sc.beginPath(); sc.arc(cx, cy, tree.R * S * 0.6, 0, Math.PI * 2); sc.fill();
  }

  /* Bois et feuilles, triés par hauteur. */
  const items = [];
  for (const g of tree.segs) items.push({ z: Math.min(g.a[2], g.b[2]) - 0.001, g });
  for (const l of leaves) items.push({ z: l.p[2], l });
  items.sort((a, b) => a.z - b.z);

  // Forme d'un morceau de bois : trapèze qui s'affine, arrondi aux deux bouts.
  function woodPath(g, extra) {
    const ax = X(g.a), ay = Y(g.a), bx = X(g.b), by = Y(g.b);
    const wa = Math.max(g.twig ? 0.3 : 0.4, trunkW * g.w / 2) + extra, wb = Math.max(g.twig ? 0.3 : 0.4, trunkW * g.w2 / 2) + extra;
    const len = Math.hypot(bx - ax, by - ay), p = new Path2D();
    if (len < 0.01) { p.arc(ax, ay, wa, 0, Math.PI * 2); return p; }
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    p.moveTo(ax + nx * wa, ay + ny * wa); p.lineTo(bx + nx * wb, by + ny * wb);
    p.lineTo(bx - nx * wb, by - ny * wb); p.lineTo(ax - nx * wa, ay - ny * wa); p.closePath();
    p.moveTo(ax + wa, ay); p.arc(ax, ay, wa, 0, Math.PI * 2); p.moveTo(bx + wb, by); p.arc(bx, by, wb, 0, Math.PI * 2);
    return p;
  }
  // Bois par lots : encre d'abord, écorce par-dessus, pour que les fourches soient d'un seul tenant.
  const batch = [];
  function flushWood() {
    if (!batch.length) return;
    ctx.fillStyle = INK;
    for (const g of batch) ctx.fill(woodPath(g, g.twig ? 0.35 : Math.min(1.4, 0.5 + trunkW * g.w * 0.08)));
    for (const g of batch) {
      const h = Math.max(0, Math.min(g.a[2], g.b[2])) / zmax;
      ctx.fillStyle = rgb(mix(barkD, barkL, g.root ? 0.25 : 0.15 + 0.55 * h));
      ctx.fill(woodPath(g, 0));
    }
    // Modelé (ombre et reflet) puis texture de l'écorce, sur les branches assez larges.
    ctx.lineCap = "round";
    for (const g of batch) {
      const wpx = trunkW * g.w;
      if (g.twig || wpx < 3) continue;
      const ax = X(g.a), ay = Y(g.a), bx = X(g.b), by = Y(g.b), len = Math.hypot(bx - ax, by - ay);
      if (len < 0.5) continue;
      const nx = -(by - ay) / len, ny = (bx - ax) / len, sgn = nx * LIGHT[0] + ny * LIGHT[1] > 0 ? 1 : -1;
      const wa = trunkW * g.w / 2, wb = trunkW * g.w2 / 2;
      ctx.strokeStyle = rgb(barkD, 0.5); ctx.lineWidth = (wa + wb) * 0.42;
      ctx.beginPath(); ctx.moveTo(ax - nx * sgn * wa * 0.5, ay - ny * sgn * wa * 0.5); ctx.lineTo(bx - nx * sgn * wb * 0.5, by - ny * sgn * wb * 0.5); ctx.stroke();
      ctx.strokeStyle = rgb(barkL, 0.55); ctx.lineWidth = (wa + wb) * 0.26;
      ctx.beginPath(); ctx.moveTo(ax + nx * sgn * wa * 0.45, ay + ny * sgn * wa * 0.45); ctx.lineTo(bx + nx * sgn * wb * 0.45, by + ny * sgn * wb * 0.45); ctx.stroke();
      if (wpx < 5) continue;
      const r2 = mulberry32(((g.a[0] * 7919 + g.a[1] * 104729) * 1e3) | 0);
      if (sp.smoothBark) {
        // Écorce lisse (hêtre) : quelques marbrures claires seulement.
        ctx.strokeStyle = rgb(barkL, 0.35); ctx.lineWidth = Math.max(0.7, wpx * 0.06);
        for (let k = 0; k < len / 12; k++) {
          const t = r2(), mx = ax + (bx - ax) * t, my = ay + (by - ay) * t, wl = trunkW * (g.w + (g.w2 - g.w) * t) / 2;
          const c = (r2() * 2 - 1) * wl * 0.6, l2 = wl * 0.5, dx = (bx - ax) / len, dy = (by - ay) / len;
          ctx.beginPath(); ctx.moveTo(mx + nx * c - dx * l2, my + ny * c - dy * l2); ctx.lineTo(mx + nx * c + dx * l2, my + ny * c + dy * l2); ctx.stroke();
        }
      } else if (sp.birchBark) {
        ctx.strokeStyle = rgb([38, 34, 30], 0.85); ctx.lineWidth = Math.max(1, wpx * 0.08);
        for (let k = 0; k < len / 7; k++) {
          const t = r2(), mx = ax + (bx - ax) * t, my = ay + (by - ay) * t, wl = trunkW * (g.w + (g.w2 - g.w) * t) / 2;
          const c0 = (r2() - 0.6) * wl, c1 = c0 + wl * (0.3 + r2() * 0.5);
          ctx.beginPath(); ctx.moveTo(mx + nx * c0, my + ny * c0); ctx.lineTo(mx + nx * c1, my + ny * c1); ctx.stroke();
        }
      } else if (tree.pine) {
        ctx.strokeStyle = rgb(mix(barkD, [0, 0, 0], 0.3), 0.55); ctx.lineWidth = Math.max(0.7, wpx * 0.045);
        const dx = (bx - ax) / len, dy = (by - ay) / len;
        for (let k = 0; k < len / 6; k++) {
          const t = r2(), mx = ax + (bx - ax) * t, my = ay + (by - ay) * t, wl = trunkW * (g.w + (g.w2 - g.w) * t) / 2;
          const c = (r2() * 2 - 1) * wl * 0.7, l2 = wl * 0.35;
          ctx.beginPath(); ctx.moveTo(mx + nx * c - dx * l2, my + ny * c - dy * l2); ctx.lineTo(mx + nx * c + dx * l2, my + ny * c + dy * l2); ctx.stroke();
        }
      } else {
        ctx.strokeStyle = rgb(mix(barkD, [0, 0, 0], 0.3), 0.55); ctx.lineWidth = Math.max(0.7, wpx * 0.045);
        const lines = Math.max(2, Math.round(wpx / 5));
        for (let k = 0; k < lines; k++) {
          const c = (r2() * 2 - 1) * 0.8, t0 = r2() * 0.3, t1 = 0.7 + r2() * 0.3;
          ctx.beginPath();
          for (let j = 0; j <= 6; j++) {
            const t = t0 + (t1 - t0) * j / 6, wl = trunkW * (g.w + (g.w2 - g.w) * t) / 2, cc = (c + Math.sin(t * 9 + k) * 0.08) * wl;
            const px = ax + (bx - ax) * t + nx * cc, py = ay + (by - ay) * t + ny * cc;
            if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.stroke();
        }
      }
    }
    batch.length = 0;
  }
  // Charpente d'un seul lot, sous le feuillage ; les rameaux suivent l'ordre de hauteur.
  for (const it of items) if (it.g && !it.g.twig) batch.push(it.g);
  flushWood();
  ctx.lineJoin = "round";
  for (const it of items) {
    if (it.g) { if (it.g.twig) batch.push(it.g); continue; }
    flushWood();
    const l = it.l, x = X(l.p), y = Y(l.p), Lp = l.L * S, h = l.p[2] / zmax;
    if (l.fruit || l.cap) {
      // Baie ou chapeau de champignon : disque encré, ombré du côté opposé à la lumière.
      const rr = Math.max(0.6, Lp / 2), c = hex(l.color);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, rr + Math.max(0.5, rr * 0.12), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgb(mix(c, [0, 0, 0], 0.25)); ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgb(c); ctx.beginPath(); ctx.arc(x - rr * 0.12, y - rr * 0.15, rr * 0.82, 0, Math.PI * 2); ctx.fill();
      if (l.cap && l.dots) {
        const lr = mulberry32((l.seed * 4294967296) >>> 0);
        ctx.fillStyle = "rgba(245,238,225,0.95)";
        for (let k = 0; k < 9; k++) { const a = lr() * Math.PI * 2, d = rr * 0.7 * Math.sqrt(lr()); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(0.4, rr * (0.07 + lr() * 0.06)), 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.fillStyle = `rgba(255,255,255,${l.cap ? 0.25 : 0.55})`;
      ctx.beginPath(); ctx.arc(x - rr * 0.35, y - rr * 0.4, rr * (l.cap ? 0.35 : 0.25), 0, Math.PI * 2); ctx.fill();
      continue;
    }
    if (l.needle) {
      // Touffe de 5 aiguilles.
      const lr = mulberry32((l.seed * 4294967296) >>> 0);
      const tip = Math.min(1, Math.hypot(l.p[0], l.p[1]) / tree.R);
      const base = mix(mix(cDark, cLight, Math.min(1, 0.05 + h * 0.55 + tip * 0.2)), l.shade > 0.5 ? cLight : cDark, Math.abs(l.shade - 0.5) * 0.7);
      const ends = [];
      for (let k = 0; k < 5; k++) { const a = l.ang + (lr() - 0.5) * 1.3, d = Lp * (0.7 + lr() * 0.3); ends.push([x + Math.cos(a) * d, y + Math.sin(a) * d]); }
      ctx.strokeStyle = INK_A; ctx.lineWidth = Math.max(1.1, Lp * 0.06);
      ctx.beginPath(); for (const [ex, ey] of ends) { ctx.moveTo(x, y); ctx.lineTo(ex, ey); } ctx.stroke();
      ctx.strokeStyle = rgb(base); ctx.lineWidth = Math.max(0.6, Lp * 0.03);
      ctx.beginPath(); for (const [ex, ey] of ends) { ctx.moveTo(x, y); ctx.lineTo(ex, ey); } ctx.stroke();
      continue;
    }
    // Une feuille : limbe en deux moitiés (côté éclairé plus clair), contour encré ;
    // pétiole et nervure seulement si elle est assez grande à l'image.
    const ca = Math.cos(l.ang), sa = Math.sin(l.ang);
    const off = l.off ?? 0.14;
    const W = (u, v) => [x + ((u + off) * ca - v * l.f * sa) * Lp, y + ((u + off) * sa + v * l.f * ca) * Lp];
    const { top, bot } = leafShape(l, l.shape ?? sp.leaf, l.shape === "fern" ? (Lp < 10 ? 12 : 24) : Lp < 10 ? 8 : Lp < 22 ? 16 : 36);
    let base = mix(cDark, cMid, Math.min(1, 0.05 + h));
    base = mix(base, l.shade > 0.5 ? cLight : cDark, Math.abs(l.shade - 0.5) * 0.4);
    const litTop = sa * LIGHT[0] - ca * LIGHT[1] > 0;
    const big = Lp >= 10;
    if (big && off) { const p0 = W(-off, 0), p1 = W(0, 0); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.8, Lp * 0.035); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
    const outline = new Path2D(); let q = W(0, 0); outline.moveTo(q[0], q[1]);
    for (const [u, v] of top) { q = W(u, v); outline.lineTo(q[0], q[1]); }
    for (let i = bot.length - 1; i >= 0; i--) { q = W(bot[i][0], bot[i][1]); outline.lineTo(q[0], q[1]); }
    outline.closePath();
    ctx.strokeStyle = INK_A; ctx.lineWidth = big ? Math.max(1, Lp * 0.05) : 0.9; ctx.stroke(outline);
    const half = (pts, col) => { const hp = new Path2D(); let p = W(0, 0); hp.moveTo(p[0], p[1]); for (const [u, v] of pts) { p = W(u, v); hp.lineTo(p[0], p[1]); } hp.closePath(); ctx.fillStyle = rgb(col); ctx.fill(hp); };
    half(top, litTop ? mix(base, cLight, 0.3) : mix(base, cDark, 0.2));
    half(bot, litTop ? mix(base, cDark, 0.2) : mix(base, cLight, 0.3));
    if (big) { const m0 = W(0.02, 0), m1 = W(0.88, 0); ctx.strokeStyle = rgb(mix(base, cLight, 0.6), 0.6); ctx.lineWidth = Math.max(0.5, Lp * 0.025); ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.stroke(); }
  }
  flushWood();
  if (tree.stumpR) paintStumpTop(ctx, cx, cy, tree.stumpR * S, sp, seed);

  // Aperçu de l'éditeur : pas besoin de la carte du vent.
  if (!wind) return { color, data: null, shadow, half: L.half, shadowW: L.shadow.w, shadowH: L.shadow.h };

  /* Carte du vent : mêmes formes (simplifiées), même ordre. */
  const sharp = makeCanvas(L.size, L.size), D = sharp.getContext("2d");
  D.fillStyle = "#000"; D.fillRect(0, 0, L.size, L.size);
  const bmax = zmax + tree.R;
  // Le sapin plie d'un bloc (tronc souple, branches raides) ; le feuillu par ses branches.
  const bend = sp.rigid ? () => 0 : tree.pine
    ? (p) => Math.min(1, 0.25 + 0.55 * Math.max(0, p[2]) / zmax + 0.2 * Math.hypot(p[0], p[1]) / tree.R)
    : (p) => Math.pow(Math.min(1, Math.max(0, (Math.max(0, p[2]) + Math.hypot(p[0], p[1])) / bmax)), 1.4);
  // Phase continue tout autour de l'arbre (aucune couture qui déchirerait l'image).
  const grp = (p) => { const a = Math.atan2(p[1], p[0]), k = tree.pine ? 0.3 : 1; return 0.5 + k * (0.24 * Math.sin(a) + 0.14 * Math.cos(2 * a + 1.3)); };
  const dcol = (p, b) => `rgb(${Math.round(bend(p) * 255)},${Math.round(grp(p) * 255)},${b})`;
  for (const it of items) if (it.g && !it.g.twig) { D.fillStyle = it.g.root ? "#000" : dcol(it.g.b, 0); D.fill(woodPath(it.g, 1)); }
  for (const it of items) {
    if (it.g) { if (it.g.twig) { D.fillStyle = dcol(it.g.b, 0); D.fill(woodPath(it.g, 1)); } continue; }
    const l = it.l, Lp = l.L * S, r = Lp * 0.6;
    D.fillStyle = dcol(l.p, l.needle ? 0 : 20 + Math.round(235 * l.tp));
    D.beginPath(); D.ellipse(X(l.p) + Math.cos(l.ang) * r, Y(l.p) + Math.sin(l.ang) * r, r + 0.8, (l.needle ? r : Lp * l.W * l.f) + 0.8, l.ang, 0, Math.PI * 2); D.fill();
  }
  // Souplesse et phase élargies et adoucies (les feuilles du bord peuvent sortir de leur place
  // sans être coupées) ; la phase des rameaux reste nette.
  const data = makeCanvas(L.size, L.size), wd = data.getContext("2d"), rad = Math.max(3, S * 0.08);
  wd.fillStyle = "#000"; wd.fillRect(0, 0, L.size, L.size);
  wd.globalCompositeOperation = "lighten";
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; for (const f of [0.5, 1]) wd.drawImage(sharp, Math.cos(a) * rad * f, Math.sin(a) * rad * f); }
  wd.drawImage(sharp, 0, 0);
  wd.globalCompositeOperation = "source-over";
  const soft = makeCanvas(L.size, L.size), sc = soft.getContext("2d");
  sc.filter = `blur(${rad * 0.5}px)`; sc.drawImage(data, 0, 0);
  const A = sc.getImageData(0, 0, L.size, L.size), B = D.getImageData(0, 0, L.size, L.size);
  for (let i = 0; i < A.data.length; i += 4) { A.data[i + 2] = B.data[i + 2]; A.data[i + 3] = 255; }
  wd.putImageData(A, 0, 0);

  return { color, data, shadow, half: L.half, shadowW: L.shadow.w, shadowH: L.shadow.h };
}

/** Dessus d'une souche : écorce, bois coupé, cernes, fentes et mousse. */
function paintStumpTop(ctx, x, y, r, sp, seed) {
  const rand = mulberry32((seed * 31 + 7) >>> 0);
  const [b0, b1] = sp.bark.map(hex), [w0, w1] = sp.wood.map(hex);
  // Contour un peu irrégulier.
  const ring = (k) => { const p = new Path2D(); for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, rr = r * k * (1 + 0.05 * Math.sin(a * 3 + seed) + 0.03 * Math.sin(a * 7)); i ? p.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : p.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } p.closePath(); return p; };
  ctx.fillStyle = INK; ctx.fill(ring(1.08));
  ctx.fillStyle = rgb(b0); ctx.fill(ring(1));
  ctx.fillStyle = rgb(b1, 0.5); ctx.save(); ctx.translate(-r * 0.05, -r * 0.06); ctx.fill(ring(0.97)); ctx.restore();
  ctx.fillStyle = rgb(w0); ctx.fill(ring(0.84));
  ctx.fillStyle = rgb(w1, 0.6); ctx.fill(ring(0.6));
  ctx.strokeStyle = rgb(mix(w0, [60, 35, 15], 0.45), 0.55); ctx.lineWidth = Math.max(0.6, r * 0.018);
  for (let k = 0.12; k < 0.84; k += 0.07 + rand() * 0.04) ctx.stroke(ring(k));
  // Fentes de séchage depuis le cœur.
  ctx.strokeStyle = rgb(mix(w0, [40, 20, 8], 0.6), 0.7); ctx.lineWidth = Math.max(0.7, r * 0.025);
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2, l = r * (0.4 + rand() * 0.4);
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.08, y + Math.sin(a) * r * 0.08); ctx.lineTo(x + Math.cos(a + 0.1) * l, y + Math.sin(a + 0.1) * l); ctx.stroke();
  }
  // Mousse sur le bord.
  const moss = sp.leaves;
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2, d = r * (0.85 + rand() * 0.25);
    ctx.fillStyle = rgb(hex(rand() < 0.5 ? moss.mid : moss.light), 0.85);
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.04 + rand() * 0.05), 0, Math.PI * 2); ctx.fill();
  }
}

/** Aperçu de l'éditeur : ombre puis arbre, dans une seule image. */
export function previewImage(sprite) {
  const c = makeCanvas(sprite.shadowW, sprite.shadowH), x = c.getContext("2d");
  x.drawImage(sprite.shadow, 0, 0);
  x.drawImage(sprite.color, 0, 0);
  return c;
}
