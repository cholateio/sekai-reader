// Spine chibis (spec 2026-11-18, phase 3). Every figure renders as the static image first; once the page has painted,
// the player module (and with it spine-webgl and the 2.3 MB skeleton) loads and swaps each image for an animated
// canvas of the same size. Anything missing (no chibi for this line, no WebGL, reduced motion, a load error) leaves
// the static image in place.
import type { Line } from '../scenario/types';
import type { ArtRequest, ArtSize, CharacterArt } from './CharacterArt';
import { episodeKinds, type Kind } from './chibiPose';

export interface ChibiTarget { host: HTMLElement; img: HTMLImageElement; req: ArtRequest & { chibi: string }; size: ArtSize }
/** attach ignores a target whose chibi set is not available. */
export interface ChibiPlayer { attach(t: ChibiTarget): void }
export interface ChibiSource {
  /** URL prefix the chibi files are served under (`/chibi`). */
  base: string;
  /** Sets whose atlas and texture are both deployed. */
  available: ReadonlySet<string>;
  /** Chibis the game never mirrors (catalogue `noflip`). */
  noflip: ReadonlySet<string>;
}
/** Loads the chibi source (dev file list, later the manifest) and the player module. */
export type PlayerLoader = (kinds: Map<string, Kind>) => Promise<ChibiPlayer>;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class SpineChibiArt implements CharacterArt {
  private readonly kinds: Map<string, Kind>;
  private readonly pending: ChibiTarget[] = [];
  private player: ChibiPlayer | null = null;
  private loading = false;
  private failed = false;

  constructor(private readonly fallback: CharacterArt, lines: Line[], private readonly load: PlayerLoader) {
    this.kinds = episodeKinds(lines);
  }

  render(req: ArtRequest, size: ArtSize): HTMLElement {
    const host = this.fallback.render(req, size);
    const img = host.querySelector<HTMLImageElement>('img.sd');
    // Only figures that already reserve the image box are upgraded, so the swap never moves the layout.
    if (this.failed || !img || !req.chibi || reducedMotion()) return host;
    const t: ChibiTarget = { host, img, req: req as ChibiTarget['req'], size };
    if (this.player) this.player.attach(t);
    else { this.pending.push(t); this.start(); }
    return host;
  }

  private start() {
    if (this.loading) return;
    this.loading = true;
    // After the first paint: the reader shows the static page at once and the player loads behind it.
    const go = () => {
      this.load(this.kinds).then(p => {
        this.player = p;
        for (const t of this.pending.splice(0)) p.attach(t);
      }, err => {
        this.failed = true;
        this.pending.length = 0;
        console.warn('chibi player unavailable, keeping static images', err);
      });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(go, 0));
    else setTimeout(go, 0);
  }
}
