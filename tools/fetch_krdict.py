"""한국어기초사전(krdict) 전체 사전 JSON 내려받기.

https://krdict.korean.go.kr/download/downloadPopup 의 'Json 전체 내려받기'
버튼이 호출하는 엔드포인트를 그대로 사용한다. 로그인은 필요 없다.

    python tools/fetch_krdict.py

받은 zip 은 data/raw/ 에 저장되며 .gitignore 로 커밋에서 제외된다.
"""

import sys
import urllib.request
from pathlib import Path

POPUP = "https://krdict.korean.go.kr/download/downloadPopup"
# seq=212 엑셀 / 213 XML / 214 JSON
URL = "https://krdict.korean.go.kr/dicBatchDownload?seq=214"
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "krdict_json.zip"


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        URL,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Referer": POPUP,
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        total = int(resp.headers.get("Content-Length") or 0)
        done = 0
        with OUT.open("wb") as fp:
            while chunk := resp.read(1 << 20):
                fp.write(chunk)
                done += len(chunk)
                if total:
                    print(f"\r{done / total:6.1%}  {done >> 20}MB / {total >> 20}MB", end="")
    print(f"\nsaved -> {OUT}  ({OUT.stat().st_size >> 20}MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
