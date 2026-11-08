import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import fetch_episode as fe  # noqa: E402


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeOpener:
    def __init__(self, bodies=None, missing=()):
        self.requests = []
        self.bodies = bodies or {}
        self.missing = set(missing)

    def __call__(self, req, timeout=None):
        self.requests.append(req)
        if req.full_url in self.missing:
            import urllib.error
            raise urllib.error.HTTPError(req.full_url, 404, 'Not Found', {}, None)
        return FakeResponse(self.bodies.get(req.full_url, b'x'))


class FetcherTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = self.tmp.name
        self.sleeps = []

    def tearDown(self):
        self.tmp.cleanup()

    def fetcher(self, opener, **kw):
        return fe.Fetcher(opener, sleep=self.sleeps.append, log=lambda *a: None, **kw)

    def test_existing_file_is_not_requested(self):
        dest = os.path.join(self.dir, 'a.webp')
        open(dest, 'wb').close()
        opener = FakeOpener()
        self.assertFalse(self.fetcher(opener).get('https://example.test/a.webp', dest))
        self.assertEqual(opener.requests, [])

    def test_download_writes_file(self):
        opener = FakeOpener({'https://example.test/a': b'data'})
        dest = os.path.join(self.dir, 'sub', 'a')
        self.assertTrue(self.fetcher(opener).get('https://example.test/a', dest))
        with open(dest, 'rb') as f:
            self.assertEqual(f.read(), b'data')

    def test_budget_of_40_then_exhausted_without_raise(self):
        f = self.fetcher(FakeOpener())
        for i in range(40):
            self.assertTrue(f.get('https://example.test/%d' % i, os.path.join(self.dir, str(i))))
        self.assertFalse(f.exhausted)
        self.assertFalse(f.get('https://example.test/41', os.path.join(self.dir, '41')))
        self.assertTrue(f.exhausted)
        self.assertFalse(os.path.exists(os.path.join(self.dir, '41')))

    def test_headers_have_user_agent_and_no_referer(self):
        opener = FakeOpener()
        self.fetcher(opener).get('https://example.test/a', os.path.join(self.dir, 'a'))
        req = opener.requests[0]
        headers = {k.lower(): v for k, v in req.header_items()}
        self.assertNotIn('referer', headers)
        self.assertIn('sekai-reader', headers['user-agent'])
        self.assertIn('github.com', headers['user-agent'])

    def test_sleeps_five_seconds_between_requests(self):
        f = self.fetcher(FakeOpener())
        f.get('https://example.test/a', os.path.join(self.dir, 'a'))
        self.assertEqual(self.sleeps, [])
        f.get('https://example.test/b', os.path.join(self.dir, 'b'))
        self.assertEqual(self.sleeps, [5.0])

    def test_kana_ratio(self):
        self.assertEqual(fe.kana_ratio({'TalkData': [{'Body': '今天天氣真好'}]}), 0.0)
        self.assertGreater(fe.kana_ratio({'TalkData': [{'Body': 'きょうはいい天気ですね'}]}), 0.5)
        self.assertEqual(fe.kana_ratio({'TalkData': []}), 0.0)
        self.assertEqual(fe.kana_ratio({}), 0.0)


class PlanTest(unittest.TestCase):
    ASSET = {
        'm_Name': 'event_9_01', 'FirstBackground': 'bg_a',
        'TalkData': [{'WindowDisplayName': '一歌'}, {'WindowDisplayName': '咲希的訊息'},
                     {'WindowDisplayName': '真堂'}, {'WindowDisplayName': '星乃一歌'}],
        'SpecialEffectData': [{'EffectType': 7, 'StringVal': 'bg_b'}, {'EffectType': 8, 'StringVal': '中庭'},
                              {'EffectType': 7, 'StringVal': 'bg_a'}],
    }
    CHARS = [{'id': 1, 'first': '星乃', 'given': '一歌'}, {'id': 2, 'first': '天馬', 'given': '咲希'}]

    def test_backgrounds_in_order_without_duplicates(self):
        self.assertEqual(fe.backgrounds(self.ASSET), ['bg_a', 'bg_b'])

    def test_characters_resolve_names_and_skip_side_characters(self):
        self.assertEqual(fe.character_ids(self.ASSET, self.CHARS), [1, 2])

    def test_urls(self):
        self.assertEqual(fe.scenario_url('event_x_2025', 'event_9_01'),
                         'https://storage.sekai.best/sekai-tc-assets/event_story/event_x_2025/scenario/event_9_01.asset')
        self.assertEqual(fe.background_url('bg_a'),
                         'https://storage.sekai.best/sekai-jp-assets/scenario/background/bg_a/bg_a.webp')
        self.assertEqual(fe.sd_url(3), 'https://storage.sekai.best/sekai-jp-assets/bonds_honor/character/chr_sd_03_01.webp')

    def test_find_bundle(self):
        index = {'events': [{'id': 9, 'bundle': 'event_x_2025', 'eps': [[1, 't', 'event_9_01']]}]}
        self.assertEqual(fe.find_bundle(index, 'event_9_01'), 'event_x_2025')
        with self.assertRaises(KeyError):
            fe.find_bundle(index, 'event_9_02')

    def test_run_end_to_end_with_fake_http(self):
        index = {'events': [{'id': 9, 'bundle': 'b', 'eps': [[1, 't', 'event_9_01']]}], 'chars': self.CHARS}
        opener = FakeOpener({fe.scenario_url('b', 'event_9_01'): json.dumps(self.ASSET).encode()})
        with tempfile.TemporaryDirectory() as out:
            f = fe.Fetcher(opener, sleep=lambda s: None, log=lambda *a: None)
            fe.run('event_9_01', index, out, f)
            self.assertTrue(os.path.exists(os.path.join(out, 'event_9_01.asset')))
            self.assertTrue(os.path.exists(os.path.join(out, 'bg', 'bg_b.webp')))
            self.assertTrue(os.path.exists(os.path.join(out, 'sd', 'chr_sd_02_01.webp')))
            self.assertEqual(len(opener.requests), 5)
            fe.run('event_9_01', index, out, f)
            self.assertEqual(len(opener.requests), 5)

    def test_rejects_bad_sid(self):
        with self.assertRaises(ValueError):
            fe.run('../etc', {'events': [], 'chars': []}, '/nonexistent', fe.Fetcher(FakeOpener()))


def talk(name, body):
    return {'WindowDisplayName': name, 'Body': body}


class EventTest(unittest.TestCase):
    CHARS = PlanTest.CHARS
    EP1 = {'FirstBackground': 'bg_a', 'TalkData': [talk('一歌', '今天一起練習吧。')], 'Snippets': [{'Action': 1, 'ReferenceIndex': 0}]}
    EP2 = {'FirstBackground': 'bg_a', 'TalkData': [talk('咲希', '好啊，放學後見。')], 'Snippets': [{'Action': 1, 'ReferenceIndex': 0}]}
    JP = {'FirstBackground': 'bg_a', 'TalkData': [talk('一歌', 'きょうはいっしょにれんしゅうしよう')], 'Snippets': [{'Action': 1, 'ReferenceIndex': 0}]}
    EVENT = {'id': 9, 'bundle': 'b', 'eps': [[1, 't1', 'event_9_01'], [2, 't2', 'event_9_02']]}

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = self.tmp.name
        self.index = {'events': [self.EVENT], 'chars': self.CHARS}

    def tearDown(self):
        self.tmp.cleanup()

    def opener(self, ep1=None):
        return FakeOpener({fe.scenario_url('b', 'event_9_01'): json.dumps(ep1 or self.EP1).encode(),
                           fe.scenario_url('b', 'event_9_02'): json.dumps(self.EP2).encode()})

    def fetcher(self, opener, **kw):
        return fe.Fetcher(opener, sleep=lambda s: None, log=lambda *a: None, **kw)

    def assets(self):
        found = []
        for root, _, files in os.walk(self.out):
            found += [f for f in files if f.endswith('.asset')]
        return found

    def test_run_event_japanese_episode_leaves_no_file(self):
        opener = self.opener(self.JP)
        r = fe.run_event(self.EVENT, self.index, self.out, self.fetcher(opener))
        self.assertEqual(r, {'status': 'jp', 'requests': 1, 'sids': []})
        self.assertEqual(self.assets(), [])
        self.assertEqual(os.listdir(os.path.join(self.out, '.tmp')), [])

    def test_run_event_fetches_whole_event_and_reports_done(self):
        opener = self.opener()
        r = fe.run_event(self.EVENT, self.index, self.out, self.fetcher(opener))
        self.assertEqual(r, {'status': 'done', 'requests': 2 + 1 + 2, 'sids': ['event_9_01', 'event_9_02']})
        for rel in ['event_9_01.asset', 'event_9_02.asset', 'bg/bg_a.webp', 'sd/chr_sd_01_01.webp', 'sd/chr_sd_02_01.webp']:
            self.assertTrue(os.path.exists(os.path.join(self.out, rel)), rel)
        self.assertEqual(os.listdir(os.path.join(self.out, '.tmp')), [])

    def test_run_event_reuses_existing_files(self):
        fe.run_event(self.EVENT, self.index, self.out, self.fetcher(self.opener()))
        opener = self.opener()
        r = fe.run_event(self.EVENT, self.index, self.out, self.fetcher(opener))
        self.assertEqual(r['status'], 'done')
        self.assertEqual(r['requests'], 0)

    def test_run_event_stops_at_budget_and_reports_partial(self):
        f = self.fetcher(self.opener(), max_requests=3)
        r = fe.run_event(self.EVENT, self.index, self.out, f)
        self.assertEqual(r, {'status': 'partial', 'requests': 3, 'sids': ['event_9_01']})
        self.assertTrue(f.exhausted)
        r2 = fe.run_event(self.EVENT, self.index, self.out, self.fetcher(self.opener()))
        self.assertEqual(r2, {'status': 'done', 'requests': 2, 'sids': ['event_9_01', 'event_9_02']})

    def test_jp_recheck_turning_chinese_moves_script_into_place(self):
        fe.run_event(self.EVENT, self.index, self.out, self.fetcher(self.opener(self.JP)))
        r = fe.run_event(self.EVENT, self.index, self.out, self.fetcher(self.opener()))
        self.assertEqual(r['status'], 'done')
        self.assertTrue(os.path.exists(os.path.join(self.out, 'event_9_01.asset')))

    def test_existing_japanese_first_episode_is_still_classified_and_removed(self):
        with open(os.path.join(self.out, 'event_9_01.asset'), 'w', encoding='utf-8') as f:
            json.dump(self.JP, f)
        opener = self.opener()
        r = fe.run_event(self.EVENT, self.index, self.out, self.fetcher(opener))
        self.assertEqual(r, {'status': 'jp', 'requests': 0, 'sids': [], 'removed': ['event_9_01.asset']})
        self.assertEqual(self.assets(), [])

    def test_cli_bad_index_still_prints_json_error(self):
        import io
        from contextlib import redirect_stdout
        bad = os.path.join(self.out, 'bad.json')
        with open(bad, 'w') as f:
            f.write('{not json')
        for idx in [bad, os.path.join(self.out, 'missing.json')]:
            buf = io.StringIO()
            with redirect_stdout(buf):
                self.assertEqual(fe.main(['--event', '9', '--index', idx], opener=FakeOpener(), sleep=lambda s: None), 1)
            self.assertEqual(json.loads(buf.getvalue().strip().splitlines()[-1])['status'], 'error')

    def test_help_documents_limits_and_exit_codes(self):
        import io
        from contextlib import redirect_stdout
        buf = io.StringIO()
        with redirect_stdout(buf), self.assertRaises(SystemExit):
            fe.main(['--help'])
        text = buf.getvalue()
        for needle in ['40', '5 s', 'jp 3', 'partial 4', '--event']:
            self.assertIn(needle, text)

    def cli(self, ep1=None, **kw):
        idx = os.path.join(self.out, 'index.json')
        with open(idx, 'w', encoding='utf-8') as f:
            json.dump(self.index, f)
        lines = []
        code = fe.main(['--event', '9', '--index', idx, '--out', os.path.join(self.out, 'raw')],
                       opener=self.opener(ep1), sleep=lambda s: None, log=lambda *a: lines.append(a), **kw)
        return code, lines

    def test_first_script_404_reports_missing_without_file(self):
        opener = self.opener()
        opener.missing.add(fe.scenario_url('b', 'event_9_01'))
        r = fe.run_event(self.EVENT, self.index, self.out, self.fetcher(opener))
        self.assertEqual(r, {'status': 'missing', 'requests': 1, 'sids': []})
        self.assertEqual(self.assets(), [])

    def test_later_script_404_reports_missing_with_fetched_sids(self):
        opener = self.opener()
        opener.missing.add(fe.scenario_url('b', 'event_9_02'))
        r = fe.run_event(self.EVENT, self.index, self.out, self.fetcher(opener))
        self.assertEqual(r, {'status': 'missing', 'requests': 4, 'sids': ['event_9_01']})

    def test_background_404_is_recorded_as_missing_and_the_event_still_completes(self):
        # Owner, 2026-11-08: events 162 and 171 each lack one background on the mirror; the episode is built
        # with a plain panel there instead of the whole event failing. The marker stops further requests.
        opener = self.opener()
        opener.missing.add(fe.background_url('bg_a'))
        r = fe.run_event(self.EVENT, self.index, self.out, self.fetcher(opener))
        self.assertEqual(r['status'], 'done')
        self.assertTrue(os.path.exists(os.path.join(self.out, 'bg', 'bg_a.missing')))
        self.assertFalse(os.path.exists(os.path.join(self.out, 'bg', 'bg_a.webp')))
        before = len(opener.requests)
        fe.run_event(self.EVENT, self.index, self.out, self.fetcher(opener))
        self.assertNotIn(fe.background_url('bg_a'), [q.full_url for q in opener.requests[before:]])

    def test_background_server_error_is_still_an_error(self):
        import urllib.error
        opener = self.opener()
        url = fe.background_url('bg_a')
        inner = opener.__call__
        def broken(req, timeout=None):
            if req.full_url == url:
                raise urllib.error.HTTPError(url, 500, 'boom', {}, None)
            return inner(req, timeout)
        with self.assertRaises(Exception):
            fe.run_event(self.EVENT, self.index, self.out, self.fetcher(broken))

    def test_cli_missing_exit_code_5(self):
        import io
        from contextlib import redirect_stdout
        idx = os.path.join(self.out, 'index.json')
        with open(idx, 'w', encoding='utf-8') as f:
            json.dump(self.index, f)
        opener = self.opener()
        opener.missing.add(fe.scenario_url('b', 'event_9_01'))
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = fe.main(['--event', '9', '--index', idx, '--out', os.path.join(self.out, 'raw')], opener=opener, sleep=lambda s: None, log=lambda *a: None)
        self.assertEqual(code, 5)
        self.assertEqual(json.loads(buf.getvalue().strip().splitlines()[-1])['status'], 'missing')

    def test_cli_event_exit_codes(self):
        import io
        from contextlib import redirect_stdout
        buf = io.StringIO()
        with redirect_stdout(buf):
            self.assertEqual(self.cli(self.JP)[0], 3)
            self.assertEqual(self.cli(max_requests=3)[0], 4)
            self.assertEqual(self.cli()[0], 0)
        last = json.loads(buf.getvalue().strip().splitlines()[-1])
        self.assertEqual(last['status'], 'done')

    def test_cli_unknown_event_is_error(self):
        idx = os.path.join(self.out, 'index.json')
        with open(idx, 'w', encoding='utf-8') as f:
            json.dump(self.index, f)
        import io
        from contextlib import redirect_stdout
        with redirect_stdout(io.StringIO()):
            self.assertEqual(fe.main(['--event', '99', '--index', idx], opener=FakeOpener(), sleep=lambda s: None), 1)


class ScriptsTest(unittest.TestCase):
    CHARS = PlanTest.CHARS
    TC = {'FirstBackground': 'bg_a', 'TalkData': [talk('一歌', '今天一起練習吧。')], 'Snippets': [{'Action': 1, 'ReferenceIndex': 0}]}
    JP = EventTest.JP
    E9 = {'id': 9, 'bundle': 'b9', 'eps': [[1, 't', 'event_9_01'], [2, 't', 'event_9_02']]}
    E8 = {'id': 8, 'bundle': 'b8', 'eps': [[1, 't', 'event_8_01'], [2, 't', 'event_8_02'], [3, 't', 'event_8_03']]}
    E7 = {'id': 7, 'bundle': 'b7', 'eps': [[1, 't', 'event_7_01']]}

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = self.tmp.name
        self.index = {'events': [self.E9, self.E8, self.E7], 'chars': self.CHARS}

    def tearDown(self):
        self.tmp.cleanup()

    def opener(self, jp=(), missing=()):
        bodies = {}
        for e in [self.E9, self.E8, self.E7]:
            for ep in e['eps']:
                bodies[fe.scenario_url(e['bundle'], ep[2])] = json.dumps(self.JP if e['id'] in jp else self.TC).encode()
        return FakeOpener(bodies, missing=missing)

    def fetcher(self, opener, **kw):
        self.sleeps = []
        return fe.Fetcher(opener, sleep=self.sleeps.append, log=lambda *a: None, **kw)

    def test_scripts_only_fetches_no_images_across_events(self):
        opener = self.opener()
        r = fe.run_scripts([self.E9, self.E8], self.out, self.fetcher(opener))
        self.assertEqual(r, {'status': 'done', 'requests': 5, 'events': [
            {'id': 9, 'status': 'done', 'sids': ['event_9_01', 'event_9_02']},
            {'id': 8, 'status': 'done', 'sids': ['event_8_01', 'event_8_02', 'event_8_03']}]})
        self.assertTrue(all('/scenario/' in q.full_url for q in opener.requests))
        self.assertFalse(os.path.exists(os.path.join(self.out, 'bg')))

    def test_scripts_jp_and_missing_events_are_reported_and_skipped(self):
        opener = self.opener(jp={9}, missing={fe.scenario_url('b8', 'event_8_02')})
        r = fe.run_scripts([self.E9, self.E8, self.E7], self.out, self.fetcher(opener))
        self.assertEqual([(e['id'], e['status']) for e in r['events']], [(9, 'jp'), (8, 'missing'), (7, 'done')])
        self.assertFalse(os.path.exists(os.path.join(self.out, 'event_9_01.asset')))
        self.assertEqual(r['status'], 'done')

    def test_scripts_budget_stops_mid_event_as_partial(self):
        r = fe.run_scripts([self.E9, self.E8], self.out, self.fetcher(self.opener(), max_requests=3))
        self.assertEqual(r['status'], 'partial')
        self.assertEqual(r['events'], [{'id': 9, 'status': 'done', 'sids': ['event_9_01', 'event_9_02']},
                                       {'id': 8, 'status': 'partial', 'sids': ['event_8_01']}])

    def test_scripts_reuse_existing_files_without_requests(self):
        fe.run_scripts([self.E9], self.out, self.fetcher(self.opener()))
        r = fe.run_scripts([self.E9], self.out, self.fetcher(self.opener()))
        self.assertEqual(r['requests'], 0)
        self.assertEqual(r['events'][0]['status'], 'done')

    def test_scripts_japanese_later_episode_removes_whole_event(self):
        opener = self.opener()
        opener.bodies[fe.scenario_url('b8', 'event_8_02')] = json.dumps(self.JP).encode()
        r = fe.run_scripts([self.E8], self.out, self.fetcher(opener))
        self.assertEqual(r['events'][0]['status'], 'jp')
        self.assertEqual(sorted(r['events'][0]['removed']), ['event_8_01.asset'])
        self.assertEqual([f for f in os.listdir(self.out) if f.endswith('.asset')], [])

    def test_scripts_malformed_episode_is_error_and_leaves_no_file(self):
        opener = self.opener()
        opener.bodies[fe.scenario_url('b9', 'event_9_02')] = b'<html>oops</html>'
        r = fe.run_scripts([self.E9, self.E7], self.out, self.fetcher(opener))
        self.assertEqual([(e['id'], e['status']) for e in r['events']], [(9, 'error'), (7, 'done')])
        self.assertFalse(os.path.exists(os.path.join(self.out, 'event_9_02.asset')))
        self.assertEqual(sorted(r['events'][0]['removed']), ['event_9_01.asset'])

    def test_scripts_existing_japanese_file_is_caught_and_listed(self):
        with open(os.path.join(self.out, 'event_8_03.asset'), 'w', encoding='utf-8') as f:
            json.dump(self.JP, f)
        r = fe.run_scripts([self.E8], self.out, self.fetcher(self.opener()))
        self.assertEqual(r['events'][0]['status'], 'jp')
        self.assertIn('event_8_03.asset', r['events'][0]['removed'])
        self.assertFalse(os.path.exists(os.path.join(self.out, 'event_8_03.asset')))

    def test_full_event_japanese_later_episode_also_removes_scripts(self):
        idx = {'events': [self.E8], 'chars': self.CHARS}
        opener = self.opener()
        opener.bodies[fe.scenario_url('b8', 'event_8_02')] = json.dumps(self.JP).encode()
        r = fe.run_event(self.E8, idx, self.out, self.fetcher(opener))
        self.assertEqual(r['status'], 'jp')
        self.assertEqual([f for f in os.listdir(self.out) if f.endswith('.asset')], [])

    def test_scripts_schema_matches_parse_scenario(self):
        self.assertTrue(fe._valid_script(self.TC))
        for bad in [{'TalkData': []}, {'TalkData': [talk('a', 'b')]}, {'TalkData': ['x'], 'Snippets': [{'Action': 1, 'ReferenceIndex': 0}]},
                    {'TalkData': [talk('a', 'b')], 'Snippets': ['x']}, {'TalkData': [talk('a', '')], 'Snippets': [{'Action': 1, 'ReferenceIndex': 0}]},
                    [], 'x', None,
                    {'TalkData': [{'Body': 123}], 'Snippets': [{'Action': 1, 'ReferenceIndex': 0}]},
                    {'TalkData': [talk('a', 'b')], 'Snippets': [{'Action': True, 'ReferenceIndex': 0}]},
                    {'TalkData': [talk('a', 'b')], 'Snippets': [{'Action': 1, 'ReferenceIndex': False}]},
                    {'TalkData': [dict(talk('a', 'b'), Motions='x')], 'Snippets': [{'Action': 1, 'ReferenceIndex': 0}]},
                    {'TalkData': [dict(talk('a', 'b'), WindowDisplayName=5)], 'Snippets': [{'Action': 1, 'ReferenceIndex': 0}]}]:
            self.assertFalse(fe._valid_script(bad), bad)

    def test_classification_exception_counts_as_invalid(self):
        opener = self.opener()
        orig = fe.kana_ratio
        fe.kana_ratio = lambda a: (_ for _ in ()).throw(TypeError('boom'))
        try:
            r = fe.run_scripts([self.E9, self.E7], self.out, self.fetcher(opener))
        finally:
            fe.kana_ratio = orig
        self.assertEqual([(e['id'], e['status']) for e in r['events']], [(9, 'error'), (7, 'error')])

    def test_scripts_nested_garbage_is_per_event_error_and_lane_continues(self):
        opener = self.opener()
        opener.bodies[fe.scenario_url('b9', 'event_9_01')] = json.dumps({'TalkData': [1, 2], 'Snippets': [{'Action': 1, 'ReferenceIndex': 0}]}).encode()
        r = fe.run_scripts([self.E9, self.E7], self.out, self.fetcher(opener))
        self.assertEqual([(e['id'], e['status']) for e in r['events']], [(9, 'error'), (7, 'done')])

    def test_full_event_invalid_returns_error_with_removed(self):
        idx = {'events': [self.E8], 'chars': self.CHARS}
        fe.run_scripts([self.E8], self.out, self.fetcher(self.opener()))
        with open(os.path.join(self.out, 'event_8_02.asset'), 'w') as f:
            f.write('{"TalkData": []}')
        r = fe.run_event(self.E8, idx, self.out, self.fetcher(self.opener()))
        self.assertEqual(r['status'], 'error')
        self.assertEqual(r['removed'], ['event_8_01.asset', 'event_8_02.asset', 'event_8_03.asset'])
        self.assertEqual([f for f in os.listdir(self.out) if f.endswith('.asset')], [])

    def test_cli_event_invalid_prints_removed_and_exits_1(self):
        import io
        from contextlib import redirect_stdout
        idx = os.path.join(self.out, 'index.json')
        with open(idx, 'w', encoding='utf-8') as f:
            json.dump({'events': [self.E7], 'chars': self.CHARS}, f)
        raw = os.path.join(self.out, 'raw')
        os.makedirs(raw)
        with open(os.path.join(raw, 'event_7_01.asset'), 'w') as f:
            f.write('{"TalkData": []}')
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = fe.main(['--event', '7', '--index', idx, '--out', raw], opener=self.opener(), sleep=lambda s: None, log=lambda *a: None)
        self.assertEqual(code, 1)
        last = json.loads(buf.getvalue().strip().splitlines()[-1])
        self.assertEqual((last['status'], last['removed']), ('error', ['event_7_01.asset']))

    def test_cli_scripts_for_uses_budget_80_and_20s_spacing(self):
        import io
        from contextlib import redirect_stdout
        idx = os.path.join(self.out, 'index.json')
        with open(idx, 'w', encoding='utf-8') as f:
            json.dump(self.index, f)
        sleeps = []
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = fe.main(['--scripts-for', '9,8', '--index', idx, '--out', os.path.join(self.out, 'raw')],
                           opener=self.opener(), sleep=sleeps.append, log=lambda *a: None)
        self.assertEqual(code, 0)
        self.assertEqual(set(sleeps), {20.0})
        last = json.loads(buf.getvalue().strip().splitlines()[-1])
        self.assertEqual([e['id'] for e in last['events']], [9, 8])
        self.assertEqual(fe.SCRIPTS_BUDGET, 80)

    def test_cli_scripts_for_rejects_unknown_or_bad_ids(self):
        import io
        from contextlib import redirect_stdout
        idx = os.path.join(self.out, 'index.json')
        with open(idx, 'w', encoding='utf-8') as f:
            json.dump(self.index, f)
        for arg in ['9,99', '9;rm']:
            buf = io.StringIO()
            with redirect_stdout(buf):
                self.assertEqual(fe.main(['--scripts-for', arg, '--index', idx], opener=self.opener(), sleep=lambda s: None), 1)
            self.assertEqual(json.loads(buf.getvalue().strip().splitlines()[-1])['status'], 'error')


WEBP = b'RIFF\x10\x00\x00\x00WEBPVP8 ' + b'\x00' * 8


class BannersTest(unittest.TestCase):
    E9 = {'id': 9, 'bundle': 'event_b9', 'eps': []}
    E8 = {'id': 8, 'bundle': 'event_b8', 'eps': []}
    E7 = {'id': 7, 'bundle': 'event_b7', 'eps': []}

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = self.tmp.name
        self.sleeps = []

    def tearDown(self):
        self.tmp.cleanup()

    def fetcher(self, opener):
        return fe.Fetcher(opener, max_requests=fe.BANNER_MAX, sleep=self.sleeps.append, log=lambda *a: None)

    def path(self, e):
        return os.path.join(self.out, 'banner', e['bundle'] + '.webp')

    def test_banner_url_is_tc_home_banner(self):
        self.assertEqual(fe.banner_url('event_colors_2025'),
                         'https://storage.sekai.best/sekai-tc-assets/home/banner/event_colors_2025/event_colors_2025.webp')

    def test_banners_done_missing_and_invalid(self):
        opener = FakeOpener({fe.banner_url('event_b9'): WEBP, fe.banner_url('event_b7'): b'<html>'},
                            missing=[fe.banner_url('event_b8')])
        r = fe.run_banners([self.E9, self.E8, self.E7], self.out, self.fetcher(opener))
        self.assertEqual(r, {'status': 'done', 'requests': 3, 'events': [
            {'id': 9, 'status': 'done'}, {'id': 8, 'status': 'missing'}, {'id': 7, 'status': 'error'}]})
        self.assertTrue(os.path.exists(self.path(self.E9)))
        self.assertFalse(os.path.exists(self.path(self.E8)))
        self.assertFalse(os.path.exists(self.path(self.E7)))  # not a WebP: no file left behind
        self.assertEqual(self.sleeps, [5.0, 5.0])

    def test_existing_banner_is_done_without_request(self):
        os.makedirs(os.path.join(self.out, 'banner'))
        with open(self.path(self.E9), 'wb') as f:
            f.write(WEBP)
        opener = FakeOpener()
        r = fe.run_banners([self.E9], self.out, self.fetcher(opener))
        self.assertEqual((r['requests'], r['events']), (0, [{'id': 9, 'status': 'done'}]))
        self.assertEqual(opener.requests, [])

    def test_cli_banners_caps_at_four_and_rejects_bad_ids(self):
        import io
        from contextlib import redirect_stdout
        events = [{'id': i, 'bundle': 'event_b%d' % i, 'eps': []} for i in range(1, 7)]
        idx = os.path.join(self.out, 'index.json')
        with open(idx, 'w', encoding='utf-8') as f:
            json.dump({'events': events, 'chars': []}, f)
        st = os.path.join(self.out, 'state.json')
        states = {str(i): {'assets': 'done'} for i in range(1, 7)}
        states['5'] = {'assets': 'pending'}
        states['6'] = {'assets': 'done', 'banner': 'missing'}
        with open(st, 'w', encoding='utf-8') as f:
            json.dump({'events': states}, f)
        self.assertEqual(fe.BANNER_MAX, 4)
        for arg in ['1,2,3,4,1', '1,99', '1;rm', '5', '6']:
            buf = io.StringIO()
            opener = FakeOpener()
            with redirect_stdout(buf):
                self.assertEqual(fe.main(['--banners', arg, '--index', idx, '--state', st], opener=opener, sleep=lambda s: None), 1)
            self.assertEqual(opener.requests, [])
            self.assertEqual(json.loads(buf.getvalue().strip().splitlines()[-1])['status'], 'error')
        sleeps = []
        buf = io.StringIO()
        opener = FakeOpener({fe.banner_url('event_b%d' % i): WEBP for i in range(1, 7)})
        with redirect_stdout(buf):
            code = fe.main(['--banners', '4,3', '--index', idx, '--state', st, '--out', self.out], opener=opener, sleep=sleeps.append, log=lambda *a: None)
        self.assertEqual(code, 0)
        self.assertEqual(sleeps, [5.0])
        last = json.loads(buf.getvalue().strip().splitlines()[-1])
        self.assertEqual(last['events'], [{'id': 4, 'status': 'done'}, {'id': 3, 'status': 'done'}])


if __name__ == '__main__':
    unittest.main()
