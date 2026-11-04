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
    def __init__(self, bodies=None):
        self.requests = []
        self.bodies = bodies or {}

    def __call__(self, req, timeout=None):
        self.requests.append(req)
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
    EP1 = {'FirstBackground': 'bg_a', 'TalkData': [talk('一歌', '今天一起練習吧。')]}
    EP2 = {'FirstBackground': 'bg_a', 'TalkData': [talk('咲希', '好啊，放學後見。')]}
    JP = {'FirstBackground': 'bg_a', 'TalkData': [talk('一歌', 'きょうはいっしょにれんしゅうしよう')]}
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

    def cli(self, ep1=None, **kw):
        idx = os.path.join(self.out, 'index.json')
        with open(idx, 'w', encoding='utf-8') as f:
            json.dump(self.index, f)
        lines = []
        code = fe.main(['--event', '9', '--index', idx, '--out', os.path.join(self.out, 'raw')],
                       opener=self.opener(ep1), sleep=lambda s: None, log=lambda *a: lines.append(a), **kw)
        return code, lines

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


if __name__ == '__main__':
    unittest.main()
