"""Build the Taiwan-server event index used by the reader.

Downloads four master DB tables from Sekai-World's TC diff repo and writes a compact
index: started events (newest first), their episodes, banner colour, and character colours.

The `jp` flag comes from the pipeline state file (events whose first episode is still Japanese).

Usage: python3 scripts/build_index.py [out=data/tc-event-index.json] [--state data/pipeline-state.json]
"""
import argparse
import json
import os
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


def build_rows(events, stories, units, now_ms, jp_ids):
    unit_by_id = {u["id"]: u for u in units}
    rows = []
    for s in stories:
        e = events.get(s["eventId"])
        if not e or e["startAt"] > now_ms:
            continue
        banner = unit_by_id.get(s.get("bannerGameCharacterUnitId"))
        rows.append({
            "id": e["id"],
            "name": e["name"],
            "unit": e.get("unit", "none"),
            "type": e["eventType"],
            "date": time.strftime("%Y-%m-%d", time.gmtime(e["startAt"] / 1000)),
            "bundle": s["assetbundleName"],
            "color": banner["colorCode"] if banner else None,
            "jp": e["id"] in jp_ids,
            "eps": [[x["episodeNo"], x["title"], x["scenarioId"]]
                    for x in sorted(s["eventStoryEpisodes"], key=lambda x: x["episodeNo"])],
        })
    rows.sort(key=lambda r: -r["id"])
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("out", nargs="?", default="data/tc-event-index.json")
    ap.add_argument("--state", default="data/pipeline-state.json")
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
    rows = build_rows(events, stories, units, time.time() * 1000, jp_ids_from_state(state))

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


if __name__ == "__main__":
    main()
