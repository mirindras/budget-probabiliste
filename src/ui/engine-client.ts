/**
 * Client du moteur : Web Worker par défaut, repli sur le fil principal si le navigateur
 * ou l'hébergement interdit les workers (ouverture en file://, politique de sécurité).
 */
import type { WorkerRequest } from '../engine-host.ts';

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
type Pending = { msg: WorkerRequest; resolve: (v: unknown) => void; reject: (e: Error) => void; onPartial?: (v: unknown) => void };

const WATCHDOG_MS = 6000;

export class EngineClient {
  private worker: Worker | null = null;
  private local: ((msg: WorkerRequest) => void) | null = null;
  private heard = false;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor() {
    try {
      this.worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev) => {
        this.heard = true;
        this.receive(ev.data);
      };
      this.worker.onerror = () => void this.fallback();
    } catch {
      void this.fallback();
    }
  }

  /** Bascule sur le fil principal et rejoue les requêtes en attente. */
  private async fallback() {
    if (this.local) return;
    this.worker?.terminate();
    this.worker = null;
    const { handle } = await import('../engine-host.ts');
    this.local = (msg) => setTimeout(() => handle(msg, (out) => this.receive(out as { id: number })), 0);
    for (const p of this.pending.values()) this.local(p.msg);
  }

  private receive(data: { id: number; output?: unknown; error?: string }) {
    const { id, output, error } = data;
    const p = this.pending.get(id);
    if (!p) return;
    if (error) {
      this.pending.delete(id);
      p.reject(new Error(error));
      return;
    }
    const o = output as { ok?: boolean; partial?: boolean };
    if (o && o.ok === true && o.partial) {
      p.onPartial?.(output);
      return;
    }
    this.pending.delete(id);
    p.resolve(output);
  }

  request<T>(req: DistributiveOmit<WorkerRequest, 'id'>, onPartial?: (v: T) => void): Promise<T> {
    const id = ++this.seq;
    const msg = { ...req, id } as WorkerRequest;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { msg, resolve: resolve as (v: unknown) => void, reject, onPartial: onPartial as (v: unknown) => void });
      if (this.local) {
        this.local(msg);
        return;
      }
      this.worker!.postMessage(msg);
      // Un worker qui ne répond jamais (chargement bloqué sans erreur) déclenche le repli.
      if (!this.heard && !this.watchdog) {
        this.watchdog = setTimeout(() => {
          if (!this.heard) void this.fallback();
        }, WATCHDOG_MS);
      }
    });
  }

  /** Abandonne une requête de calcul remplacée par une plus récente. */
  cancel(id: number) {
    this.pending.delete(id);
  }

  get lastId() {
    return this.seq;
  }
}
