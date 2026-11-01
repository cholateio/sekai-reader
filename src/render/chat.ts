import { inkFor, resolveCharacter, SIDE_COLOR } from '../data/characters';
import { moodOf } from '../scenario/mood';
import { isThought } from '../scenario/text';
import type { Episode, Scene } from '../scenario/types';
import { h } from './dom';
import './chat.css';

const keyOf = (name: string) => String(resolveCharacter(name)?.id ?? name);

export function renderChat(ep: Episode): HTMLElement {
  const story = h('div', { class: 'story' });
  let prev: string | null = null;
  let flashBox: HTMLElement | null = null;
  let si = 0;
  const sceneCard = (s: Scene) =>
    h('div', { class: 'scene' + (s.sekai ? ' sekai' : '') }, h('b', {}, s.text), s.time ? h('small', {}, s.time) : null);
  const flushScenes = (upTo: number) => {
    while (si < ep.scenes.length && ep.scenes[si].before <= upTo) {
      story.append(sceneCard(ep.scenes[si++]));
      prev = null;
      flashBox = null;
    }
  };

  ep.lines.forEach((line, idx) => {
    flushScenes(idx);
    let target: HTMLElement = story;
    if (line.flash) {
      if (!flashBox) {
        flashBox = h('div', { class: 'flash' }, h('span', { class: 'tag' }, '回憶'));
        story.append(flashBox);
        prev = null;
      }
      target = flashBox;
    } else if (flashBox) { flashBox = null; prev = null; }

    if (!line.who) {
      target.append(h('p', { class: 'narr', 'data-r': line.r }, line.body));
      prev = null;
      return;
    }
    const color = resolveCharacter(line.who)?.color ?? SIDE_COLOR;
    const mood = moodOf(line.face);
    const cont = prev === keyOf(line.who);
    target.append(h('div', { class: 'msg' + (cont ? ' cont' : '') + (line.shake ? ' shake' : '') + (line.phone ? ' phone' : '') },
      h('span', { class: 'av', 'aria-hidden': 'true', style: `background:${color};color:${inkFor(color)}` }, [...line.who][0]),
      h('span', { class: 'who' }, h('b', {}, line.who), line.phone ? h('span', {}, '傳來訊息') : null,
        !line.phone && mood ? h('span', { class: 'mood' }, mood) : null),
      h('div', { class: 'bubble' + (isThought(line.body) ? ' thought' : '') + (line.phone ? ' phone' : ''), 'data-r': line.r }, line.body)));
    prev = keyOf(line.who);
  });
  flushScenes(Infinity);
  return story;
}
