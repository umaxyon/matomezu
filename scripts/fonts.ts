// 箱の文字のフォント Noto Sans JP（@fontsource/noto-sans-jp。字の範囲ごとに分けた woff2）を画面に配り、字の幅の表を作る（OVERHAUL 4.12）。
//   bun scripts/fonts.ts copy <dir>  ふつう（400）と太字（700）の woff2 と、それを読む noto-sans-jp.css を <dir> に置く
//   bun scripts/fonts.ts widths [<file>]  字の幅の表（無ければ web/src/plugins/base/text/noto-sans-jp.ts）を、配る woff2 から作り直す
// 幅は配るファイルそのものから読むので、測る字と描く字が同じになる
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import * as fontkit from "fontkit"

const PACKAGE = "node_modules/@fontsource/noto-sans-jp"
const WEIGHTS = [400, 700] as const
const TABLE = "web/src/plugins/base/text/noto-sans-jp.ts"

// その太さの woff2 の @font-face（woff の予備は外す。配るのは woff2 だけ）
function faces(weight: number): string {
  return readFileSync(join(PACKAGE, `${weight}.css`), "utf8").replace(/, url\([^)]*\.woff\) format\('woff'\)/g, "")
}

function copy(dir: string) {
  mkdirSync(join(dir, "files"), { recursive: true })
  for (const weight of WEIGHTS) {
    for (const f of readdirSync(join(PACKAGE, "files"))) {
      if (f.endsWith(`-${weight}-normal.woff2`)) copyFileSync(join(PACKAGE, "files", f), join(dir, "files", f))
    }
  }
  writeFileSync(join(dir, "noto-sans-jp.css"), WEIGHTS.map(faces).join("\n"))
}

// 字ごとの幅（1 em を 1000 にした値）を、続く字が同じ幅の並び [最初の字, 字の数, 幅] にまとめる
function runs(weight: number): number[] {
  const widths = new Map<number, number>()
  for (const f of readdirSync(join(PACKAGE, "files"))) {
    if (!f.endsWith(`-${weight}-normal.woff2`)) continue
    const font = fontkit.openSync(join(PACKAGE, "files", f)) as fontkit.Font
    const scale = 1000 / font.unitsPerEm
    for (const cp of font.characterSet) widths.set(cp, Math.round(font.glyphForCodePoint(cp).advanceWidth * scale))
  }
  const runs: { start: number; count: number; width: number }[] = []
  for (const cp of [...widths.keys()].sort((a, b) => a - b)) {
    const width = widths.get(cp) as number
    const last = runs.at(-1)
    if (last && last.start + last.count === cp && last.width === width) last.count += 1
    else runs.push({ start: cp, count: 1, width })
  }
  return runs.flatMap(r => [r.start, r.count, r.width])
}

function widths(file: string) {
  const version = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")).version
  const tables = WEIGHTS.map(w => `  ${w}: [${runs(w).join(",")}],`).join("\n")
  writeFileSync(
    file,
    `// 作ったもの（bun scripts/fonts.ts widths）。手で直さない。
// Noto Sans JP（@fontsource/noto-sans-jp ${version}）の字の幅。太さごとに、続く字が同じ幅の並び [最初の字, 字の数, 幅] を並べる（1 em を 1000 にした値）
export const NOTO_SANS_JP: Readonly<Record<400 | 700, readonly number[]>> = {
${tables}
}
`,
  )
}

const [mode, dir] = process.argv.slice(2)
if (mode === "copy" && dir) copy(dir)
else if (mode === "widths") widths(dir ?? TABLE)
else {
  console.error("usage: bun scripts/fonts.ts copy <dir> | widths [<file>]")
  process.exit(2)
}
