#!/usr/bin/env python3
"""Fetcher for one event's (or one episode's) assets into assets/raw/ (git-ignored).

Usage: python3 scripts/fetch_episode.py --event <id> | <sid> [--index data/tc-event-index.json] [--out assets/raw]

Constraints (spec 2026-11-04): one event per run, at most 40 requests, >= 5 s between requests, no Referer
header, User-Agent names this project, existing files are never re-fetched. Started only by the hourly
pipeline or by a person; never loop this over many events.
--event prints a JSON result as its last line; exit codes: done 0, jp 3, partial 4, error 1.
A Japanese first episode (kana ratio > 0.05) reports jp and keeps no script.
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
    def __init__(self, opener, max_requests=40, delay=5.0, sleep=time.sleep, log=print):
        self.opener = opener
        self.exhausted = False
        self.max_requests = max_requests
        self.delay = delay
        self.sleep = sleep
        self.log = log
        self.count = 0

    def get(self, url, dest):
        if os.path.exists(dest):
            return False
        if self.count >= self.max_requests:
            self.exhausted = True
            return False
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


JP_KANA_RATIO = 0.05
EXIT = {'done': 0, 'jp': 3, 'partial': 4}


def kana_ratio(asset):
    kana = han = 0
    for t in asset.get('TalkData') or []:
        for ch in t.get('Body') or '':
            if '\u3040' <= ch <= '\u30ff':
                kana += 1
            elif '\u4e00' <= ch <= '\u9fff':
                han += 1
    return kana / (kana + han) if kana + han else 0.0


def _load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def _episode_assets(asset, index, out, fetcher):
    for bg in backgrounds(asset):
        fetcher.get(background_url(bg), os.path.join(out, 'bg', bg + '.webp'))
    for cid in character_ids(asset, index['chars']):
        fetcher.get(sd_url(cid), os.path.join(out, 'sd', 'chr_sd_%02d_01.webp' % cid))
    return not fetcher.exhausted


def run_event(event, index, out, fetcher):
    sids = [ep[2] for ep in sorted(event['eps'])]
    for sid in sids:
        if not SID_RE.match(sid):
            raise ValueError('invalid sid: %r' % sid)
    start = fetcher.count
    result = lambda status, done: {'status': status, 'requests': fetcher.count - start, 'sids': done}
    first = os.path.join(out, sids[0] + '.asset')
    # The first script lands in .tmp so a Japanese (not yet translated) event never leaves a file behind;
    # an existing first script (e.g. from <sid> mode) is classified too and removed if Japanese.
    probe = first if os.path.exists(first) else os.path.join(out, '.tmp', sids[0] + '.asset')
    if probe != first:
        fetcher.get(scenario_url(event['bundle'], sids[0]), probe)
        if fetcher.exhausted:
            return result('partial', [])
    if kana_ratio(_load(probe)) > JP_KANA_RATIO:
        os.remove(probe)
        r = result('jp', [])
        if probe == first:
            r['removed'] = [sids[0] + '.asset']
        return r
    if probe != first:
        os.replace(probe, first)
    done = []
    for sid in sids:
        path = os.path.join(out, sid + '.asset')
        fetcher.get(scenario_url(event['bundle'], sid), path)
        if fetcher.exhausted or not _episode_assets(_load(path), index, out, fetcher):
            return result('partial', done)
        done.append(sid)
    return result('done', done)


def run(sid, index, out, fetcher):
    if not SID_RE.match(sid):
        raise ValueError('invalid sid: %r' % sid)
    asset_path = os.path.join(out, sid + '.asset')
    fetcher.get(scenario_url(find_bundle(index, sid), sid), asset_path)
    if fetcher.exhausted:
        return
    _episode_assets(_load(asset_path), index, out, fetcher)


def main(argv=None, opener=None, sleep=time.sleep, log=print, max_requests=40):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
                                 usage='%(prog)s (--event ID | SID) [--index PATH] [--out DIR]')
    target = ap.add_mutually_exclusive_group(required=True)
    target.add_argument('sid', nargs='?', metavar='SID', help='fetch one episode (e.g. event_173_02)')
    target.add_argument('--event', type=int, metavar='ID', help='fetch one whole event; prints a JSON result line')
    ap.add_argument('--index', default='data/tc-event-index.json')
    ap.add_argument('--out', default='assets/raw')
    args = ap.parse_args(argv)
    if args.event is not None:
        return _main_event(args, opener, sleep, log, max_requests)
    index = _load(args.index)
    fetcher = Fetcher(opener or urllib.request.urlopen, max_requests=max_requests, sleep=sleep, log=log)
    run(args.sid, index, args.out, fetcher)
    print('requests made:', fetcher.count)
    return EXIT['partial'] if fetcher.exhausted else 0


def _main_event(args, opener, sleep, log, max_requests):
    fetcher = Fetcher(opener or urllib.request.urlopen, max_requests=max_requests, sleep=sleep, log=log)
    try:
        index = _load(args.index)
        event = next(e for e in index['events'] if e['id'] == args.event)
        r = run_event(event, index, args.out, fetcher)
    except Exception as e:  # noqa: BLE001 - reported to the pipeline as a JSON line
        print(json.dumps({'status': 'error', 'requests': fetcher.count, 'sids': [], 'error': '%s: %s' % (type(e).__name__, e)}))
        return 1
    print(json.dumps(r))
    return EXIT[r['status']]


if __name__ == '__main__':
    sys.exit(main())
