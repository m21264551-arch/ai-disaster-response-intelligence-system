"""Complete paginated DEA snapshot. Fail on a cap/partial page, never treat it as zero."""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import httpx
import pandas as pd
from download_dea_hotspots import DEA_WFS_URL

BBOX = [148.7, -37.4, 153.8, -31.1]


def download_window(start, end, path):
    beginning = pd.Timestamp(start)
    ending = pd.Timestamp(end)
    rows = []
    receipts = []
    seen = set()
    with httpx.Client(timeout=90) as client:
        for lo in pd.date_range(beginning, ending, freq="6h", inclusive="left"):
            hi = min(lo + pd.Timedelta(hours=6), ending)
            condition = f"australian_state='NSW' AND datetime >= {lo.strftime('%Y-%m-%dT%H:%M:%SZ')} AND datetime < {hi.strftime('%Y-%m-%dT%H:%M:%SZ')} AND BBOX(location,{','.join(map(str,BBOX))},'EPSG:4326')"
            offset = 0
            total = None
            while total is None or offset < total:
                params = {
                    "service": "WFS",
                    "version": "2.0.0",
                    "request": "GetFeature",
                    "typeNames": "public:hotspots",
                    "outputFormat": "application/json",
                    "count": 2500,
                    "startIndex": offset,
                    "sortBy": "datetime A",
                    "CQL_FILTER": condition,
                }
                response = client.get(DEA_WFS_URL, params=params)
                response.raise_for_status()
                payload = response.json()
                total = int(payload["numberMatched"])
                features = payload["features"]
                if total > 300000:
                    raise ValueError("Unexpected large query; no partial publication")
                if not features and offset < total:
                    raise ValueError("Incomplete pagination")
                for f in features:
                    if f["id"] in seen:
                        raise ValueError(
                            "Duplicate feature across pages; refusing ambiguous snapshot"
                        )
                    seen.add(f["id"])
                    p = f["properties"]
                    rows.append(
                        {
                            "id": f["id"],
                            "source": "dea-hotspots-wfs",
                            "observed_at": p.get("datetime") or p.get("start_dt"),
                            "lat": p["latitude"],
                            "lon": p["longitude"],
                            "satellite": p.get("satellite"),
                            "sensor": p.get("sensor"),
                            "state": p.get("australian_state"),
                        }
                    )
                offset += len(features)
                if offset > total:
                    raise ValueError("Pagination count changed during request")
            receipts.append(
                {
                    "start": lo.isoformat(),
                    "end": hi.isoformat(),
                    "matched": total,
                    "downloaded": offset,
                }
            )
            print(f"{lo}: {offset} records; total {len(rows)}", flush=True)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).sort_values(["observed_at", "id"]).to_csv(path, index=False)
    receipt = {
        "schemaVersion": 1,
        "source": DEA_WFS_URL,
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "start": beginning.isoformat(),
        "end": ending.isoformat(),
        "bbox": BBOX,
        "completePagination": True,
        "rows": len(rows),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "chunks": receipts,
        "meaning": "Complete response to the archived DEA query; satellite sampling/cloud cover and catalogue revisions still limit detection coverage.",
    }
    path.with_suffix(".manifest.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--start", required=True)
    p.add_argument("--end", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    download_window(a.start, a.end, a.out)
