/// <reference lib="webworker" />
/** Calcul en tâche de fond (Web Worker) : l'écran reste fluide pendant le calcul (section 7.1). */
import { handle, type WorkerRequest } from './engine-host.ts';

export type { WorkerRequest };

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  handle(ev.data, (msg, transfer) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? []));
};
