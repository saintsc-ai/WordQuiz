"""사전 원본 -> 게임용 단어 데이터 생성.

    python tools/fetch_krdict.py     # 한국어기초사전 zip 내려받기
    python tools/build_dict.py

원본 둘을 서로 다른 용도로 쓴다. 성격이 달라서다.

    data/raw/krdict_json.zip   한국어기초사전(krdict.korean.go.kr).
        국립국어원이 한국어를 배우는 사람을 위해 표제어를 추려 만든 사전이라,
        실려 있다는 것 자체가 '알 만한 말'이라는 뜻이다. 그래서 정답 후보로 쓴다.
        어휘등급(초급·중급·고급)이 붙어 있지만 등급으로 거르지 않는다 —
        학습자 사전 안에서 나중에 배우는 말일 뿐 어려운 말이 아니다.

    data/raw/stdict/*.json     표준국어대사전(stdict.korean.go.kr).
        모든 말을 기록하는 규범 사전이라 옛말·방언·전문용어까지 들어 있다.
        정답으로 내면 못 푸는 판이 생기므로 추측 허용에만 쓴다.

만들어지는 파일 (data/):
    dict.db       추측으로 인정되는 자모 입력열 전부. 두 사전의 합집합이다.
                  합집합인 이유는 지금 통과하던 말이 갑자기 거부되지 않게 하려는 것.
                  서버만 읽는다(server/dict.js). 브라우저로 내려보내지 않는다 —
                  십수만 개를 통으로 받게 하면 첫 화면이 무거워진다.
                  화면은 /valid 로 물어본다.
    answers-N.js  정답 후보(한글 그대로). 기초사전 명사 전부.
                  작아서(길이당 1~7천 개) 화면이 그대로 받는다.
                  자모 분해는 실행 시점에 js/jamo.js 가 한다.

미지원 자모 규칙은 js/jamo.js 와 반드시 같아야 한다.
"""

import json
import re
import sqlite3
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "krdict_json.zip"       # 정답 후보 + 추측 허용
STDICT = ROOT / "data" / "raw" / "stdict"             # 추측 허용에만
OUT = ROOT / "data"
DB = OUT / "dict.db"

LENGTHS = (5, 6, 7, 8, 9, 10)

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


# 표준국어대사전 표제어에 붙는 표시들.
#   하이픈    형태소 경계   감소-기
#   ^         구 띄어쓰기   가로^쓰기
#   뒤 숫자   동음이의어    감수01, 감수02  (자모열로 합쳐지니 떼면 그만이다)
STDICT_MARKS = re.compile(r"[-^]")
STDICT_HOMONYM = re.compile(r"\d+$")


def iter_stdict():
    """표준국어대사전 JSON 을 흘려보낸다. 파일 하나가 ~9MB 라 통째로 읽어도 된다."""
    if not STDICT.is_dir():
        return
    for path in sorted(STDICT.glob("*.json")):
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        for item in data.get("channel", {}).get("item", []):
            yield item.get("word_info") or {}


def stdict_word(info):
    """표제어에서 표시를 떼고 한글만 남긴다. 아니면 None."""
    word = STDICT_HOMONYM.sub("", STDICT_MARKS.sub("", info.get("word", ""))).strip()
    return word if word and HANGUL_ONLY.match(word) else None


def write_db(words):
    """추측 허용 목록을 SQLite 한 파일로. server/dict.js 가 읽기 전용으로 연다.

    WITHOUT ROWID 는 표 자체를 (n, jamo) 색인으로 만든다. 우리가 하는 질문이
    '이 자모열이 있느냐' 하나뿐이라, 따로 색인을 달지 않아도 그 색인만 짚으면
    끝나고 파일도 작아진다.

    통째로 다시 만든다. 이어 붙이지 않는 편이 낫다 — 사전 원본이 바뀌면
    빠진 단어도 함께 사라져야 하는데, 지우는 쪽은 추적하기 어렵다.
    """
    if DB.exists():
        DB.unlink()
    con = sqlite3.connect(DB)
    con.execute("PRAGMA journal_mode = OFF")   # 만들고 끝. 복구할 중간 상태가 없다.
    con.execute("CREATE TABLE words (n INTEGER NOT NULL, jamo TEXT NOT NULL,"
                " PRIMARY KEY (n, jamo)) WITHOUT ROWID")
    con.executemany("INSERT INTO words (n, jamo) VALUES (?, ?)",
                    ((n, jamo) for n in LENGTHS for jamo in words[n]))
    con.commit()
    con.execute("VACUUM")
    con.close()


def main():
    if not RAW.exists():
        raise SystemExit(f"원본이 없습니다: {RAW}\n먼저 python tools/fetch_krdict.py 를 실행하세요.")

    words = defaultdict(dict)    # 길이 -> {자모열: 대표 단어}  (추측 허용)
    answers = defaultdict(list)  # 길이 -> [단어]                (정답 후보)
    seen_answer = defaultdict(set)
    stats = defaultdict(int)

    # --- 한국어기초사전: 정답 후보이자 추측 허용 ---
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
            # 등급으로 거르지 않는다. 학습자 사전에 실렸다는 것이 곧 기준이다.
            if word not in seen_answer[n]:
                seen_answer[n].add(word)
                answers[n].append(word)

    stats["krdict_jamo"] = sum(len(v) for v in words.values())

    # --- 표준국어대사전: 추측 허용에만 얹는다 ---
    if not STDICT.is_dir():
        print(f"경고: {STDICT.relative_to(ROOT)} 가 없어 표준국어대사전을 건너뜁니다.")
    for info in iter_stdict():
        stats["st_entries"] += 1
        if info.get("word_unit") != "단어":
            stats["st_skip_unit"] += 1
            continue
        if "명사" not in {p.get("pos") for p in info.get("pos_info", [])}:
            stats["st_skip_pos"] += 1
            continue
        word = stdict_word(info)
        if word is None:
            stats["st_skip_form"] += 1
            continue
        jamo = decompose(word)
        if jamo is None:
            stats["st_skip_jamo"] += 1
            continue
        n = len(jamo)
        if n not in LENGTHS:
            stats["st_skip_len"] += 1
            continue
        # setdefault 라 기초사전 표기가 이긴다. 같은 자모열이면 그쪽이 흔한 말이다.
        words[n].setdefault(jamo, word)

    stats["total_jamo"] = sum(len(v) for v in words.values())

    OUT.mkdir(parents=True, exist_ok=True)
    write_db(words)
    for n in LENGTHS:
        (OUT / f"answers-{n}.js").write_text(
            "window.ANSWERS=window.ANSWERS||{};ANSWERS[%d]=%s;\n" % (n, json.dumps(sorted(answers[n]), ensure_ascii=False)),
            encoding="utf-8",
        )
        print(f"자모 {n}개: 추측 허용 {len(words[n]):>7,}개 / 정답 후보 {len(answers[n]):>6,}개")
    print(f"\n{DB.relative_to(ROOT)}  {DB.stat().st_size >> 10:,}KB"
          f"  (기초사전만이면 {stats['krdict_jamo']:,} → 합쳐서 {stats['total_jamo']:,})")

    print("\n[통계]", dict(stats))


if __name__ == "__main__":
    main()
