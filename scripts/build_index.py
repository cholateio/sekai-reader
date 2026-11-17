"""Build the Taiwan-server event index used by the reader.

Downloads six master DB tables from Sekai-World's TC diff repo and writes a compact
index: started events (newest first), their episodes, banner colour, featured characters
(from the event's cards) and character colours. Events the master data leaves untagged
(`unit: "none"`, everything before #37) get their unit from the cards.

The `jp` flag comes from the pipeline state file (events whose first episode is still Japanese).

Also writes the chibi catalogue (spec 2026-11-18) from two more tables: the Spine chibis of the 26 game
characters, the costume -> chibi map and each character's default chibi. It is a separate file so that
it is not bundled into the site.

Usage: python3 scripts/build_index.py [out=data/tc-event-index.json] [--state data/pipeline-state.json]
       [--chibi data/chibi-index.json]
"""
import argparse
import json
import os
import re
import time
import urllib.request

BASE = "https://raw.githubusercontent.com/Sekai-World/sekai-master-db-tc-diff/main/"


def get(table):
    with urllib.request.urlopen(BASE + table + ".json", timeout=60) as r:
        return json.load(r)


def jp_ids_from_state(state):
    if not state:
        return set()
    return {int(k) for k, v in (state.get("events") or {}).items() if v.get("assets") == "jp"}


def event_chars(event_cards, cards):
    """Character ids per event, deduped in eventCards order; cards missing from `cards` are skipped."""
    char_of = {c["id"]: c["characterId"] for c in cards}
    out = {}
    for ec in event_cards:
        cid = char_of.get(ec["cardId"])
        if cid is None:
            continue
        lst = out.setdefault(ec["eventId"], [])
        if cid not in lst:
            lst.append(cid)
    return out


def first_tagged_event(events):
    """Id of the oldest event whose master-data unit is set; older events are all "none" (untagged, not mixed)."""
    return min((e["id"] for e in events.values() if e.get("unit", "none") != "none"), default=0)


def event_unit(event, chars, unit_of_char, first_tagged):
    """Master data tags events[].unit only from #37 (2022-10) on; before that every event is "none".
    For those untagged events, cards (ignoring VIRTUAL SINGERs) all from one unit mean that unit's box event.
    From the first tagged event on, "none" is the game's own mixed-event value and is kept."""
    unit = event.get("unit", "none")
    if unit != "none" or event["id"] >= first_tagged:
        return unit
    units = {unit_of_char[c] for c in chars if c in unit_of_char} - {"piapro"}
    return units.pop() if len(units) == 1 else "none"


def build_rows(events, stories, units, now_ms, jp_ids, event_chars, chars=()):
    unit_by_id = {u["id"]: u for u in units}
    unit_of_char = {c["id"]: c["unit"] for c in chars}
    first_tagged = first_tagged_event(events)
    rows = []
    for s in stories:
        e = events.get(s["eventId"])
        if not e or e["startAt"] > now_ms:
            continue
        banner = unit_by_id.get(s.get("bannerGameCharacterUnitId"))
        rows.append({
            "id": e["id"],
            "name": e["name"],
            "unit": event_unit(e, event_chars.get(e["id"], []), unit_of_char, first_tagged),
            "type": e["eventType"],
            "date": time.strftime("%Y-%m-%d", time.gmtime(e["startAt"] / 1000)),
            # The pipeline publishes a story only after this (official guideline: no full episodes of an ongoing event).
            "closed": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(e["closedAt"] / 1000)) if e.get("closedAt") else None,
            "bundle": s["assetbundleName"],
            "color": banner["colorCode"] if banner else None,
            "jp": e["id"] in jp_ids,
            "chars": event_chars.get(e["id"], []),
            "eps": [[x["episodeNo"], x["title"], x["scenarioId"]]
                    for x in sorted(s["eventStoryEpisodes"], key=lambda x: x["episodeNo"])],
        })
    rows.sort(key=lambda r: -r["id"])
    return rows


# Only the 26 game characters' own v2 chibis: collab characters, mobs and staff have other name shapes.
CHIBI_RE = re.compile(r'^v2_sd_(\d{2})[a-z]+_[a-z0-9_]+$')


def build_chibi(costumes, character2ds):
    """The chibi lane's list (`chibis`), costume -> chibi (`costumes`) and each character's default chibi."""
    char_of = {c["id"]: c["characterId"] for c in character2ds if c.get("characterType") == "game_character"}
    by_costume, by_char = {}, {}
    for c in costumes:
        name = c.get("spineAssetbundleName") or ""
        m = CHIBI_RE.match(name)
        cid = char_of.get(c.get("character2dId"))
        if not m or cid is None or int(m.group(1)) != cid:
            continue
        by_char.setdefault(cid, set()).add(name)
        live = c.get("live2dAssetbundleName")
        if live:
            by_costume.setdefault(live, name)
    default = {}
    for cid, names in by_char.items():
        ordered = sorted(names)
        default[str(cid)] = next((n for suffix in ("_school", "_casual") for n in ordered if n.endswith(suffix)), ordered[0])
    return {"chibis": sorted(n for names in by_char.values() for n in names),
            "costumes": dict(sorted(by_costume.items())),
            "default": dict(sorted(default.items(), key=lambda kv: int(kv[0])))}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("out", nargs="?", default="data/tc-event-index.json")
    ap.add_argument("--state", default="data/pipeline-state.json")
    ap.add_argument("--chibi", default="data/chibi-index.json")
    args = ap.parse_args(argv)
    out = args.out
    state = None
    if os.path.exists(args.state):
        with open(args.state, encoding="utf-8") as f:
            state = json.load(f)
    events = {e["id"]: e for e in get("events")}
    stories = get("eventStories")
    chars = get("gameCharacters")
    units = get("gameCharacterUnits")
    chars_of = event_chars(get("eventCards"), get("cards"))
    rows = build_rows(events, stories, units, time.time() * 1000, jp_ids_from_state(state), chars_of, chars)

    char_rows = []
    for c in chars:
        u = next((u for u in units if u["gameCharacterId"] == c["id"] and u["unit"] == c["unit"]), None) \
            or next((u for u in units if u["gameCharacterId"] == c["id"]), None)
        char_rows.append({"id": c["id"], "first": c.get("firstName", ""), "given": c.get("givenName", ""),
                          "unit": c["unit"], "color": u["colorCode"] if u else "#888888"})

    data = {"events": rows, "chars": char_rows, "built": time.strftime("%Y-%m-%d")}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(rows)} events, {sum(len(r['eps']) for r in rows)} episodes -> {out}")

    chibi = build_chibi(get("costume2ds"), get("character2ds"))
    tmp = args.chibi + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(chibi, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, args.chibi)
    print(f"{len(chibi['chibis'])} chibis -> {args.chibi}")


if __name__ == "__main__":
    main()
