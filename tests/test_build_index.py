import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import build_index as bi  # noqa: E402

DAY = 86400 * 1000
NOW = 100 * DAY


def ev(i, start):
    return {'id': i, 'name': 'E%d' % i, 'unit': 'light_sound', 'eventType': 'marathon', 'startAt': start}


def story(i):
    return {'eventId': i, 'assetbundleName': 'event_%d' % i, 'bannerGameCharacterUnitId': 1,
            'eventStoryEpisodes': [{'episodeNo': 2, 'title': 'b', 'scenarioId': 'event_%d_02' % i},
                                   {'episodeNo': 1, 'title': 'a', 'scenarioId': 'event_%d_01' % i}]}


EVENTS = {9: ev(9, 10 * DAY), 12: ev(12, 50 * DAY), 20: ev(20, 200 * DAY)}
STORIES = [story(9), story(12), story(20)]
UNITS = [{'id': 1, 'gameCharacterId': 1, 'unit': 'light_sound', 'colorCode': '#33aaee'}]


class BuildRowsTest(unittest.TestCase):
    def test_build_rows_sorts_newest_first_and_skips_future(self):
        rows = bi.build_rows(EVENTS, STORIES, UNITS, now_ms=NOW, jp_ids=set())
        self.assertEqual([r['id'] for r in rows], [12, 9])
        self.assertEqual(rows[0]['eps'], [[1, 'a', 'event_12_01'], [2, 'b', 'event_12_02']])
        self.assertEqual(rows[0]['color'], '#33aaee')
        self.assertFalse(any(r['jp'] for r in rows))

    def test_jp_flag_comes_from_state(self):
        self.assertEqual(bi.jp_ids_from_state({'events': {'181': {'assets': 'jp'}, '173': {'assets': 'done'}}}), {181})
        self.assertEqual(bi.jp_ids_from_state(None), set())
        rows = bi.build_rows(EVENTS, STORIES, UNITS, now_ms=NOW, jp_ids={12})
        self.assertTrue(next(r for r in rows if r['id'] == 12)['jp'])
        self.assertFalse(next(r for r in rows if r['id'] == 9)['jp'])

    def test_no_hard_coded_jp_boundary(self):
        self.assertFalse(hasattr(bi, 'JP_TEXT_FROM'))


if __name__ == '__main__':
    unittest.main()
