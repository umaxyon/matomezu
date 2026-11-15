#!/usr/bin/env python3
# 橋渡しの間だけ（M-0066。最後に消す）: 書き換えで使わなくなった名前（typecheck の TS6133「declared but its value is never read」）を消す。
# 分割で受けた名前（{ stage, args } の stage）・読み込んだ名前・使わない引数（ctx → _ctx）を、誤りの位置から機械的に直す。直せない形は残して出す。
#   python3 scripts/m0066-unused.py     （誤りが無くなるか、直せる物が無くなるまで繰り返す）
import re, subprocess, sys

def errors():
    out = subprocess.run(["bun", "run", "typecheck"], capture_output=True, text=True).stdout
    found = []
    for m in re.finditer(r"^(.+?)\((\d+),(\d+)\): error TS6133: '([^']+)' is declared", out, re.M):
        found.append((m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)))
    return found

def fix(path, line, col, name):
    lines = open(path, encoding="utf-8").read().split("\n")
    text = lines[line - 1]
    at = col - 1
    if text[at:at + len(name)] != name:
        return False
    before, after = text[:at], text[at + len(name):]
    # 型つきの 1 行（stage: string,）や、別名（stage: id,）は触らない
    if re.match(r"\s*:", after):
        return False
    # 名前が、分割（{ … }）の中にあるか、引数の並び（( … )）の中にあるか: 手前の、閉じていない開き括弧で決める
    joined = "\n".join(lines[: line - 1]) + "\n" + before
    depth = {"}": 0, ")": 0, "]": 0}
    opener = None
    for ch in reversed(joined[-4000:]):
        if ch in depth:
            depth[ch] += 1
        elif ch in "{([":
            close = {"{": "}", "(": ")", "[": "]"}[ch]
            if depth[close] > 0:
                depth[close] -= 1
            else:
                opener = ch
                break
    if opener == "(":  # 使わない引数は、名前の頭に _ を付ける（位置で受けるので消せない）
        lines[line - 1] = before + "_" + name + after
    elif opener == "{":
        only = re.search(r"\{\s*$", before) and re.match(r"\s*\}", after)
        if only:  # 「{ name }」だけ
            whole = before + name + after
            fixed = re.sub(r"\(\{\s*" + name + r"\s*\}\s*:", "(_props:", whole)
            if fixed == whole:
                return False
            lines[line - 1] = fixed
        elif re.match(r"^\s*$", before) and re.match(r"^,?\s*$", after):  # その名前だけの行
            del lines[line - 1]
        elif re.match(r"\s*,\s*", after):  # 「name, 」
            lines[line - 1] = before + re.sub(r"^\s*,\s*", "", after)
        elif re.search(r",\s*$", before):  # 「, name }」
            lines[line - 1] = re.sub(r",\s*$", "", before) + after
        else:
            return False
    else:
        return False
    open(path, "w", encoding="utf-8").write("\n".join(lines))
    return True

left = []
for _ in range(12):
    found = errors()
    if not found:
        break
    done = 0
    # 同じファイルは下の行から直す（行がずれないように）
    for path, line, col, name in sorted(found, key=lambda e: (e[0], -e[1], -e[2])):
        if fix(path, line, col, name):
            done += 1
    subprocess.run(["bunx", "biome", "check", "--write", "web/src", "test"], capture_output=True)
    left = errors()
    if done == 0:
        break
for e in left:
    print("left:", *e)
print("unused left:", len(left))
