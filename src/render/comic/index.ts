import type { CharacterArt } from '../../art/CharacterArt';
import type { Episode } from '../../scenario/types';
import type { Storyboard } from '../../storyboard/types';
import { h } from '../dom';
import { speakerSide } from './bubbles';
import { buildPanel, type PanelCtx } from './panels';
import './comic.css';

export interface ComicOptions { bgUrl: (id: string) => string | null }

export function renderComic(ep: Episode, board: Storyboard, art: CharacterArt, opts: ComicOptions): HTMLElement {
  const out = h('div', { class: 'comic' },
    h('div', { class: 'credit' },
      h('span', {}, board.meta.director === 'ai' ? 'AI 導演分鏡' : '自動分鏡（規則產生）'),
      h('span', {}, `${board.panels.length} 格`)));
  const ctx: PanelCtx = {
    ep, art, lines: new Map(ep.lines.map(l => [l.r, l])), sides: speakerSide(),
    decorate: () => {},
  };
  let rows = 0;
  let afterTrans = false;
  for (const p of board.panels) {
    if (p.t === 'trans') ctx.sides.reset();
    const sceneStart = p.t === 'est' && rows > 0 && !afterTrans;
    if (sceneStart) ctx.sides.reset();
    const el = buildPanel(p, ctx);
    if (sceneStart) el.classList.add('scene-start');
    out.append(el);
    rows++;
    afterTrans = p.t === 'trans';
  }
  void opts;
  return out;
}
