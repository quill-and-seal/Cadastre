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
/** Décalage de l'ombre par case de hauteur, soleil haut (lumière en haut à gauche). */
export const SHADOW_SHIFT = [0.147, 0.193];
/**
 * Les ombres sont dessinées à pleine force (silhouette, et plus sombre au pied du tronc) ; leur
 * intensité est appliquée à l'affichage (réglage « Intensité des ombres »). Aperçu de l'éditeur :
 * intensité par défaut.
 */
const SHADOW_BODY = 0.92, SHADOW_FOOT = 0.4;
export const SHADOW_DEFAULT = 1;
/**
 * Teinte des ombres : un bleu-vert très sombre plutôt que du noir. Sous un ciel bleu, une ombre
 * sur l'herbe au soleil est froide : elle se lit comme une ombre, pas comme un sol plus foncé.
 */
const SHADOW_COLOR = "rgb(5,14,28)";
/** Marge autour de la couronne, en cases : les feuilles qui dépassent et le balancement au vent. */
export const SPRITE_MARGIN = 0.45;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgb = (c, a = 1) => `rgba(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(",")},${a})`;

/** Flou du bord de l'ombre (pixels) : plus l'ombre tombe loin, plus son bord est doux. */
const shadowBlur = (ppc, sun) => Math.max(0.8, ppc * 0.018 * Math.sqrt(sun));

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/** Taille des images d'un arbre, en pixels, et position du pied du tronc dans chacune. */
export function spriteLayout(built, ppc, sun = 1) {
  const { tree } = built;
  const half = Math.ceil((tree.R + SPRITE_MARGIN) * ppc);
  const sx = Math.ceil(tree.zmax * SHADOW_SHIFT[0] * sun * ppc), sy = Math.ceil(tree.zmax * SHADOW_SHIFT[1] * sun * ppc);
  const blur = Math.ceil(shadowBlur(ppc, Math.max(1, sun)) * 2);
  return {
    size: half * 2, half,
    shadow: { w: half * 2 + sx + blur, h: half * 2 + sy + blur, cx: half, cy: half }
  };
}

/**
 * Dessine un arbre. ppc : pixels par case.
 * wind = false (aperçu de l'éditeur) : l'arbre d'une seule image (color).
 * wind = true (scène) : l'arbre en morceaux rigides (pieces), chacun dans sa propre image, qui
 *   pivotent au vent autour de leur point d'attache (tree-layer.js) :
 *   { canvas, x0, y0 (coin de l'image), ax, ay (point d'attache), lx, ly (du point d'attache au
 *   centre du feuillage), h (hauteur moyenne, cases), z (ordre de dessin) } — en pixels de l'arbre,
 *   pied du tronc en (half, half).
 * @returns {{color?, pieces?, shadow, half:number, shadowW:number, shadowH:number}}
 */
export function paintTree(built, ppc, { wind = true, sun = 1 } = {}) {
  const { tree, leaves, sp, seed } = built;
  const L = spriteLayout(built, ppc, sun);
  const S = ppc, cx = L.half, cy = L.half;
  let OX = 0, OY = 0;
  const color = wind ? null : makeCanvas(L.size, L.size);
  let ctx = color?.getContext("2d");
  const pal = sp.leaves;
  const vr = mulberry32((seed + 17) >>> 0);
  const tone = 1 + (vr() - 0.5) * 0.12;
  const cDark = hex(pal.dark).map((v) => v * tone), cMid = hex(pal.mid).map((v) => v * tone), cLight = hex(pal.light).map((v) => v * tone);
  const [barkD, barkL] = sp.bark.map(hex);
  const X = (p) => cx + OX + p[0] * S, Y = (p) => cy + OY + p[1] * S;
  const trunkW = tree.R * sp.trunkW * S;
  const zmax = tree.zmax;

  /* Ombre : silhouette projetée au sol, puis adoucie et posée en transparence. */
  const shadow = makeCanvas(L.shadow.w, L.shadow.h);
  {
    const raw = makeCanvas(L.shadow.w, L.shadow.h), s = raw.getContext("2d");
    s.fillStyle = s.strokeStyle = "#000"; s.lineCap = "round";
    const kx = SHADOW_SHIFT[0] * sun, ky = SHADOW_SHIFT[1] * sun;
    const P = (p) => [cx + (p[0] + p[2] * kx) * S, cy + (p[1] + p[2] * ky) * S];
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
    sc.save(); sc.globalAlpha = SHADOW_BODY; sc.filter = `blur(${shadowBlur(S, Math.max(1, sun))}px)`; sc.drawImage(raw, 0, 0); sc.restore();
    // sun = 0 : silhouette vue d'en haut, que la scène projette elle-même selon l'heure (le pied
    // du tronc y est dessiné à part) ; sinon, ombre déjà projetée, assombrie au pied du tronc.
    if (sun > 0) {
      const g0 = sc.createRadialGradient(cx, cy, 0, cx, cy, tree.R * S * 0.6);
      g0.addColorStop(0, `rgba(0,0,0,${SHADOW_FOOT})`); g0.addColorStop(1, "rgba(0,0,0,0)");
      sc.fillStyle = g0; sc.beginPath(); sc.arc(cx, cy, tree.R * S * 0.6, 0, Math.PI * 2); sc.fill();
    }
    sc.globalCompositeOperation = "source-in";
    sc.fillStyle = SHADOW_COLOR; sc.fillRect(0, 0, L.shadow.w, L.shadow.h);
    sc.globalCompositeOperation = "source-over";
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
  function draw(list, stump) {
  // Charpente d'un seul lot, sous le feuillage ; les rameaux suivent l'ordre de hauteur.
  for (const it of list) if (it.g && !it.g.twig) batch.push(it.g);
  flushWood();
  ctx.lineJoin = "round";
  for (const it of list) {
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
  if (stump && tree.stumpR) paintStumpTop(ctx, cx + OX, cy + OY, tree.stumpR * S, sp, seed);
  }

  const out = { shadow, half: L.half, shadowW: L.shadow.w, shadowH: L.shadow.h };
  if (!wind) { draw(items, true); return { ...out, color }; }

  /* Morceaux rigides : chacun dans son image, juste à sa taille. */
  const groups = new Map();
  for (const it of items) {
    const id = sp.single ? 0 : (it.g ?? it.l).piece ?? 0;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(it);
  }
  if (tree.stumpR && !groups.has(0)) groups.set(0, []);
  const info = new Map((tree.pieces ?? []).map((q) => [q.id, q]));
  const pieces = [];
  for (const [id, list] of groups) {
    // Cadre : tout ce que dessine le morceau, encre et feuilles comprises.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, zs = 0, n = 0, fx = 0, fy = 0, nf = 0;
    const grow = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
    for (const it of list) {
      if (it.g) {
        const r = Math.max(trunkW * Math.max(it.g.w, it.g.w2) / 2, 0.5) + 3;
        grow(cx + it.g.a[0] * S, cy + it.g.a[1] * S, r); grow(cx + it.g.b[0] * S, cy + it.g.b[1] * S, r);
      } else {
        const r = it.l.L * S * 1.25 + 3, x = cx + it.l.p[0] * S, y = cy + it.l.p[1] * S;
        grow(x, y, r);
        fx += x; fy += y; nf++;
      }
      zs += it.z; n++;
    }
    if (id === 0 && tree.stumpR) grow(cx, cy, tree.stumpR * S * 1.15 + 3);
    if (!Number.isFinite(x0)) continue;
    x0 = Math.floor(x0); y0 = Math.floor(y0);
    const w = Math.max(1, Math.ceil(x1) - x0), h = Math.max(1, Math.ceil(y1) - y0);
    const canvas = makeCanvas(w, h);
    ctx = canvas.getContext("2d");
    OX = -x0; OY = -y0;
    draw(list, id === 0);
    OX = 0; OY = 0;
    const at = info.get(id)?.at;
    const ax = at ? cx + at[0] * S : cx, ay = at ? cy + at[1] * S : cy;
    const mx = nf ? fx / nf : (x0 + x1) / 2, my = nf ? fy / nf : (y0 + y1) / 2;
    pieces.push({ canvas, x0, y0, w, h, ax, ay, lx: mx - ax, ly: my - ay, h3: n ? zs / n : 0, z: id === 0 ? -Infinity : (n ? zs / n : 0), id });
  }
  // Le morceau 0 (tronc, charpentières) en dessous, puis les branches de la plus basse à la plus haute.
  pieces.sort((a, b) => a.z - b.z);
  // Hauteurs de la couronne (cases) : bas (un cinquième des feuilles plus bas) et haut, pour
  // projeter l'ombre selon le soleil.
  const zs = (leaves ?? []).map((l) => l.p[2]).sort((a, b) => a - b);
  const zhi = zs.length ? zs[zs.length - 1] : tree.zmax, zlo = zs.length ? zs[Math.floor(zs.length * 0.2)] : tree.zmax * 0.5;
  return { ...out, pieces, rigid: !!sp.rigid, conifer: !!tree.pine, zlo, zhi };
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
  x.globalAlpha = SHADOW_DEFAULT;
  x.drawImage(sprite.shadow, 0, 0);
  x.globalAlpha = 1;
  x.drawImage(sprite.color, 0, 0);
  return c;
}
