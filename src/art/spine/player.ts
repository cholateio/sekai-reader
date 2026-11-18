// The only module that imports spine-webgl; SpineChibiArt loads it with a dynamic import after the first paint.
// One hidden WebGL canvas renders every chibi in turn and each frame is copied into that figure's own 2D canvas:
// iOS caps live WebGL contexts, so the page never holds more than one. Only figures on screen advance, at 30 fps.
import {
  AnimationState, AnimationStateData, AssetManager, AtlasAttachmentLoader, ManagedWebGLRenderingContext, SceneRenderer,
  Skeleton, SkeletonBinary, Vector2, type SkeletonData, type TextureAtlas,
} from '@esotericsoftware/spine-webgl';
import type { ArtSize } from '../CharacterArt';
import { mirrored, pickAnimations, startPose, type Kind } from '../chibiPose';
import type { ChibiPlayer, ChibiSource, ChibiTarget } from '../SpineChibiArt';

const SKELETON = 'v2_sd_main.skel';
const FPS = 30;
/** CSS width of each figure size (comic.css .cc .sd); the box keeps the static image's 160:136 aspect. */
const WIDTH: Record<ArtSize, number> = { sm: 92, md: 118, lg: 168 };
const ASPECT = 136 / 160;
/** Upper-body framing (spec 「大小」, to be tuned on the owner's phone): the top UPPER of the setup-pose height,
 *  starting HEADROOM above the head. */
export const UPPER = 0.75;
export const HEADROOM = 0.03;

interface SetData { data: SkeletonData; stateData: AnimationStateData; pma: boolean; anims: string[] }
interface Figure {
  t: ChibiTarget; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number;
  skeleton: Skeleton; state: AnimationState; pma: boolean;
  cam: { x: number; y: number; zoom: number };
  once: string; idle: string; shown: boolean; visible: boolean;
}

const promise = <T>(f: (ok: (v: T) => void, err: (e: unknown) => void) => void) => new Promise<T>(f);

export async function createPlayer(src: ChibiSource, kinds: Map<string, Kind>, framing = { upper: UPPER, headroom: HEADROOM }): Promise<ChibiPlayer> {
  const gl_canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  gl_canvas.width = Math.ceil(WIDTH.lg * dpr);
  gl_canvas.height = Math.ceil(WIDTH.lg * ASPECT * dpr);
  // Throws without WebGL; SpineChibiArt then keeps the static images.
  const context = new ManagedWebGLRenderingContext(gl_canvas, { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  const gl = context.gl;
  const renderer = new SceneRenderer(gl_canvas, context, true);
  const assets = new AssetManager(context, `${src.base}/`);

  // A lost context ends the player for this page: every figure goes back to its static image. Registered before
  // the first await so a loss during the skeleton download is not missed.
  let lost = false;
  let raf = 0;
  let io: IntersectionObserver | null = null;
  const figures: Figure[] = [];
  gl_canvas.addEventListener('webglcontextlost', () => {
    lost = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    io?.disconnect();
    for (const f of figures.splice(0)) if (f.canvas.parentNode) f.canvas.replaceWith(f.t.img);
  });

  await promise<unknown>((ok, err) => assets.loadBinary(SKELETON, ok, (_p, e) => err(new Error(e))));
  if (lost) throw new Error('WebGL context lost while loading the chibi skeleton');

  const sets = new Map<string, Promise<SetData>>();
  const setOf = (name: string) => {
    let p = sets.get(name);
    if (!p) {
      p = promise<TextureAtlas>((ok, err) => assets.loadTextureAtlas(`${name}/sekai_atlas.atlas.txt`, (_p, a) => ok(a), (_p, e) => err(new Error(e))))
        .then(atlas => {
          const data = new SkeletonBinary(new AtlasAttachmentLoader(atlas)).readSkeletonData(assets.require(SKELETON) as Uint8Array);
          return { data, stateData: new AnimationStateData(data), pma: atlas.pages[0]?.pma ?? true, anims: data.animations.map(a => a.name) };
        });
      sets.set(name, p);
    }
    return p;
  };

  const observer = new IntersectionObserver(entries => {
    for (const e of entries) {
      const f = figures.find(x => x.canvas === e.target || x.t.host === e.target);
      if (f) f.visible = e.isIntersecting;
    }
    kick();
  });
  io = observer;

  function frame(f: Figure) {
    gl.viewport(0, 0, f.w, f.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const cam = renderer.camera;
    cam.setViewport(f.w, f.h);
    cam.position.set(f.cam.x, f.cam.y, 0);
    cam.zoom = f.cam.zoom;
    renderer.begin();
    renderer.drawSkeleton(f.skeleton, f.pma);
    renderer.end();
    f.ctx.clearRect(0, 0, f.w, f.h);
    // WebGL's origin is bottom-left: the viewport sits at the bottom of the shared canvas.
    f.ctx.drawImage(gl_canvas, 0, gl_canvas.height - f.h, f.w, f.h, 0, 0, f.w, f.h);
  }

  let last = 0;
  function tick(now: number) {
    raf = 0;
    if (lost) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    if (!last || now - last >= 1000 / FPS - 2) {
      last = now;
      for (let i = figures.length - 1; i >= 0; i--) {
        const f = figures[i];
        if (!f.t.host.isConnected) { observer.unobserve(f.t.host); figures.splice(i, 1); continue; }
        if (!f.visible) continue;
        if (!f.shown) {
          // First time on screen: play the line's emotion once, then loop the idle (owner 2026-11-18).
          startPose(f.state, f);
          f.shown = true;
        } else f.state.update(dt);
        f.state.apply(f.skeleton);
        f.skeleton.updateWorldTransform();
        frame(f);
        if (f.canvas.parentNode !== f.t.host) f.t.img.replaceWith(f.canvas);
      }
    }
    if (figures.some(f => f.visible)) raf = requestAnimationFrame(tick);
    else last = 0;
  }
  const kick = () => { if (!raf && !lost) raf = requestAnimationFrame(tick); };

  return {
    attach(t) {
      if (lost || !src.available.has(t.req.chibi)) return;
      setOf(t.req.chibi).then(set => {
        if (lost || !t.host.isConnected) return;
        const w = Math.round(WIDTH[t.size] * dpr), h = Math.round(WIDTH[t.size] * ASPECT * dpr);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.className = 'sd';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', t.img.alt);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const skeleton = new Skeleton(set.data);
        if (mirrored(t.req.side, t.req.chibi, src.noflip)) skeleton.scaleX = -1;
        skeleton.setToSetupPose();
        skeleton.updateWorldTransform();
        const off = new Vector2(), size = new Vector2();
        skeleton.getBounds(off, size, []);
        const cropH = size.y * framing.upper;
        const top = off.y + size.y * (1 + framing.headroom);
        const { once, idle } = pickAnimations(set.anims, t.req.chibi, t.req.motion, t.req.mood, kinds);
        const f: Figure = {
          t, canvas, ctx, w, h, skeleton, state: new AnimationState(set.stateData), pma: set.pma,
          cam: { x: off.x + size.x / 2, y: top - cropH / 2, zoom: cropH / h }, once, idle, shown: false, visible: false,
        };
        figures.push(f);
        observer.observe(t.host);
      }, err => console.warn(`chibi ${t.req.chibi} failed to load; keeping the static image`, err));
    },
  };
}
