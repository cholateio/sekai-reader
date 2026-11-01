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


class CompactTest(unittest.TestCase):
    def test_format_with_background_lines(self):
        self.assertEqual(cs.compact(ASSET).splitlines(), [
            'BG:bg_a', 'FX8:頂樓', '0|一歌|smile_01|nod|早安。/今天好冷', 'BG:bg_b'])


if __name__ == '__main__':
    unittest.main()
