import { beforeEach, expect, test } from 'vitest';
import { CURTAIN_KEY, playCurtainOnce } from '../src/app/curtain';

const mount = () => {
  document.body.innerHTML = '<div class="curtain" data-curtain aria-hidden="true"></div>';
  return document.querySelector('[data-curtain]') as HTMLElement;
};
beforeEach(() => { sessionStorage.clear(); delete (window as any).__curtainShown; });

test('本 session 第一次載入時播放簾幕並記錄', () => {
  const el = mount();
  playCurtainOnce(document, sessionStorage);
  expect(el.hasAttribute('data-play')).toBe(true);
  expect(sessionStorage.getItem(CURTAIN_KEY)).not.toBeNull();
});
test('同一個 session 再載入時直接移除簾幕，不播放', () => {
  sessionStorage.setItem(CURTAIN_KEY, '1');
  mount();
  playCurtainOnce(document, sessionStorage);
  expect(document.querySelector('[data-curtain]')).toBeNull();
});
test('storage 被封鎖時改用 window 旗標，同一頁不重播', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } as unknown as Storage;
  mount();
  playCurtainOnce(document, blocked);
  expect(document.querySelector('[data-curtain]')!.hasAttribute('data-play')).toBe(true);
  mount();
  playCurtainOnce(document, blocked);
  expect(document.querySelector('[data-curtain]')).toBeNull();
});
test('動畫結束後把簾幕從 DOM 拿掉', () => {
  const el = mount();
  playCurtainOnce(document, sessionStorage);
  el.dispatchEvent(new Event('animationend'));
  expect(document.querySelector('[data-curtain]')).toBeNull();
});
test('沒有簾幕元素時不丟例外', () => {
  document.body.innerHTML = '';
  expect(() => playCurtainOnce(document, sessionStorage)).not.toThrow();
});
