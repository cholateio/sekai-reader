import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))
import compact_script as cs  # noqa: E402

ASSET = {
    'FirstBackground': 'bg_a',
    'Snippets': [{'Action': 6, 'ReferenceIndex': 0}, {'Action': 1, 'ReferenceIndex': 0},
                 {'Action': 6, 'ReferenceIndex': 1}, {'Action': 1, 'ReferenceIndex': 1},
                 {'Action': 1, 'ReferenceIndex': 9}, {'Action': 6, 'ReferenceIndex': 9}],
    'TalkData': [{'WindowDisplayName': '一歌', 'Body': '早安。\n今天好冷',
                  'Motions': [{'FacialName': 'face_smile_01', 'MotionName': 'w-normal01-nod'}]},
                 {'WindowDisplayName': '', 'Body': '  ', 'Motions': []}],
    'SpecialEffectData': [{'EffectType': 8, 'StringVal': '頂樓'}, {'EffectType': 7, 'StringVal': 'bg_b'}],
}
CAPS = {
    'Snippets': [{'Action': 6, 'ReferenceIndex': i} for i in range(6)] + [{'Action': 1, 'ReferenceIndex': 0}],
    'TalkData': [{'WindowDisplayName': '一歌', 'Body': '嗯。', 'Motions': []}],
    'SpecialEffectData': [{'EffectType': 8, 'StringVal': '頂樓'}, {'EffectType': 18, 'StringVal': '放學後'},
                          {'EffectType': 8, 'StringVal': ' '}, {'EffectType': 20, 'StringVal': ''},
                          {'EffectType': 13, 'StringVal': ''}, {'EffectType': 2, 'StringVal': ''}],
}


class CompactTest(unittest.TestCase):
    def test_format_with_background_lines(self):
        self.assertEqual(cs.compact(ASSET).splitlines(), [
            'BG:bg_a', 'CAP0:頂樓', '0|一歌|smile_01|nod|早安。/今天好冷', 'BG:bg_b'])

    def test_caption_numbers_match_parse_scenario(self):
        # parse.ts counts FX8/FX18 with text and every FX20 as scenes; the numbering here must be identical.
        self.assertEqual(cs.compact(CAPS).splitlines(), [
            'CAP0:頂樓', 'CAP1:放學後', 'FX8: ', 'CAP2:「世界」', 'FX13:', 'FX2:', '0|一歌|||嗯。'])


if __name__ == '__main__':
    unittest.main()
