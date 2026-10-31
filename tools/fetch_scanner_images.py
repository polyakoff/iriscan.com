"""Download scanner product photos listed in assets/img/scanners/sources.json. Existing files are kept."""
import json, pathlib, urllib.request
root = pathlib.Path(__file__).resolve().parent.parent
d = root / "assets/img/scanners"
for item in json.loads((d / "sources.json").read_text()):
    t = d / item["file"]
    if t.exists():
        continue
    req = urllib.request.Request(item["url"], headers={"User-Agent": "Mozilla/5.0 iriscan.com image fetch"})
    with urllib.request.urlopen(req, timeout=60) as r:
        t.write_bytes(r.read())
    print(t.name, t.stat().st_size)
