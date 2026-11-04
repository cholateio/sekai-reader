"""Stands in for scripts/fetch_episode.py in tests: the event id picks the outcome (no env is passed through)."""
import json
import sys

eid = int(sys.argv[sys.argv.index('--event') + 1])
print('fetched https://example.test/x 10 bytes')
if eid == 1:
    print('Traceback: boom')
    sys.exit(1)
status, code = {3: ('jp', 3), 4: ('partial', 4)}.get(eid, ('done', 0))
print(json.dumps({'status': status, 'requests': 7, 'sids': [] if status == 'jp' else ['event_%d_01' % eid]}))
sys.exit(code)
