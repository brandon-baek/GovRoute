"""Check compressed serving inclusion, raw archive exclusion, and real function budgets."""
import json
from pathlib import Path
full=Path("data/govroute-locations.db")
runtime=Path("data/govroute-runtime.db")
compressed=Path("data/govroute-runtime.db.gz")
assert full.is_file() and full.stat().st_size>200_000_000
assert runtime.is_file() and runtime.stat().st_size<=350*1024*1024
assert compressed.is_file() and compressed.stat().st_size<=80*1024*1024
traces=list(Path(".next").rglob("*.nft.json"))
assert traces, "No production traces"
included=[]
for trace in traces:
    paths=[(trace.parent/value).resolve() for value in json.loads(trace.read_text())["files"]]
    assert all(path.name not in (full.name,runtime.name) for path in paths), f"Raw archive leaked: {trace}"
    if any(path.name==compressed.name for path in paths):
        size=sum(path.stat().st_size for path in set(paths) if path.is_file())
        assert size<230*1024*1024, f"Function trace exceeds size budget: {trace}: {size}"
        included.append(str(trace))
assert any("/api/places/" in name for name in included), "Place API has no serving snapshot"
assert any("/api/chat/" in name for name in included), "Chat API has no serving snapshot"
assert any("/api/local-resources/" in name for name in included), "Local API has no serving snapshot"
print(json.dumps({"traces":len(traces),"servingBytes":runtime.stat().st_size,"bundledBytes":compressed.stat().st_size,"included":included}))
