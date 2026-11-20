/**
 * Images des arbres générés, calculées en arrière-plan par quelques workers et gardées en
 * mémoire : un même arbre (essence, graine, taille, orientation, finesse) n'est dessiné qu'une fois.
 * Sans worker (navigateur trop ancien), le dessin se fait dans la page.
 */
import { log } from "./constants.js";
import { buildTree } from "./tree-gen.js";
import { paintTree, previewImage } from "./tree-paint.js";

const r2 = (n) => Math.round(n * 100) / 100;

class SpritePool {
  constructor() {
    this.cache = new Map();
    this.workers = [];
    this.queue = [];
    this.jobs = new Map();
    this.seq = 0;
    this.max = Math.max(1, Math.min(8, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));
    this.noWorker = typeof OffscreenCanvas === "undefined" || typeof Worker === "undefined";
  }

  _spawn() {
    const w = new Worker(new URL("./tree-worker.js", import.meta.url), { type: "module" });
    w.busy = false;
    w.onmessage = (event) => this._done(w, event.data);
    w.onerror = (error) => {
      log("Dessin des arbres en arrière-plan impossible", error);
      this.noWorker = true;
      for (const x of this.workers) x.terminate();
      this.workers = [];
      // Les dessins en cours sont refaits dans la page.
      for (const job of this.jobs.values()) this.queue.unshift(job);
      this.jobs.clear();
      this._pump();
    };
    this.workers.push(w);
    return w;
  }

  _pump() {
    while (this.queue.length) {
      if (this.noWorker) {
        const job = this.queue.shift();
        // Une demande facultative (affinage au zoom) n'est jamais dessinée dans la page : elle la figerait.
        if (job.background) { job.reject(new Error("Pas de worker")); continue; }
        setTimeout(() => this._here(job), 0);
        continue;
      }
      let w = this.workers.find((x) => !x.busy);
      if (!w && this.workers.length < this.max) {
        try { w = this._spawn(); } catch (error) { log("Workers indisponibles", error); this.noWorker = true; continue; }
      }
      if (!w) return;
      const job = this.queue.shift();
      w.busy = true;
      this.jobs.set(job.id, job);
      w.postMessage({ id: job.id, ...job.req });
    }
  }

  async _here(job) {
    try {
      const { kind, seed, radius, rotation, ppc, detail, preview } = job.req;
      const sprite = paintTree(buildTree(kind, seed, radius, { detail, rotation }), ppc, { wind: !preview });
      if (preview) {
        const img = previewImage(sprite);
        const blob = img.convertToBlob ? await img.convertToBlob({ type: "image/webp", quality: 0.9 })
          : await new Promise((res) => img.toBlob(res, "image/webp", 0.9));
        job.resolve({ half: sprite.half, shadowW: sprite.shadowW, shadowH: sprite.shadowH, blob });
      } else {
        const pieces = sprite.pieces.map(({ canvas, ...p }) => ({ ...p, z: Number.isFinite(p.z) ? p.z : -1e9, img: canvas }));
        job.resolve({ half: sprite.half, shadowW: sprite.shadowW, shadowH: sprite.shadowH, shadow: sprite.shadow, pieces, conifer: sprite.conifer, rigid: sprite.rigid });
      }
    } catch (error) {
      job.reject(error);
    }
  }

  _done(w, msg) {
    w.busy = false;
    const job = this.jobs.get(msg.id);
    this.jobs.delete(msg.id);
    if (job) {
      if (msg.error) job.reject(new Error(msg.error));
      else job.resolve(msg);
    }
    this._pump();
  }

  /**
   * Images d'un arbre.
   * @param {{kind:string, seed:number, radius:number, rotation?:number, ppc:number, detail?:number, preview?:boolean}} req
   * @returns {Promise<object>}  preview : { blob, half, shadowW, shadowH } ; sinon { pieces, shadow, half, shadowW, shadowH, conifer, rigid }
   */
  get(req) {
    const r = { kind: req.kind, seed: req.seed >>> 0, radius: r2(req.radius), rotation: Math.round(req.rotation ?? 0), ppc: Math.round(req.ppc), detail: req.detail ?? 1, preview: !!req.preview };
    const key = JSON.stringify(r);
    let p = this.cache.get(key);
    if (!p) {
      p = new Promise((resolve, reject) => { this.queue.push({ id: ++this.seq, req: r, background: !!req.background, resolve, reject }); });
      // Les images d'export ne sont pas gardées (elles sont grandes) ; les aperçus, si.
      if (r.preview) this.cache.set(key, p);
      p.catch(() => this.cache.delete(key));
      this._pump();
    }
    return p;
  }

  /** Oublie les aperçus (la mémoire des URL d'images est rendue). */
  clear() {
    for (const p of this.cache.values()) p.then((x) => x.url && URL.revokeObjectURL(x.url)).catch(() => {});
    this.cache.clear();
  }
}

export const treeSprites = new SpritePool();
