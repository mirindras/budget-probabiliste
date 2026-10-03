/**
 * Générateur pseudo-aléatoire à graine : xoshiro128** initialisé par splitmix32.
 * Arithmétique entière 32 bits uniquement : pour une graine donnée, la même suite
 * de tirages sur tous les navigateurs (section 7.1).
 */
export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(seed: number) {
    let x = seed >>> 0;
    const next = () => {
      x = (x + 0x9e3779b9) | 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
  }

  /** Entier non signé sur 32 bits. */
  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Uniforme sur l'intervalle ouvert (0, 1), résolution 2^-53. */
  uniform(): number {
    const a = this.nextU32() >>> 5;
    const b = this.nextU32() >>> 6;
    return (a * 67108864 + b + 0.5) / 9007199254740992;
  }

  /** Entier uniforme de lo à hi inclus. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.uniform() * (hi - lo + 1));
  }

  /** Permutation aléatoire de 0 à n - 1 (Fisher-Yates). */
  permutation(n: number): Int32Array {
    const p = new Int32Array(n);
    for (let i = 0; i < n; i++) p[i] = i;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(this.uniform() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    return p;
  }
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** Dérive une sous-graine indépendante (flux séparés pour chaque usage). */
export function subSeed(seed: number, stream: number): number {
  let z = (Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(stream + 1, 0x85ebca77)) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x2c1b3c6d);
  z = Math.imul(z ^ (z >>> 12), 0x297a2d39);
  return (z ^ (z >>> 15)) >>> 0;
}
