"""Build a bounded serving projection; the full provenance archive remains separate."""
from __future__ import annotations
import argparse, gzip, hashlib, json, os, re, sqlite3, tempfile
from pathlib import Path
from pipeline.locations import ROOT, coverage

MAX_RUNTIME_BYTES=350*1024*1024

def compact(source, output):
    source,output=Path(source),Path(output)
    if source.resolve()==output.resolve(): raise ValueError("Serving projection must have a separate path")
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as folder:
        staging=Path(folder)/"runtime.db"
        db=sqlite3.connect(staging,uri=True)
        schema=(ROOT/"database/registry/001_registry.sql").read_text()
        def smaller(match):
            value=match.group(0)
            return value[:-1]+" WITHOUT ROWID;" if "PRIMARY KEY" in value and "INTEGER PRIMARY KEY" not in value else value
        schema=re.sub(r"CREATE TABLE \w+ \([\s\S]*?\n\);",smaller,schema)
        db.executescript(schema)
        db.execute("DROP INDEX names_search")
        db.execute("ATTACH DATABASE ? AS archive",(f"file:{source.resolve()}?mode=ro",))
        tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND sql NOT LIKE 'CREATE VIRTUAL%' AND name NOT LIKE '%search%' AND name NOT LIKE 'sqlite_%'")]
        with db:
            for table in tables:
                if not db.execute("SELECT 1 FROM archive.sqlite_master WHERE name=?",(table,)).fetchone(): continue
                # Retain the layer used by Census geocoding; raw feature attributes
                # are reproducible in the full archive and have no runtime consumer.
                columns=[r[1] for r in db.execute(f'PRAGMA table_info("{table}")')]
                select=",".join("json_object('_layer_name',json_extract(attributes_json,'$._layer_name'))" if c=="attributes_json" else f'"{c}"' for c in columns)
                db.execute(f'INSERT INTO "{table}" SELECT {select} FROM archive."{table}"')
        if db.execute("PRAGMA integrity_check").fetchone()[0]!="ok" or db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Serving projection integrity failed")
        db.execute("ANALYZE main")
        db.commit()
        report=coverage(db)
        db.close()
        size=staging.stat().st_size
        if size>MAX_RUNTIME_BYTES: raise ValueError(f"Serving projection exceeds deployment budget: {size}")
        os.replace(staging,output)
    compressed=output.with_suffix(".db.gz")
    archive=source.with_suffix(".db.gz")
    for original,zipped_path in [(output,compressed),(source,archive)]:
        with original.open("rb") as src,zipped_path.open("wb") as dst:
            with gzip.GzipFile(filename="",mode="wb",fileobj=dst,mtime=0) as zipped:
                while chunk:=src.read(1024*1024): zipped.write(chunk)
    def digest_file(path):
        digest=hashlib.sha256()
        with path.open("rb") as file:
            while chunk:=file.read(1024*1024): digest.update(chunk)
        return digest.hexdigest()
    manifest={"schemaVersion":1,"sha256":digest_file(output),
              "bytes":size,"compressedBytes":compressed.stat().st_size,
              "archiveBytes":source.stat().st_size,"archiveCompressedBytes":archive.stat().st_size,"archiveSha256":digest_file(source),
              "placeCount":report["placeCount"],"sourceCount":report["sourceCount"],
              "reviewedProcesses":report["reviewedProcesses"],"generatedAt":report["generatedAt"]}
    output.with_suffix(".manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    output.with_suffix(".coverage.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(manifest))
    return manifest

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source",type=Path,default=Path("data/govroute-locations.db"))
    parser.add_argument("--output",type=Path,default=Path("data/govroute-runtime.db"))
    args=parser.parse_args()
    compact(args.source,args.output)
if __name__=="__main__": main()
