"""Stands in for scripts/fetch_episode.py in tests: the event id picks the outcome (no env is passed through)."""
import json
import sys

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
