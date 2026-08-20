"""js 와 python 에 두 벌로 적힌 규칙이 어긋나지 않았는지 검사한다.

    python tools/check_sync.py

js/jamo.js 의 EXPAND · UNSUPPORTED 는 tools/build_dict.py 의 것과 같아야 한다.
어긋나면 사전에는 있는데 게임에서는 못 치는 단어(또는 그 반대)가 생긴다.
data/*.js 가 실제로 그 규칙대로 만들어졌는지도 함께 본다.
"""

import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def js_object(text, name):
    """`var NAME = { ... };` 를 dict 로 읽는다. 값이 문자열인 표만 다룬다."""
    m = re.search(r"var\s+" + name + r"\s*=\s*\{(.*?)\}\s*;", text, re.S)
    if not m:
        raise SystemExit(f"js 에서 {name} 을 찾지 못했습니다")
    return dict(re.findall(r"'([^']+)'\s*:\s*'?([^,'}\s]+)'?", m.group(1)))


def js_array(text, name):
    m = re.search(r"var\s+" + name + r"\s*=\s*\[(.*?)\]\s*;", text, re.S)
    if not m:
        raise SystemExit(f"js 에서 {name} 을 찾지 못했습니다")
    return [x.strip().strip("'\"") for x in m.group(1).split(",") if x.strip()]


def py_literal(text, name):
    m = re.search(r"^" + name + r"\s*=\s*(\{.*?\}|\(.*?\)|\[.*?\])", text, re.S | re.M)
    if not m:
        raise SystemExit(f"python 에서 {name} 을 찾지 못했습니다")
    return ast.literal_eval(m.group(1))


def report(label, ok, detail=""):
    print(f"{'OK  ' if ok else 'FAIL'}  {label}{'' if ok else '  -> ' + detail}")
    return ok


def main():
    jamo = (ROOT / "js" / "jamo.js").read_text(encoding="utf-8")
    dict_js = (ROOT / "js" / "dict.js").read_text(encoding="utf-8")
    build = (ROOT / "tools" / "build_dict.py").read_text(encoding="utf-8")

    ok = True

    js_expand = js_object(jamo, "EXPAND")
    py_expand = py_literal(build, "EXPAND")
    diff = {k: (js_expand.get(k), py_expand.get(k))
            for k in set(js_expand) | set(py_expand) if js_expand.get(k) != py_expand.get(k)}
    ok &= report(f"EXPAND 표가 같다 ({len(py_expand)}개)", not diff, json.dumps(diff, ensure_ascii=False))

    js_unsup = set(js_object(jamo, "UNSUPPORTED"))
    py_unsup = set(py_literal(build, "UNSUPPORTED"))
    ok &= report(f"UNSUPPORTED 가 같다 ({sorted(py_unsup)})", js_unsup == py_unsup,
                 f"js={sorted(js_unsup)} py={sorted(py_unsup)}")

    js_lengths = [int(x) for x in js_array(dict_js, "LENGTHS")]
    py_lengths = list(py_literal(build, "LENGTHS"))
    ok &= report(f"LENGTHS 가 같다 ({py_lengths})", js_lengths == py_lengths,
                 f"js={js_lengths} py={py_lengths}")

    # 겹자모 입력열은 반드시 기본 24키로만 이뤄져야 한다
    keys = set(js_array(jamo, "CONSONANTS")) | set(js_array(jamo, "VOWELS"))
    bad = {k: v for k, v in py_expand.items() if not set(v) <= keys}
    ok &= report(f"EXPAND 의 값이 모두 기본 24키 ({len(keys)}키)", not bad, json.dumps(bad, ensure_ascii=False))

    # 생성물이 실제로 그 길이로 만들어져 있는지
    for n in py_lengths:
        path = ROOT / "data" / f"words-{n}.js"
        if not path.exists():
            ok &= report(f"data/words-{n}.js 존재", False, "파일 없음")
            continue
        blob = json.loads(re.search(r"=\s*(\".*\")\s*;", path.read_text(encoding="utf-8"), re.S).group(1))
        clean = len(blob) % n == 0 and set(blob) <= keys
        ok &= report(f"data/words-{n}.js — {len(blob) // n}개, {n}칸씩 나눠떨어짐", clean,
                     f"길이 {len(blob)} % {n} = {len(blob) % n}, 낯선 문자 {sorted(set(blob) - keys)}")

    print("\n전부 일치합니다." if ok else "\n어긋난 항목이 있습니다.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
