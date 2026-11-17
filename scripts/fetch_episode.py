#!/usr/bin/env python3
"""Fetcher for one event's (or one episode's) assets into assets/raw/ (git-ignored).

Usage: python3 scripts/fetch_episode.py --event <id> | --banners <ids> | --chibis <names> | <sid>
       [--index data/tc-event-index.json] [--out assets/raw]

Constraints (spec 2026-11-04): one event per run, at most 40 requests, >= 5 s between requests, no Referer
header, User-Agent names this project, existing files are never re-fetched. Started only by the hourly
pipeline or by a person; never loop this over many events.
--event prints a JSON result as its last line; exit codes: done 0, jp 3, partial 4, missing 5, error 1.
missing = a script is not on the mirror yet (HTTP 404); the pipeline rechecks it (daily the first week after the event closes, then weekly).
A Japanese first episode (kana ratio > 0.05) reports jp and keeps no script.
A background the mirror lacks (404) is recorded as bg/<id>.missing and the episode is still built.
--event and SID refuse, before any request, an event whose TC close time (`closed` in the index) is missing or
still ahead: the official fan-work guideline bans posting full episodes of an ongoing event (AGENTS.md).
--banners (spec 2026-11-07, owner-approved): the home banner only, at most 4 events, one request each, 5 s apart,
and only events the pipeline state (--state) lists with assets done and no banner record.
--chibis (spec 2026-11-18, owner-approved): Spine chibis, at most 4 sets (atlas + texture, two requests each)
plus the shared skeleton once, 5 s apart, and only names the committed chibi catalogue (--chibi-index) lists
and the pipeline state has no record of.
"""
import argparse
import calendar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

BASE = 'https://storage.sekai.best'
USER_AGENT = 'sekai-reader'
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


def banner_url(bundle):
    return '%s/sekai-tc-assets/home/banner/%s/%s.webp' % (BASE, bundle, bundle)


CHIBI_DIR = 'sekai-jp-assets/area_sd/v2_sd_main'
CHIBI_SKEL = 'v2_sd_main.skel'
CHIBI_ATLAS = 'sekai_atlas.atlas.txt'
CHIBI_TEXTURE = 'sekai_atlas.png'


def chibi_skel_url():
    return '%s/%s/v2_base_model/%s' % (BASE, CHIBI_DIR, CHIBI_SKEL)


def chibi_url(name, file):
    return '%s/%s/%s/%s' % (BASE, CHIBI_DIR, name, file)


def is_closed(event, now):
    """True once the event's TC close time has passed; a missing or unparsable time counts as still running."""
    closed = event.get('closed')
    if not isinstance(closed, str):
        return False
    try:
        return calendar.timegm(time.strptime(closed, '%Y-%m-%dT%H:%M:%SZ')) <= now
    except ValueError:
        return False


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
EXIT = {'done': 0, 'jp': 3, 'partial': 4, 'missing': 5, 'error': 1}


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
        # A background the mirror does not have (404) gets a .missing marker: build_episode draws plain panels
        # there, and the marker keeps later runs from asking again (owner, 2026-11-08). Other errors still raise.
        marker = os.path.join(out, 'bg', bg + '.missing')
        if os.path.exists(marker):
            continue
        try:
            fetcher.get(background_url(bg), os.path.join(out, 'bg', bg + '.webp'))
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            os.makedirs(os.path.dirname(marker), exist_ok=True)
            open(marker, 'w').close()
            fetcher.log('missing background', bg)
    for cid in character_ids(asset, index['chars']):
        fetcher.get(sd_url(cid), os.path.join(out, 'sd', 'chr_sd_%02d_01.webp' % cid))
    return not fetcher.exhausted


def _get_script(fetcher, url, dest):
    """Returns False when the mirror has no such script yet (404), which is not an error for a new event."""
    try:
        fetcher.get(url, dest)
        return True
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        raise


def _sids(event):
    sids = [ep[2] for ep in sorted(event['eps'])]
    for sid in sids:
        if not SID_RE.match(sid):
            raise ValueError('invalid sid: %r' % sid)
    return sids


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _valid_talk(t):
    if not isinstance(t, dict):
        return False
    if not isinstance(t.get('Body', ''), (str, type(None))) or not isinstance(t.get('WindowDisplayName', ''), (str, type(None))):
        return False
    motions = t.get('Motions')
    return motions is None or (isinstance(motions, list) and all(isinstance(m, dict) for m in motions))


def _valid_script(asset):
    """Mirrors the field types src/scenario/parse.ts reads; must yield at least one line."""
    if not isinstance(asset, dict):
        return False
    talk, snippets = asset.get('TalkData'), asset.get('Snippets')
    if not isinstance(talk, list) or not isinstance(snippets, list) or not snippets:
        return False
    if not all(_valid_talk(t) for t in talk) or not all(isinstance(x, dict) for x in snippets):
        return False
    for x in snippets:
        i, action = x.get('ReferenceIndex'), x.get('Action')
        if not (_is_int(i) and _is_int(action)):
            return False
    return any(x['Action'] == 1 and 0 <= x['ReferenceIndex'] < len(talk) and (talk[x['ReferenceIndex']].get('Body') or '').strip()
               for x in snippets)


def _checked_script(fetcher, url, out, sid):
    """Fetch (or reuse) one script and promote it only if it parses and is not Japanese.

    Returns 'ok', 'missing' (404), 'partial' (budget), 'jp' or 'invalid'; nothing rejected stays on disk.
    """
    final = os.path.join(out, sid + '.asset')
    path = final
    if not os.path.exists(final):
        # Staged in .tmp so a rejected script never sits at its final path (or reaches R2).
        path = os.path.join(out, '.tmp', sid + '.asset')
        if not _get_script(fetcher, url, path):
            return 'missing'
        if fetcher.exhausted:
            return 'partial'
    try:
        asset = _load(path)
        verdict = 'invalid' if not _valid_script(asset) else 'jp' if kana_ratio(asset) > JP_KANA_RATIO else 'ok'
    except Exception:  # noqa: BLE001 - anything unclassifiable is treated as an invalid script
        verdict = 'invalid'
    if verdict != 'ok':
        os.remove(path)
    elif path != final:
        os.replace(path, final)
    return verdict


def _purge(out, sids):
    removed = []
    for sid in sids:
        f = os.path.join(out, sid + '.asset')
        if os.path.exists(f):
            os.remove(f)
            removed.append(sid + '.asset')
    return removed


def run_event(event, index, out, fetcher):
    sids = _sids(event)
    start = fetcher.count
    result = lambda status, done: {'status': status, 'requests': fetcher.count - start, 'sids': done}
    existed = {sid for sid in sids if os.path.exists(os.path.join(out, sid + '.asset'))}
    done = []
    for sid in sids:
        v = _checked_script(fetcher, scenario_url(event['bundle'], sid), out, sid)
        if v in ('jp', 'invalid'):
            removed = sorted(set(_purge(out, sids)) | ({sid + '.asset'} if sid in existed else set()))
            r = result('jp' if v == 'jp' else 'error', [])
            if v == 'invalid':
                r['error'] = 'invalid script %s' % sid
            if removed:
                r['removed'] = removed
            return r
        if v != 'ok':
            return result(v, done)
        if not _episode_assets(_load(os.path.join(out, sid + '.asset')), index, out, fetcher):
            return result('partial', done)
        done.append(sid)
    return result('done', done)


BANNER_MAX = 4


def _is_webp(path):
    with open(path, 'rb') as f:
        head = f.read(12)
    return head[:4] == b'RIFF' and head[8:12] == b'WEBP'


def _banner_of(event, out, fetcher):
    bundle = event['bundle']
    if not SID_RE.match(bundle):
        raise ValueError('invalid bundle: %r' % bundle)
    dest = os.path.join(out, 'banner', bundle + '.webp')
    try:
        fetcher.get(banner_url(bundle), dest)
    except urllib.error.HTTPError as e:
        return 'missing' if e.code == 404 else 'error'
    except OSError:
        return 'error'
    if not os.path.exists(dest):
        return 'error'
    if not _is_webp(dest):
        os.remove(dest)
        return 'error'
    return 'done'


def run_banners(events, out, fetcher):
    """Home banners of a few events, one request each; a 404 is reported as missing, not as a failure."""
    if len(events) > BANNER_MAX:
        raise ValueError('at most %d banners per run' % BANNER_MAX)
    start = fetcher.count
    results = [{'id': e['id'], 'status': _banner_of(e, out, fetcher)} for e in events]
    return {'status': 'done', 'requests': fetcher.count - start, 'events': results}


CHIBI_MAX = 4
CHIBI_RE = re.compile(r'^v2_sd_\d{2}[a-z]+_[a-z0-9_]+$')
# The reader's Spine runtime is 4.1; a skeleton exported by another version cannot be loaded.
CHIBI_SKEL_VERSION = b'4.1.'


def _is_skel(path):
    with open(path, 'rb') as f:
        return CHIBI_SKEL_VERSION in f.read(32)


def _is_png(path):
    with open(path, 'rb') as f:
        return f.read(8) == b'\x89PNG\r\n\x1a\n'


def _is_atlas(path):
    """The atlas must name the one texture fetched next to it."""
    try:
        with open(path, encoding='utf-8') as f:
            first = next((line.strip() for line in f if line.strip()), '')
    except UnicodeDecodeError:
        return False
    return first == CHIBI_TEXTURE


def _chibi_file(url, dest, valid, fetcher):
    """done / missing (404) / error; a file that fails its content check is not kept."""
    try:
        fetcher.get(url, dest)
    except urllib.error.HTTPError as e:
        return 'missing' if e.code == 404 else 'error'
    except OSError:
        return 'error'
    if not os.path.exists(dest):
        return 'error'
    if not valid(dest):
        os.remove(dest)
        return 'error'
    return 'done'


def _chibi_of(name, out, fetcher):
    if not CHIBI_RE.match(name):
        raise ValueError('invalid chibi name: %r' % name)
    folder = os.path.join(out, 'chibi', name)
    atlas = os.path.join(folder, CHIBI_ATLAS)
    status = _chibi_file(chibi_url(name, CHIBI_ATLAS), atlas, _is_atlas, fetcher)
    if status != 'done':
        return status
    status = _chibi_file(chibi_url(name, CHIBI_TEXTURE), os.path.join(folder, CHIBI_TEXTURE), _is_png, fetcher)
    if status == 'missing':
        os.remove(atlas)
    return status


def run_chibis(names, out, fetcher, skel=True):
    """The shared skeleton (when `skel`), then a few chibi sets; nothing else is fetched unless the skeleton is there.
    The first error ends the run: the sets after it are not requested and not reported (the lane rests for the day)."""
    if len(names) > CHIBI_MAX or len(set(names)) != len(names):
        raise ValueError('at most %d distinct chibis per run' % CHIBI_MAX)
    start = fetcher.count
    skel_status = None
    if skel:
        skel_status = _chibi_file(chibi_skel_url(), os.path.join(out, 'chibi', CHIBI_SKEL), _is_skel, fetcher)
    results = []
    for n in ([] if skel_status in ('missing', 'error') else names):
        results.append({'name': n, 'status': _chibi_of(n, out, fetcher)})
        if results[-1]['status'] == 'error':
            break
    return {'status': 'done', 'requests': fetcher.count - start, 'skel': skel_status, 'chibis': results}


def run(sid, index, out, fetcher):
    if not SID_RE.match(sid):
        raise ValueError('invalid sid: %r' % sid)
    asset_path = os.path.join(out, sid + '.asset')
    fetcher.get(scenario_url(find_bundle(index, sid), sid), asset_path)
    if fetcher.exhausted:
        return
    _episode_assets(_load(asset_path), index, out, fetcher)


def main(argv=None, opener=None, sleep=time.sleep, log=print, max_requests=40, now=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
                                 usage='%(prog)s (--event ID | --banners ID,ID | --chibis NAME,NAME | SID) [--index PATH] [--out DIR]')
    target = ap.add_mutually_exclusive_group(required=True)
    target.add_argument('sid', nargs='?', metavar='SID', help='fetch one episode (e.g. event_173_02)')
    target.add_argument('--event', type=int, metavar='ID', help='fetch one whole event; prints a JSON result line')
    target.add_argument('--banners', metavar='ID,ID,...',
                        help='home banners of these events (at most %d), one request each, 5 s apart' % BANNER_MAX)
    target.add_argument('--chibis', metavar='NAME,NAME,...',
                        help='Spine chibis (at most %d sets, two requests each) plus the shared skeleton once' % CHIBI_MAX)
    ap.add_argument('--index', default='data/tc-event-index.json')
    ap.add_argument('--chibi-index', default='data/chibi-index.json', help='chibi catalogue; --chibis only')
    ap.add_argument('--state', default='data/pipeline-state.json', help='pipeline state; --banners and --chibis only')
    ap.add_argument('--out', default='assets/raw')
    args = ap.parse_args(argv)
    now = time.time() if now is None else now
    if args.banners is not None:
        return _main_banners(args, opener, sleep, log)
    if args.chibis is not None:
        return _main_chibis(args, opener, sleep, log)
    if args.event is not None:
        return _main_event(args, opener, sleep, log, max_requests, now)
    index = _load(args.index)
    event = next((e for e in index['events'] if any(ep[2] == args.sid for ep in e['eps'])), None)
    if event is not None and not is_closed(event, now):
        print('event %d has not closed on the TC server yet; not fetching %s' % (event['id'], args.sid))
        return 1
    fetcher = Fetcher(opener or urllib.request.urlopen, max_requests=max_requests, sleep=sleep, log=log)
    run(args.sid, index, args.out, fetcher)
    print('requests made:', fetcher.count)
    return EXIT['partial'] if fetcher.exhausted else 0


def _main_event(args, opener, sleep, log, max_requests, now):
    fetcher = Fetcher(opener or urllib.request.urlopen, max_requests=max_requests, sleep=sleep, log=log)
    try:
        index = _load(args.index)
        event = next(e for e in index['events'] if e['id'] == args.event)
        if not is_closed(event, now):
            raise ValueError('event %d has not closed on the TC server yet' % event['id'])
        r = run_event(event, index, args.out, fetcher)
    except Exception as e:  # noqa: BLE001 - reported to the pipeline as a JSON line
        print(json.dumps({'status': 'error', 'requests': fetcher.count, 'sids': [], 'error': '%s: %s' % (type(e).__name__, e)}))
        return 1
    print(json.dumps(r))
    return EXIT[r['status']]


def _main_banners(args, opener, sleep, log):
    fetcher = Fetcher(opener or urllib.request.urlopen, max_requests=BANNER_MAX, sleep=sleep, log=log)
    try:
        if not re.match(r'^\d{1,5}(,\d{1,5})*$', args.banners):
            raise ValueError('bad id list')
        index = _load(args.index)
        by_id = {e['id']: e for e in index['events']}
        events = [by_id[int(x)] for x in args.banners.split(',')]
        state = _load(args.state)['events']
        for e in events:
            st = state.get(str(e['id'])) or {}
            if st.get('assets') != 'done' or st.get('banner'):
                raise ValueError('event %d is not due for a banner' % e['id'])
        r = run_banners(events, args.out, fetcher)
    except Exception as e:  # noqa: BLE001 - reported to the pipeline as a JSON line
        print(json.dumps({'status': 'error', 'requests': fetcher.count, 'events': [], 'error': '%s: %s' % (type(e).__name__, e)}))
        return 1
    print(json.dumps(r))
    return 0


def _main_chibis(args, opener, sleep, log):
    # One skeleton plus two files per set.
    fetcher = Fetcher(opener or urllib.request.urlopen, max_requests=1 + 2 * CHIBI_MAX, sleep=sleep, log=log)
    try:
        names = args.chibis.split(',') if args.chibis else []
        if len(names) > CHIBI_MAX or len(set(names)) != len(names) or not all(CHIBI_RE.match(n) for n in names):
            raise ValueError('bad chibi list')
        listed = set(_load(args.chibi_index)['chibis'])
        state = _load(args.state)
        recorded = state.get('chibi') or {}
        skel = state.get('chibiSkel')
        if skel == 'missing' or state.get('chibiHalted'):
            raise ValueError('the chibi lane is stopped (skeleton missing or lane halted)')
        for n in names:
            if n not in listed or n in recorded:
                raise ValueError('chibi %s is not due' % n)
        r = run_chibis(names, args.out, fetcher, skel=skel != 'done')
    except Exception as e:  # noqa: BLE001 - reported to the pipeline as a JSON line
        print(json.dumps({'status': 'error', 'requests': fetcher.count, 'skel': None, 'chibis': [], 'error': '%s: %s' % (type(e).__name__, e)}))
        return 1
    print(json.dumps(r))
    return 0


if __name__ == '__main__':
    sys.exit(main())
