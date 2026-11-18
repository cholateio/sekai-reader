import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import build_index as bi  # noqa: E402

DAY = 86400 * 1000
NOW = 100 * DAY


def ev(i, start):
    return {'id': i, 'name': 'E%d' % i, 'unit': 'light_sound', 'eventType': 'marathon', 'startAt': start, 'closedAt': start + 9 * DAY}


def story(i):
    return {'eventId': i, 'assetbundleName': 'event_%d' % i, 'bannerGameCharacterUnitId': 1,
            'eventStoryEpisodes': [{'episodeNo': 2, 'title': 'b', 'scenarioId': 'event_%d_02' % i},
                                   {'episodeNo': 1, 'title': 'a', 'scenarioId': 'event_%d_01' % i}]}


EVENTS = {9: ev(9, 10 * DAY), 12: ev(12, 50 * DAY), 20: ev(20, 200 * DAY)}
STORIES = [story(9), story(12), story(20)]
UNITS = [{'id': 1, 'gameCharacterId': 1, 'unit': 'light_sound', 'colorCode': '#33aaee'}]


class BuildRowsTest(unittest.TestCase):
    def test_build_rows_sorts_newest_first_and_skips_future(self):
        rows = bi.build_rows(EVENTS, STORIES, UNITS, now_ms=NOW, jp_ids=set(), event_chars={})
        self.assertEqual([r['id'] for r in rows], [12, 9])
        self.assertEqual(rows[0]['eps'], [[1, 'a', 'event_12_01'], [2, 'b', 'event_12_02']])
        self.assertEqual(rows[0]['color'], '#33aaee')
        self.assertFalse(any(r['jp'] for r in rows))

    def test_rows_carry_close_time_or_none(self):
        rows = bi.build_rows(EVENTS, STORIES, UNITS, now_ms=NOW, jp_ids=set(), event_chars={})
        self.assertEqual(rows[0]['closed'], '1970-03-01T00:00:00Z')
        no_close = {**EVENTS, 12: {k: v for k, v in EVENTS[12].items() if k != 'closedAt'}}
        rows = bi.build_rows(no_close, STORIES, UNITS, now_ms=NOW, jp_ids=set(), event_chars={})
        self.assertIsNone(rows[0]['closed'])

    def test_jp_flag_comes_from_state(self):
        self.assertEqual(bi.jp_ids_from_state({'events': {'181': {'assets': 'jp'}, '173': {'assets': 'done'}}}), {181})
        self.assertEqual(bi.jp_ids_from_state(None), set())
        rows = bi.build_rows(EVENTS, STORIES, UNITS, now_ms=NOW, jp_ids={12}, event_chars={})
        self.assertTrue(next(r for r in rows if r['id'] == 12)['jp'])
        self.assertFalse(next(r for r in rows if r['id'] == 9)['jp'])

    def test_event_chars_dedupes_in_card_order(self):
        cards = [{'id': 1, 'characterId': 3}, {'id': 2, 'characterId': 1}, {'id': 3, 'characterId': 3}, {'id': 9, 'characterId': 7}]
        ec = [{'eventId': 9, 'cardId': 1}, {'eventId': 9, 'cardId': 2}, {'eventId': 9, 'cardId': 3},
              {'eventId': 9, 'cardId': 404}, {'eventId': 12, 'cardId': 9}]
        self.assertEqual(bi.event_chars(ec, cards), {9: [3, 1], 12: [7]})

    def test_build_rows_carries_chars_and_defaults_empty(self):
        rows = bi.build_rows(EVENTS, STORIES, UNITS, now_ms=NOW, jp_ids=set(), event_chars={9: [3, 1]})
        self.assertEqual([r['chars'] for r in rows], [[], [3, 1]])

    def test_unit_none_is_derived_from_cards(self):
        # Master data tags events[].unit only from #37 (2022-10) on; earlier box events are "none" there.
        chars = [{'id': 1, 'unit': 'light_sound'}, {'id': 2, 'unit': 'light_sound'}, {'id': 5, 'unit': 'idol'},
                 {'id': 21, 'unit': 'piapro'}]
        # Once the master data starts tagging (#14 here), "none" is the game's own mixed value: #15 stays none.
        events = {9: dict(ev(9, 10 * DAY), unit='none'), 12: dict(ev(12, 50 * DAY), unit='none'),
                  13: dict(ev(13, 60 * DAY), unit='none'), 14: dict(ev(14, 70 * DAY), unit='theme_park'),
                  15: dict(ev(15, 80 * DAY), unit='none')}
        stories = [story(9), story(12), story(13), story(14), story(15)]
        ec = {9: [2, 21, 1], 12: [1, 5, 21], 13: [21], 14: [1, 2], 15: [1, 2, 21]}
        rows = {r['id']: r['unit'] for r in bi.build_rows(events, stories, UNITS, now_ms=NOW, jp_ids=set(), event_chars=ec, chars=chars)}
        self.assertEqual(rows, {9: 'light_sound', 12: 'none', 13: 'none', 14: 'theme_park', 15: 'none'})
        self.assertEqual(bi.first_tagged_event(events), 14)
        self.assertEqual(bi.first_tagged_event({9: events[9]}), 0)

    def test_no_hard_coded_jp_boundary(self):
        self.assertFalse(hasattr(bi, 'JP_TEXT_FROM'))


class BuildChibiTest(unittest.TestCase):
    C2D = [{'id': 1, 'characterType': 'game_character', 'characterId': 1},
           {'id': 2, 'characterType': 'game_character', 'characterId': 21},
           {'id': 3, 'characterType': 'sub_game_character', 'characterId': 15},
           {'id': 4, 'characterType': 'mob', 'characterId': 900}]

    def row(self, c2d, live, spine):
        return {'character2dId': c2d, 'live2dAssetbundleName': live, 'spineAssetbundleName': spine}

    def test_only_game_characters_v2_chibis(self):
        r = bi.build_chibi([
            self.row(1, 'v2_01ichika_school01', 'v2_sd_01ichika_school'),
            self.row(1, 'v2_01ichika_school02', 'v2_sd_01ichika_school'),
            self.row(1, 'v2_01ichika_casual', 'v2_sd_01ichika_casual'),
            self.row(1, '01ichika_normal', 'sd_01ichika_normal'),        # old family: another skeleton
            self.row(1, 'v2_01ichika_x', None),
            self.row(1, None, 'v2_sd_01ichika_kakizome'),                # seasonal set without a costume name
            self.row(2, 'v2_21miku_street', 'v2_sd_21miku_street'),
            self.row(2, 'v2_21miku_odd', 'v2_sd_22rin_street'),          # number does not match the character
            self.row(3, 'v2_15nene_casual', 'v2_sd_15nene_casual'),      # not a game_character row
            self.row(4, 'mob', 'v2_sd_staff001'),
            self.row(2, 'clb', 'v2_sd_kitty'),
            self.row(1, 'bad', 'v2_sd_01ichika_../x'),
        ], self.C2D)
        self.assertEqual(r['chibis'], ['v2_sd_01ichika_casual', 'v2_sd_01ichika_kakizome', 'v2_sd_01ichika_school', 'v2_sd_21miku_street'])
        self.assertEqual(r['costumes'], {'v2_01ichika_casual': 'v2_sd_01ichika_casual', 'v2_01ichika_school01': 'v2_sd_01ichika_school',
                                         'v2_01ichika_school02': 'v2_sd_01ichika_school', 'v2_21miku_street': 'v2_sd_21miku_street'})
        self.assertEqual(r['default'], {'1': 'v2_sd_01ichika_school', '21': 'v2_sd_21miku_street'})
        self.assertEqual(r['chars'], {'1': 1, '2': 21})

    def test_lacking_lists_characters_without_a_chibi(self):
        full = {'default': {str(c): f'v2_sd_{c:02d}x_school' for c in range(1, 27)}}
        self.assertEqual(bi.chibi_lacking(full), [])
        del full['default']['17']
        self.assertEqual(bi.chibi_lacking(full), [17])
        self.assertEqual(bi.chibi_lacking({'default': {'1': 'v2_sd_01ichika_school'}}), list(range(2, 27)))

    def test_lost_lists_dropped_entries_only(self):
        old = {'chibis': ['a', 'b'], 'costumes': {'x': 'a', 'y': 'b'}, 'chars': {'1': 1, '2': 2}, 'default': {'1': 'a'}}
        grown = {'chibis': ['a', 'b', 'c'], 'costumes': {'x': 'a', 'y': 'b', 'z': 'c'}, 'chars': {'1': 1, '2': 2, '3': 3}}
        self.assertEqual(bi.chibi_lost(old, grown), [])
        self.assertEqual(bi.chibi_lost(None, grown), [])
        self.assertEqual(bi.chibi_lost(old, {'chibis': ['a'], 'costumes': {'x': 'a'}, 'chars': {'1': 1}}),
                         ['chibis:b', 'costumes:y', 'chars:2'])
        # Same keys, other values: a remap counts as a loss too.
        self.assertEqual(bi.chibi_lost(old, dict(grown, costumes={'x': 'b', 'y': 'b'}, chars={'1': 1, '2': 5})),
                         ['costumes:x', 'chars:2'])

    def test_main_keeps_catalogue_that_would_shrink_or_lack_characters(self):
        import tempfile
        from unittest import mock
        full = [{'id': c, 'characterType': 'game_character', 'characterId': c} for c in range(1, 27)]
        rows = [self.row(c, f'v2_{c:02d}c_school01', f'v2_sd_{c:02d}c_school') for c in range(1, 27)]
        extra = self.row(1, 'v2_01c_casual', 'v2_sd_01c_casual')
        tables = {'events': [], 'eventStories': [], 'gameCharacters': [], 'gameCharacterUnits': [], 'eventCards': [], 'cards': []}
        with tempfile.TemporaryDirectory() as d:
            cat = os.path.join(d, 'chibi.json')
            def run(costumes, c2d):
                data = dict(tables, costume2ds=costumes, character2ds=c2d)
                with mock.patch.object(bi, 'get', side_effect=lambda t: data[t]), mock.patch('builtins.print'):
                    bi.main([os.path.join(d, 'index.json'), '--state', os.path.join(d, 'none.json'), '--chibi', cat])
                with open(cat, 'rb') as f:
                    return f.read()
            first = run(rows + [extra], full)
            self.assertIn(b'v2_sd_01c_casual', first)
            self.assertEqual(run(rows, full), first)                      # one costume gone: kept byte for byte
            self.assertEqual(run(rows[:25] + [extra], full[:25]), first)  # a character gone: kept
            remapped = [extra] + [self.row(c, f'v2_{c:02d}c_school01', 'v2_sd_01c_casual' if c == 1 else f'v2_sd_{c:02d}c_school')
                                  for c in range(1, 27)] + [self.row(1, 'v2_01c_spare', 'v2_sd_01c_school')]
            self.assertEqual(run(remapped, full), first)                  # same keys, a costume remapped: kept
            grown = run(rows + [extra, self.row(2, 'v2_02c_casual', 'v2_sd_02c_casual')], full)
            self.assertIn(b'v2_sd_02c_casual', grown)                     # growth is written

    def test_default_prefers_school_then_casual(self):
        r = bi.build_chibi([self.row(1, 'a', 'v2_sd_01ichika_band'), self.row(1, 'b', 'v2_sd_01ichika_casual')], self.C2D)
        self.assertEqual(r['default'], {'1': 'v2_sd_01ichika_casual'})


if __name__ == '__main__':
    unittest.main()
