"""Build the Taiwan-server event index used by the reader.

Downloads four master DB tables from Sekai-World's TC diff repo and writes a compact
index: started events (newest first), their episodes, banner colour, and character colours.

Usage: python3 scripts/build_index.py [out=data/tc-event-index.json]
"""
import json
import sys
import time
import urllib.request

BASE = "https://raw.githubusercontent.com/Sekai-World/sekai-master-db-tc-diff/main/"
# Events from this id onward currently have Japanese text in the TC asset mirror (checked 2026-10-30).
# Replace with real detection (kana ratio of episode 1) once the pipeline downloads scenarios.
JP_TEXT_FROM = 181


def get(table):
    with urllib.request.urlopen(BASE + table + ".json", timeout=60) as r:
        return json.load(r)


def main(out="data/tc-event-index.json"):
    events = {e["id"]: e for e in get("events")}
    stories = get("eventStories")
    chars = get("gameCharacters")
    units = get("gameCharacterUnits")
    unit_by_id = {u["id"]: u for u in units}
    now = time.time() * 1000

    rows = []
    for s in stories:
        e = events.get(s["eventId"])
        if not e or e["startAt"] > now:
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
            "jp": e["id"] >= JP_TEXT_FROM,
            "eps": [[x["episodeNo"], x["title"], x["scenarioId"]]
                    for x in sorted(s["eventStoryEpisodes"], key=lambda x: x["episodeNo"])],
        })
    rows.sort(key=lambda r: -r["id"])

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
    main(*sys.argv[1:])
