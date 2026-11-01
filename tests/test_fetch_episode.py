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

    def test_budget_of_20_requests(self):
        f = self.fetcher(FakeOpener())
        for i in range(20):
            f.get('https://example.test/%d' % i, os.path.join(self.dir, str(i)))
        with self.assertRaisesRegex(RuntimeError, 'request budget exceeded'):
            f.get('https://example.test/21', os.path.join(self.dir, '21'))

    def test_headers_have_user_agent_and_no_referer(self):
        opener = FakeOpener()
        self.fetcher(opener).get('https://example.test/a', os.path.join(self.dir, 'a'))
        req = opener.requests[0]
        headers = {k.lower(): v for k, v in req.header_items()}
        self.assertNotIn('referer', headers)
        self.assertIn('sekai-reader', headers['user-agent'])
        self.assertIn('github.com', headers['user-agent'])

    def test_sleeps_between_requests(self):
        f = self.fetcher(FakeOpener())
        f.get('https://example.test/a', os.path.join(self.dir, 'a'))
        self.assertEqual(self.sleeps, [])
        f.get('https://example.test/b', os.path.join(self.dir, 'b'))
        self.assertEqual(self.sleeps, [1.0])


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


if __name__ == '__main__':
    unittest.main()
