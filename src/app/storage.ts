const STORE = 'sekai-reader:';

// Only reader preferences live in localStorage; episode content never does (spec: no localStorage scripts).
type PrefKey = 'bw' | 'recent' | `pos:${string}`;
const ALLOWED = /^(bw|recent|pos:[a-z0-9_]+)$/;

export const prefs = {
  get<T>(k: PrefKey, d: T): T {
    try {
      const v = localStorage.getItem(STORE + k);
      return v == null ? d : (JSON.parse(v) as T);
    } catch { return d; }
  },
  set(k: PrefKey, v: unknown): void {
    if (!ALLOWED.test(k)) throw new Error(`unknown pref key ${k}`);
    try { localStorage.setItem(STORE + k, JSON.stringify(v)); } catch { /* storage unavailable: prefs are best-effort */ }
  },
};
