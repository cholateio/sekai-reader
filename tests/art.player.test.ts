// Player lifecycle against a fake spine-webgl (jsdom has no WebGL): context loss before and after the skeleton
// loads, and the swap back to static images.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  canvas: null as HTMLCanvasElement | null,
  binary: [] as { ok: () => void; err: (p: string, e: string) => void }[],
  atlases: [] as string[],
}));

vi.mock('@esotericsoftware/spine-webgl', () => {
  class ManagedWebGLRenderingContext {
    gl = { viewport() {}, clearColor() {}, clear() {}, COLOR_BUFFER_BIT: 0 };
    constructor(canvas: HTMLCanvasElement) { h.canvas = canvas; }
  }
  class SceneRenderer { camera = { setViewport() {}, position: { set() {} }, zoom: 1 }; begin() {} drawSkeleton() {} end() {} }
  class AssetManager {
    loadBinary(_p: string, ok: () => void, err: (p: string, e: string) => void) { h.binary.push({ ok, err }); }
    loadTextureAtlas(p: string, ok: (p: string, a: unknown) => void) { h.atlases.push(p); ok(p, { pages: [{ pma: true }] }); }
    require() { return new Uint8Array(); }
  }
  class SkeletonBinary { readSkeletonData() { return { animations: [{ name: 'v2_pose_default' }] }; } }
  class Skeleton {
    scaleX = 1;
    setToSetupPose() {} updateWorldTransform() {}
    getBounds(off: { x: number; y: number }, size: { x: number; y: number }) { off.x = -50; off.y = 0; size.x = 100; size.y = 200; }
  }
  class AnimationState { setAnimation() {} addAnimation() {} update() {} apply() {} }
  class AnimationStateData {}
  class AtlasAttachmentLoader {}
  class Vector2 { x = 0; y = 0; }
  return { ManagedWebGLRenderingContext, SceneRenderer, AssetManager, SkeletonBinary, Skeleton, AnimationState, AnimationStateData, AtlasAttachmentLoader, Vector2 };
});

import { createPlayer } from '../src/art/spine/player';
import type { ChibiTarget } from '../src/art/SpineChibiArt';

let ioCallback: ((e: { target: Element; isIntersecting: boolean }[]) => void) | null = null;
beforeEach(() => {
  h.canvas = null; h.binary.length = 0; h.atlases.length = 0; ioCallback = null;
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: typeof ioCallback) { ioCallback = cb; }
    observe() {} unobserve() {} disconnect() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, kind: string) {
    return kind === '2d' ? ({ clearRect() {}, drawImage() {} } as unknown as CanvasRenderingContext2D) : null;
  } as never);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const SRC = { base: '/chibi', available: new Set(['v2_sd_01ichika_school']), noflip: new Set<string>() };
const target = (): ChibiTarget => {
  const host = document.createElement('span');
  const img = document.createElement('img');
  img.className = 'sd';
  host.append(img);
  document.body.append(host);
  return { host, img, size: 'sm', req: { name: '一歌', face: '', motion: '', mood: null, chibi: 'v2_sd_01ichika_school', side: 'l' } };
};
const tick = () => new Promise(r => setTimeout(r, 80));

test('骨架還在下載時 WebGL 掉了：播放器建立失敗（閱讀器維持靜態圖）', async () => {
  const p = createPlayer(SRC, new Map());
  await Promise.resolve();
  h.canvas!.dispatchEvent(new Event('webglcontextlost'));
  h.binary[0].ok();
  await expect(p).rejects.toThrow(/context lost/);
});

test('掉了之後再加的角色不載入；掉之前已換成動畫的，換回靜態圖', async () => {
  const p = createPlayer(SRC, new Map());
  await Promise.resolve();
  h.binary[0].ok();
  const player = await p;
  const t = target();
  player.attach(t);
  await tick();
  expect(h.atlases).toEqual(['v2_sd_01ichika_school/sekai_atlas.atlas.txt']);
  ioCallback!([{ target: t.host, isIntersecting: true }]);
  await tick();
  expect(t.host.querySelector('canvas.sd')).not.toBeNull();
  expect(t.host.querySelector('img.sd')).toBeNull();

  h.canvas!.dispatchEvent(new Event('webglcontextlost'));
  expect(t.host.querySelector('img.sd')).toBe(t.img);
  expect(t.host.querySelector('canvas')).toBeNull();

  const later = target();
  player.attach({ ...later, req: { ...later.req, chibi: 'v2_sd_01ichika_school' } });
  await tick();
  expect(h.atlases.length).toBe(1);
  expect(later.host.querySelector('img.sd')).toBe(later.img);
});

test('沒有在清單裡的小人不載入', async () => {
  const p = createPlayer(SRC, new Map());
  await Promise.resolve();
  h.binary[0].ok();
  const player = await p;
  const t = target();
  player.attach({ ...t, req: { ...t.req, chibi: 'v2_sd_02saki_school' } });
  await tick();
  expect(h.atlases).toEqual([]);
});
