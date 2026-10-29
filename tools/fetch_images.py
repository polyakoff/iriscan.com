"""Download the blog photos listed in assets/img/blog/sources.json (Unsplash License).

Each entry gets a 1200x750 image for articles and social cards and a 640x400
thumbnail for the blog grid. Existing files are left alone.
"""
import json, pathlib, urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
out = root / "assets/img/blog"
sizes = {"": (1200, 750, 74), "-640": (640, 400, 70)}

for item in json.loads((out / "sources.json").read_text()):
    for suffix, (w, h, q) in sizes.items():
        target = out / f"{item['file']}{suffix}.jpg"
        if target.exists():
            continue
        url = f"{item['src']}?w={w}&h={h}&fit=crop&crop=faces,entropy&q={q}&fm=jpg"
        req = urllib.request.Request(url, headers={"User-Agent": "iriscan.com image fetch"})
        with urllib.request.urlopen(req, timeout=60) as r:
            target.write_bytes(r.read())
        print(target.name, target.stat().st_size)
