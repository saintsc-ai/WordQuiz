"""krdict 원본 zip -> 게임용 단어 데이터 생성.

    python tools/fetch_krdict.py     # 먼저 원본 내려받기
    python tools/build_dict.py

만들어지는 파일 (data/):
    words-N.js    자모 N개짜리 명사의 자판 입력열을 전부 이어붙인 문자열.
                  길이가 모두 N 으로 같으므로 구분자 없이 잘라 쓰면 된다.
                  = 추측으로 인정되는 단어 집합.
    answers-N.js  그중 어휘등급 초급/중급인 단어 목록(한글 그대로).
                  = 정답 후보. 자모 분해는 실행 시점에 js/jamo.js 가 한다.

fetch/미지원 자모 규칙은 js/jamo.js 와 반드시 같아야 한다.
"""

import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "krdict_json.zip"
OUT = ROOT / "data"

LENGTHS = (5, 6, 9)
ANSWER_LEVELS = {"초급", "중급"}

CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
JONG = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"

# 겹자모 -> 자판 키 입력열 (js/jamo.js 의 EXPAND 와 동일)
EXPAND = {
    "ㄲ": "ㄱㄱ", "ㄸ": "ㄷㄷ", "ㅃ": "ㅂㅂ", "ㅆ": "ㅅㅅ", "ㅉ": "ㅈㅈ",
    "ㄳ": "ㄱㅅ", "ㄵ": "ㄴㅈ", "ㄶ": "ㄴㅎ", "ㄺ": "ㄹㄱ", "ㄻ": "ㄹㅁ",
    "ㄼ": "ㄹㅂ", "ㄽ": "ㄹㅅ", "ㄾ": "ㄹㅌ", "ㄿ": "ㄹㅍ", "ㅀ": "ㄹㅎ", "ㅄ": "ㅂㅅ",
    "ㅐ": "ㅏㅣ", "ㅒ": "ㅑㅣ", "ㅔ": "ㅓㅣ", "ㅖ": "ㅕㅣ",
    "ㅘ": "ㅗㅏ", "ㅚ": "ㅗㅣ", "ㅝ": "ㅜㅓ", "ㅟ": "ㅜㅣ", "ㅢ": "ㅡㅣ",
}
UNSUPPORTED = {"ㅙ", "ㅞ"}  # 3키가 필요해 제외

HANGUL_ONLY = re.compile(r"^[가-힣]+$")


def decompose(word):
    """한글 단어 -> 자판 키 입력열. 미지원 자모가 있으면 None."""
    out = []
    for ch in word:
        code = ord(ch) - 0xAC00
        if not 0 <= code <= 11171:
            return None
        parts = [CHO[code // 588], JUNG[code // 28 % 21]]
        jong = JONG[code % 28]
        if jong != " ":
            parts.append(jong)
        for p in parts:
            if p in UNSUPPORTED:
                return None
            out.append(EXPAND.get(p, p))
    return "".join(out)


def feats(node):
    """LMF 의 feat 노드(dict 또는 list)를 {att: val} 로 펴준다."""
    if isinstance(node, list):  # Lemma 가 배열로 오는 표제어가 있다
        node = node[0] if node else {}
    f = node.get("feat")
    if f is None:
        return {}
    if isinstance(f, dict):
        f = [f]
    return {x.get("att"): x.get("val") for x in f}


def iter_entries(zf):
    """LexicalEntry 를 하나씩 흘려보낸다. 파일당 ~95MB 라 통째로 파싱하지 않는다."""
    decoder = json.JSONDecoder()
    for name in sorted(zf.namelist(), key=lambda n: int(n.split("_")[0])):
        text = zf.read(name).decode("utf-8")
        i = text.index('"LexicalEntry"')
        i = text.index("[", i) + 1
        while True:
            while i < len(text) and text[i] in " \t\r\n,":
                i += 1
            if i >= len(text) or text[i] == "]":
                break
            obj, i = decoder.raw_decode(text, i)
            yield obj
        del text


def main():
    if not RAW.exists():
        raise SystemExit(f"원본이 없습니다: {RAW}\n먼저 python tools/fetch_krdict.py 를 실행하세요.")

    words = defaultdict(dict)    # 길이 -> {자모열: 대표 단어}
    answers = defaultdict(list)  # 길이 -> [단어]
    seen_answer = defaultdict(set)
    stats = defaultdict(int)

    with zipfile.ZipFile(RAW) as zf:
        for entry in iter_entries(zf):
            stats["entries"] += 1
            meta = feats(entry)
            if meta.get("partOfSpeech") != "명사":
                continue
            if meta.get("lexicalUnit") != "단어":
                continue
            stats["nouns"] += 1

            lemma = (entry.get("Lemma") or {})
            word = feats(lemma).get("writtenForm", "").strip()
            if not word or not HANGUL_ONLY.match(word):
                stats["skip_form"] += 1
                continue

            jamo = decompose(word)
            if jamo is None:
                stats["skip_jamo"] += 1
                continue
            n = len(jamo)
            if n not in LENGTHS:
                stats["skip_len"] += 1
                continue

            words[n].setdefault(jamo, word)
            if meta.get("vocabularyLevel") in ANSWER_LEVELS and word not in seen_answer[n]:
                seen_answer[n].add(word)
                answers[n].append(word)

    OUT.mkdir(parents=True, exist_ok=True)
    for n in LENGTHS:
        keys = sorted(words[n])
        (OUT / f"words-{n}.js").write_text(
            "window.WORDS=window.WORDS||{};WORDS[%d]=%s;\n" % (n, json.dumps("".join(keys), ensure_ascii=False)),
            encoding="utf-8",
        )
        (OUT / f"answers-{n}.js").write_text(
            "window.ANSWERS=window.ANSWERS||{};ANSWERS[%d]=%s;\n" % (n, json.dumps(sorted(answers[n]), ensure_ascii=False)),
            encoding="utf-8",
        )
        print(f"자모 {n}개: 추측 허용 {len(keys):>6}개 / 정답 후보 {len(answers[n]):>5}개")

    print("\n[통계]", dict(stats))


if __name__ == "__main__":
    main()
