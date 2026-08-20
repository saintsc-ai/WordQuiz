"""색 규칙을 검사한다. STYLE_GUIDE.md 의 원칙을 사람 눈 대신 확인해 준다.

    python tools/check_css.py

1. 색은 :root 밖에서 직접 쓰지 않는다 (토큰만 쓴다)
2. 쓰이는 토큰은 전부 정의돼 있어야 한다
3. 두 테마가 같은 토큰 집합을 덮어야 한다
4. 글자/배경 조합이 WCAG AA(4.5:1) 이상이어야 한다
5. js/theme.js 의 주소창 색이 --app-bg 와 같아야 한다
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSS = ROOT / "css" / "style.css"
THEME_JS = ROOT / "js" / "theme.js"
JS_DIR = ROOT / "js"

AA = 4.5

# 글자색 / 배경색 조합. 화면에서 실제로 겹쳐 놓이는 것만 적는다.
PAIRS = [
    ("본문 글자 / 카드", "app-text", "app-card-bg"),
    ("보조 글자 / 카드", "app-text-muted", "app-card-bg"),
    ("시트 본문 / 카드", "app-text-body", "app-card-bg"),
    ("작은 주석 / 카드", "app-text-faint", "app-card-bg"),
    ("타일·자판 글자 / 정답 초록", "on-fill", "ok"),
    ("타일·자판 글자 / 근접 노랑", "on-warn", "warn"),
    ("타일·자판 글자 / 없음 회색", "on-fill", "absent"),
    ("자판 글자 / 자판키", "app-text", "app-border"),
    ("제출 글자 / 제출 버튼", "app-text-muted", "app-hover-bg"),
    ("순위 글자 / 순위 줄", "app-text", "app-sunken-bg"),
    ("경고 글자 / 카드", "state-danger", "app-card-bg"),
    ("성공 글자 / 카드", "ok", "app-card-bg"),
    ("반전 글자 / 강조 배경", "on-fill", "app-text"),
]


def block(css, selector):
    m = re.search(re.escape(selector) + r"\s*\{(.*?)\}", css, re.S)
    if not m:
        raise SystemExit(f"{selector} 블록을 찾지 못했습니다")
    return dict(re.findall(r"--([\w-]+):\s*([^;]+);", m.group(1)))


def rgb(value):
    value = value.strip()
    if value.startswith("rgb"):
        return tuple(float(x) for x in re.findall(r"[\d.]+", value)[:3])
    value = value.lstrip("#")
    if len(value) == 3:
        value = "".join(c * 2 for c in value)
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def luminance(color):
    def channel(x):
        x /= 255
        return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = map(channel, color)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(rgb(a)), luminance(rgb(b))
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def report(ok, label, detail=""):
    print(f"{'OK  ' if ok else 'FAIL'}  {label}{'' if ok else '  -> ' + detail}")
    return ok


def main():
    css = CSS.read_text(encoding="utf-8")
    dark = block(css, ":root")
    light_overrides = block(css, ':root[data-theme="light"]')
    light = dict(dark)
    light.update(light_overrides)

    ok = True

    # 1. :root 블록 밖에 직접 쓴 색이 없어야 한다
    body = re.sub(r":root(\[data-theme=\"light\"\])?\s*\{.*?\}", "", css, flags=re.S)
    literals = re.findall(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)", body)
    ok &= report(not literals, "색을 :root 밖에서 직접 쓰지 않는다", ", ".join(sorted(set(literals))))

    inline = []
    for path in sorted(JS_DIR.glob("*.js")):
        inline += [f"{path.name}: {m}" for m in re.findall(r"(?:color|background)\s*:\s*#[0-9a-fA-F]{3,8}", path.read_text(encoding="utf-8"))]
    ok &= report(not inline, "js 가 만드는 HTML 에도 직접 쓴 색이 없다", ", ".join(inline))

    # 2. 쓰이는 토큰이 전부 정의돼 있다.
    #    색 토큰은 :root 에, 레이아웃 토큰(--tile 등)은 쓰는 자리에 있고
    #    --cols 처럼 JS 가 넣어 주는 것도 있다. 셋 다 '정의됨'으로 친다.
    used = set(re.findall(r"var\(--([\w-]+)\)", css))
    js_sources = [path.read_text(encoding="utf-8") for path in sorted(JS_DIR.glob("*.js"))]
    for src in js_sources:
        used |= set(re.findall(r"var\(--([\w-]+)\)", src))

    defined = set(re.findall(r"--([\w-]+)\s*:", css))
    for src in js_sources:
        defined |= set(re.findall(r"setProperty\(\s*'--([\w-]+)'", src))

    missing = sorted(used - defined)
    ok &= report(not missing, f"쓰이는 토큰 {len(used)}개가 모두 정의돼 있다", ", ".join(missing))

    unused = sorted(set(dark) - used)
    ok &= report(not unused, "정의만 하고 안 쓰는 색 토큰이 없다", ", ".join(unused))

    # 3. 라이트가 덮는 토큰은 다크에 있는 것뿐이어야 한다
    stray = sorted(set(light_overrides) - set(dark))
    ok &= report(not stray, "라이트가 없는 토큰을 새로 만들지 않는다", ", ".join(stray))

    # 4. 대비
    print()
    print(f"{'':30} {'다크':>7} {'라이트':>9}")
    for label, fg, bg in PAIRS:
        d, l = contrast(dark[fg], dark[bg]), contrast(light[fg], light[bg])
        mark = lambda r: "" if r >= AA else "  <-- AA 미만"
        print(f"{label:30} {d:6.2f} {l:8.2f}{mark(min(d, l))}")
        if min(d, l) < AA:
            ok = False
    print()

    # 5. 주소창 색이 배경과 같아야 한다
    js = THEME_JS.read_text(encoding="utf-8")
    bar = dict(re.findall(r"(light|dark):\s*'(#[0-9a-fA-F]{3,8})'", js))
    same = bar.get("dark", "").lower() == dark["app-bg"].strip().lower() and \
           bar.get("light", "").lower() == light["app-bg"].strip().lower()
    ok &= report(same, "js/theme.js 의 주소창 색이 --app-bg 와 같다",
                 f"theme.js={bar} css dark={dark['app-bg'].strip()} light={light['app-bg'].strip()}")

    print("\n색 규칙 이상 없습니다." if ok else "\n고칠 것이 있습니다.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
