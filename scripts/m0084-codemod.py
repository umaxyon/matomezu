#!/usr/bin/env python3
"""M-0084 段 2: ブックの並びとページのタイプへの、機械的な書き換え（何度流してもよい。main を取り込んだあとに流し直す）。
段 2 を main に入れるときに、このスクリプトは消す。

使い方: scripts/m0084-codemod.py [フォルダ...]（省けば web/src/plugins test e2e）
意味で決まる所（どのページで読むかなど）は直さない。直せなかった所は typecheck と scripts/m0084-left.sh に残る。
"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
os.chdir(ROOT)
DIRS = sys.argv[1:] or ["web/src/plugins", "test", "e2e"]

# ブックを指す変数の名前（この名前の .pages だけを書き換える。タイプの定義の pages や、変化の pages は触らない）
BOOKS = r"(?:book|next|after|before|draft|made\.book|done\.book|read|opened\.book)"
ARG = r"[\w.]+(?:\([^()]*\))?"  # 引数 1 つ（名前か、かっこが 1 段の呼び出し）
# 外す引数（ブックを指す名前）
BOOKARG = r"(?:book|next|after|before|draft|b|made|done\.book|[\w.]*[bB]ook)"

RULES = [
    # ページを探す
    (re.compile(rf"\b({BOOKS})\.pages\.find\(\(?(\w+)\)? => \2\.id === ([\w.]+)\)"), r"findPage(\1, \3)?.page", ["findPage"]),
    # ページの並び
    (re.compile(rf"\b({BOOKS})\.pages\b(?!\s*[:=][^=])"), r"pagesOf(\1)", ["pagesOf"]),
    # ページを持たないブックの守りは要らない（どのブックも並びを持つ）
    (re.compile(r"^[ \t]*if \(!hasPages\(\w+\)\) return (?:null|undefined|false|\w+)\n", re.M), "", []),
    (re.compile(r'^[ \t]*if \(!\("pages" in \w+\)\) return (?:null|undefined|false|\w+)\n', re.M), "", []),
    # ブックの型
    (re.compile(r"\bPagedBook\b"), "Book", []),
    # 設定の読み方: 2 つ目の引数のブックを外す（ページに null を渡している所は、どのページで読むかを決める所なので触らない）
    (re.compile(rf"\bsettingValue\(({ARG}), {BOOKARG}, (?!null\b)({ARG}), ({ARG})\)"), r"settingValue(\1, \2, \3)", []),
    (re.compile(rf"\bsettingsAt\(({ARG}), {BOOKARG}, (?!null\b)({ARG})\)"), r"settingsAt(\1, \2)", []),
    (re.compile(rf"\bpageContext\(({ARG}), {BOOKARG}, (?!null\b)({ARG})\)"), r"pageContext(\1, \2)", []),
    # ページのタイプで決まる物: ブックを渡していた引数を外す（外す引数は、ブックを指す名前のときだけ。流し直しても、ほかの引数を外さない）
    (
        re.compile(
            rf"\b(growOf|slideOffsetOf|roomOf|tidyPage|frameOf|widenForCaption|itemAiPlaced|pageArea)\(({ARG}), {BOOKARG}, "
        ),
        r"\1(\2, ",
        [],
    ),
    # テーマ・紙の色・文字の色はページの設定の項目（名前を替える）
    (re.compile(r"\bBOOK_THEME\b"), "PAGE_THEME", []),
    (re.compile(r"\bBOOK_PAPER_COLOR\b"), "PAGE_PAPER_COLOR", []),
    (re.compile(r"\bBOOK_TEXT_COLORS\b"), "PAGE_TEXT_COLORS", []),
    (re.compile(r"@matomezu/base:book-(theme|paper-color|text-colors)\b"), r"@matomezu/base:page-\1", []),
    # 付く先: ページを持つタイプ → どのブックにも
    (re.compile(r"attach: \{ pages: true \}"), "attach: { books: true }", []),
    # 開いているもの
    (re.compile(r"\b([\w.]+\.opened)\?\.page\b(?! ===? null)"), r"shownPageId(\1 ?? null)", ["shownPageId"]),
]

BOOK_FNS = {"findPage", "pagesOf", "findFolder", "lineupOf"}
STAGE_FNS = {"shownPageId", "shownType", "openedPage"}


def rel(frm: str, mod: str) -> str:
    r = os.path.relpath(os.path.join("web/src", mod), os.path.dirname(frm))
    return r if r.startswith(".") else "./" + r


def names_of(body: str) -> list[str]:
    return [n.strip() for n in body.split(",") if n.strip()]


def fix_import(s: str, path: str, mod: str, add: set[str], remove: set[str], type_only: bool = False) -> str:
    """mod（core/book など）からの import に add を足し、remove を外す。plugin-api から読んでいるファイルは、そちらに足す"""
    api = re.search(r'import (type )?\{([^}]*)\} from "((?:\.\./)+plugin-api|matomezu)"\n', s)
    target = rel(path, mod)
    pat = re.compile(r'import (type )?\{([^}]*)\} from "' + re.escape(target) + r'"\n')
    m = pat.search(s)
    if not m and api and "web/src/plugins" in path and "/base/" not in path:
        m, target = api, api.group(3)
    used = {a for a in add if re.search(r"\b" + a + r"\b", s)}
    if m:
        whole_type = bool(m.group(1))
        names = names_of(m.group(2))
        bare = lambda n: n.replace("type ", "")
        kept = [n for n in names if bare(n) not in remove]
        if len(kept) == len(names) and not (used - {bare(n) for n in names}):
            return s  # 足す物も外す物も無ければ、書き換えない
        names = kept
        if whole_type:
            names = ["type " + n for n in names]
        have = {bare(n) for n in names}
        for a in sorted(used - have):
            names.append(("type " if type_only else "") + a)
        line = ("import { " + ", ".join(names) + ' } from "' + target + '"\n') if names else ""
        return s[: m.start()] + line + s[m.end() :]
    if used:
        i = s.find("import ")
        if i < 0:
            i = 0
        prefix = "type " if type_only else ""
        return s[:i] + "import { " + ", ".join(prefix + a for a in sorted(used)) + ' } from "' + target + '"\n' + s[i:]
    return s


def run(path: str) -> bool:
    s = open(path, encoding="utf-8").read()
    was = s
    # PagedBook は import から外してから、使う所を Book に替える（core/book は Book を出していない）
    s = fix_import(s, path, "core/book", set(), {"PagedBook"})
    s = fix_import(s, path, "plugin-api", set(), {"PagedBook"})
    for pat, to, _ in RULES:
        s = pat.sub(to, s)
    if s == was and not re.search(r"\b(PagedBook|hasPages|pagedOf)\b", s):
        return False
    # import: 使わなくなった名前を外し、使う名前を足す
    gone = {n for n in ("PagedBook", "hasPages", "pagedOf") if not re.search(r"\b" + n + r"\(|: " + n + r"\b|<" + n + r"\b", strip_imports(s))}
    s = fix_import(s, path, "core/book", BOOK_FNS, gone)
    s = fix_import(s, path, "plugin-api", set(), gone)
    s = fix_import(s, path, "core/stage", STAGE_FNS, set())
    if re.search(r"\bBook\b", strip_imports(s)) and not re.search(r"import [^\n]*\bBook\b[^\n]* from", s):
        s = fix_import(s, path, "core/schema/book", {"Book"}, set(), type_only=True)
    if s != was:
        open(path, "w", encoding="utf-8").write(s)
    return s != was


def strip_imports(s: str) -> str:
    return re.sub(r"^import [^\n]*(?:\n[^\n;]*?)*? from [^\n]*\n", "", s, flags=re.M)


changed = 0
for d in DIRS:
    for base, _, files in os.walk(d):
        if "node_modules" in base:
            continue
        for f in files:
            if f.endswith((".ts", ".tsx")):
                changed += run(os.path.join(base, f))
print(f"changed {changed} files")
