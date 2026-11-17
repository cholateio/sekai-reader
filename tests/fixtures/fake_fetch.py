"""Stands in for scripts/fetch_episode.py in tests: the event id picks the outcome (no env is passed through)."""
import json
import sys

if '--banners' in sys.argv:
    ids = [int(x) for x in sys.argv[sys.argv.index('--banners') + 1].split(',')]
    print(json.dumps({'status': 'done', 'requests': len(ids), 'events': [{'id': i, 'status': 'done'} for i in ids]}))
    sys.exit(0)
if '--chibis' in sys.argv:
    names = [n for n in sys.argv[sys.argv.index('--chibis') + 1].split(',') if n]
    with open(sys.argv[sys.argv.index('--chibi-index') + 1], encoding='utf-8') as f:
        listed = json.load(f)['chibis']
    if any(n not in listed for n in names):
        print(json.dumps({'status': 'error', 'requests': 0, 'skel': None, 'chibis': [], 'error': 'ValueError: not due'}))
        sys.exit(1)
    chibis = [{'name': n, 'status': 'done'} for n in names]
    if any('liar' in n for n in names):
        chibis.append({'name': 'v2_sd_26kaito_school', 'status': 'done'})
    print(json.dumps({'status': 'done', 'requests': 1 + 2 * len(names), 'skel': 'done', 'chibis': chibis}))
    sys.exit(1 if any('crash' in n for n in names) else 0)
eid = int(sys.argv[sys.argv.index('--event') + 1])
print('fetched https://example.test/x 10 bytes')
if eid == 1:
    print(json.dumps({'status': 'error', 'requests': 1, 'sids': [], 'error': 'HTTPError: HTTP Error 500: boom'}))
    sys.exit(1)
if eid == 2:
    print('Traceback: boom')
    sys.exit(1)
status, code = {3: ('jp', 3), 4: ('partial', 4), 5: ('missing', 5)}.get(eid, ('done', 0))
print(json.dumps({'status': status, 'requests': 7, 'sids': [] if status in ('jp', 'missing') else ['event_%d_01' % eid]}))
sys.exit(code)
