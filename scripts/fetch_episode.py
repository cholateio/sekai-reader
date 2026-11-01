#!/usr/bin/env python3
"""One-off fetcher for a single episode's assets into assets/raw/ (git-ignored).

Usage: python3 scripts/fetch_episode.py <sid> [--index data/tc-event-index.json] [--out assets/raw]

Constraints (spec 2026-11-01): at most 20 requests per run, >= 1 s between requests, no Referer header,
User-Agent names this project, existing files are never re-fetched. Never loop this over many episodes.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request

BASE = 'https://storage.sekai.best'
USER_AGENT = 'sekai-reader (https://github.com/cholateio/sekai-reader)'
SID_RE = re.compile(r'^[a-z0-9_]+$')
EFFECT_CHANGE_BACKGROUND = 7
PHONE_SUFFIX = '的訊息'


class Fetcher:
    def __init__(self, opener, max_requests=20, delay=1.0, sleep=time.sleep, log=print):
        self.opener = opener
        self.max_requests = max_requests
        self.delay = delay
        self.sleep = sleep
        self.log = log
        self.count = 0

    def get(self, url, dest):
        if os.path.exists(dest):
            return False
        if self.count >= self.max_requests:
            raise RuntimeError('request budget exceeded')
        if self.count:
            self.sleep(self.delay)
        self.count += 1
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        with self.opener(req, timeout=30) as res:
            body = res.read()
        os.makedirs(os.path.dirname(dest) or '.', exist_ok=True)
        tmp = dest + '.part'
        with open(tmp, 'wb') as f:
            f.write(body)
        os.replace(tmp, dest)
        self.log('fetched', url, len(body), 'bytes')
        return True


def scenario_url(bundle, sid):
    return '%s/sekai-tc-assets/event_story/%s/scenario/%s.asset' % (BASE, bundle, sid)


def background_url(bg):
    return '%s/sekai-jp-assets/scenario/background/%s/%s.webp' % (BASE, bg, bg)


def sd_url(char_id):
    return '%s/sekai-jp-assets/bonds_honor/character/chr_sd_%02d_01.webp' % (BASE, char_id)


def find_bundle(index, sid):
    for ev in index['events']:
        if any(ep[2] == sid for ep in ev['eps']):
            return ev['bundle']
    raise KeyError(sid)


def backgrounds(asset):
    seen = []
    ids = [asset.get('FirstBackground')] + [
        e.get('StringVal') for e in asset.get('SpecialEffectData') or [] if e.get('EffectType') == EFFECT_CHANGE_BACKGROUND]
    for bg in ids:
        bg = (bg or '').strip()
        if bg and SID_RE.match(bg) and bg not in seen:
            seen.append(bg)
    return seen


def character_ids(asset, chars):
    by_name = {}
    for c in chars:
        by_name[c['given']] = c['id']
        if c.get('first'):
            by_name[c['first'] + c['given']] = c['id']
    ids = []
    for t in asset.get('TalkData') or []:
        name = (t.get('WindowDisplayName') or '').strip()
        if name.endswith(PHONE_SUFFIX):
            name = name[:-len(PHONE_SUFFIX)]
        cid = by_name.get(name)
        if cid is not None and cid not in ids:
            ids.append(cid)
    return sorted(ids)


def run(sid, index, out, fetcher):
    if not SID_RE.match(sid):
        raise ValueError('invalid sid: %r' % sid)
    asset_path = os.path.join(out, sid + '.asset')
    fetcher.get(scenario_url(find_bundle(index, sid), sid), asset_path)
    with open(asset_path, encoding='utf-8') as f:
        asset = json.load(f)
    for bg in backgrounds(asset):
        fetcher.get(background_url(bg), os.path.join(out, 'bg', bg + '.webp'))
    for cid in character_ids(asset, index['chars']):
        fetcher.get(sd_url(cid), os.path.join(out, 'sd', 'chr_sd_%02d_01.webp' % cid))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('sid')
    ap.add_argument('--index', default='data/tc-event-index.json')
    ap.add_argument('--out', default='assets/raw')
    args = ap.parse_args(argv)
    with open(args.index, encoding='utf-8') as f:
        index = json.load(f)
    fetcher = Fetcher(urllib.request.urlopen)
    run(args.sid, index, args.out, fetcher)
    print('requests made:', fetcher.count)
    return 0


if __name__ == '__main__':
    sys.exit(main())
