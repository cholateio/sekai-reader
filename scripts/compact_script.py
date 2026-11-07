"""Turn a scenario .asset (JSON) into the compact script the AI director reads (prompts/storyboard_director.md).

One line per event, in Snippets order:
  BG:<background id>          opening background and every FX7 background change
  <TalkData index>|<speaker>|<face>|<motion verb>|<body with / for newlines>
  CAP<n>:<text>               scene caption n (FX8/FX18 with text, FX20 = 「世界」), numbered as src/scenario/parse.ts does
  FX<EffectType>:<StringVal>  every other special effect

Blank lines (whitespace-only Body) and out-of-range indexes are skipped, matching src/scenario/parse.ts,
so every printed index is a line the storyboard must reference.

Usage: python3 scripts/compact_script.py path/to/event_173_01.asset > compact.txt
"""
import json
import sys

EFFECT_CHANGE_BACKGROUND = 7
EFFECT_CAPTION = (8, 18)
EFFECT_SEKAI = 20


def compact(j):
    out = []
    caps = 0
    if j.get("FirstBackground"):
        out.append(f"BG:{j['FirstBackground']}")
    talks, effects = j.get("TalkData") or [], j.get("SpecialEffectData") or []
    for s in j["Snippets"]:
        i = s["ReferenceIndex"]
        if s["Action"] == 1 and 0 <= i < len(talks):
            t = talks[i]
            body = (t.get("Body") or "").strip()
            if not body:
                continue
            m = next((x for x in t.get("Motions") or [] if x.get("FacialName")), {})
            face = (m.get("FacialName") or "").replace("face_", "")
            motion = (m.get("MotionName") or "").split("-")[-1]
            out.append(f"{i}|{(t.get('WindowDisplayName') or '').strip()}|{face}|{motion}|{body.replace(chr(10), '/')}")
        elif s["Action"] == 6 and 0 <= i < len(effects):
            e = effects[i]
            text = (e.get("StringVal") or "").strip()
            if e["EffectType"] == EFFECT_CHANGE_BACKGROUND:
                if e.get("StringVal"):
                    out.append(f"BG:{e['StringVal']}")
            elif e["EffectType"] in EFFECT_CAPTION and text:
                out.append(f"CAP{caps}:{text}")
                caps += 1
            elif e["EffectType"] == EFFECT_SEKAI:
                out.append(f"CAP{caps}:「世界」")
                caps += 1
            else:
                out.append(f"FX{e['EffectType']}:{e.get('StringVal', '')}")
    return "\n".join(out)


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as f:
        print(compact(json.load(f)))
