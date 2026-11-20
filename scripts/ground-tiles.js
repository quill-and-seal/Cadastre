/**
 * Tuiles des sols peints (ground.js), calculées une fois (en arrière-plan si possible) et gardées
 * en mémoire sous forme d'image intégrée (data URI) : utilisable dans un motif SVG, à l'écran
 * comme dans l'image exportée (qui ne charge aucune ressource externe).
 * Tant qu'une tuile n'est pas prête, le sol est dessiné avec son motif simple.
 */
import { log } from "./constants.js";
import { GROUND_PPC } from "./ground.js";

const tiles = new Map();      // kind → data URI
const pending = new Map();    // kind → Promise
const listeners = new Set();
let worker = null, seq = 0;
const jobs = new Map();

const toDataURI = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

async function paintHere(kind) {
  const { paintGround } = await import("./ground.js");
  const canvas = paintGround(kind, GROUND_PPC, 1);
  if (canvas.convertToBlob) return canvas.convertToBlob({ type: "image/webp", quality: 0.9 });
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
}

function paint(kind) {
  if (typeof OffscreenCanvas !== "undefined" && typeof Worker !== "undefined") {
    try {
      if (!worker) {
        worker = new Worker(new URL("./ground-worker.js", import.meta.url), { type: "module" });
        worker.onmessage = ({ data }) => {
          const job = jobs.get(data.id); jobs.delete(data.id);
          if (!job) return;
          if (data.error) job.reject(new Error(data.error)); else job.resolve(data.blob);
        };
        worker.onerror = (error) => {
          log("Sols peints en arrière-plan impossibles", error);
          worker = null;
          for (const job of jobs.values()) paintHere(job.kind).then(job.resolve, job.reject);
          jobs.clear();
        };
      }
      return new Promise((resolve, reject) => {
        const id = ++seq;
        jobs.set(id, { kind, resolve, reject });
        worker.postMessage({ id, kind, ppc: GROUND_PPC, seed: 1 });
      });
    } catch (error) {
      worker = null;
    }
  }
  return paintHere(kind);
}

/** Tuile prête (data URI), ou null — et son calcul est alors lancé. */
export function groundTile(kind) {
  if (tiles.has(kind)) return tiles.get(kind);
  if (typeof document === "undefined" && typeof OffscreenCanvas === "undefined") return null;
  loadGroundTile(kind);
  return null;
}

/** @returns {Promise<string|null>} */
export function loadGroundTile(kind) {
  if (tiles.has(kind)) return Promise.resolve(tiles.get(kind));
  let p = pending.get(kind);
  if (!p) {
    p = paint(kind).then(toDataURI).then((uri) => {
      tiles.set(kind, uri);
      for (const fn of listeners) { try { fn(kind); } catch (error) { log(error); } }
      return uri;
    }).catch((error) => { log("Sol peint non calculé", kind, error); pending.delete(kind); return null; });
    pending.set(kind, p);
  }
  return p;
}

/** Prévenu quand une tuile est prête (l'éditeur redessine ses sols). */
export function onGroundTile(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
