import { expect, test } from 'vitest';
import type { Manifest } from '../src/app/load';
import { viewEvent } from '../src/app/views/event';
import { viewLibrary } from '../src/app/views/library';

const emptyManifest = { episodes: [], bg: [], sd: [] } as unknown as Manifest;

test('library 與 event 頁都有頁尾，文字固定且不含信箱與 sekai.best', () => {
  for (const els of [viewLibrary(emptyManifest), viewEvent(173, emptyManifest)]) {
    const f = els.find(e => e.classList.contains('site-footer'))!;
    expect(f).toBeDefined();
    expect(f.textContent).toBe('本站為非官方粉絲專案，遊戲內容著作權屬 SEGA、Colorful Palette、Crypton。權利人如有疑慮，請透過 GitHub issue 聯絡。');
    expect(f.textContent).not.toMatch(/@|sekai\.best/);
    const a = f.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://github.com/cholateio/sekai-reader/issues');
    expect(a.textContent).toBe('GitHub issue');
    expect(els.at(-1)).toBe(f);
  }
});
