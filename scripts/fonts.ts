// 箱の文字のフォント Noto Sans JP（@fontsource/noto-sans-jp。字の範囲ごとに分けた woff2）を画面に配り、字の幅の表を作る。
//   bun scripts/fonts.ts copy <dir>  ふつう（400）と太字（700）の woff2 と、それを読む noto-sans-jp.css と、画面が先に読む字の範囲を指す字 first.txt を <dir> に置く
//   bun scripts/fonts.ts widths [<file>]  字の幅の表（無ければ web/src/plugins/base/text/noto-sans-jp.ts）を、配る woff2 から作り直す
// 幅は配るファイルそのものから読むので、測る字と描く字が同じになる
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import * as fontkit from "fontkit"

const PACKAGE = "node_modules/@fontsource/noto-sans-jp"
const WEIGHTS = [400, 700] as const
const TABLE = "web/src/plugins/base/text/noto-sans-jp.ts"

// その太さの woff2 の @font-face（woff の予備は外す。配るのは woff2 だけ）
function faces(weight: number): string {
  return readFileSync(join(PACKAGE, `${weight}.css`), "utf8").replace(/, url\([^)]*\.woff\) format\('woff'\)/g, "")
}

// その太さで配る woff2 の名前: @font-face が指す物だけ（パッケージには、1 つのファイルで日本語を読む別の形 japanese も入っているが、指さないので配らない）
function served(weight: number): string[] {
  return [...faces(weight).matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)].map(m => m[1] ?? "")
}

function copy(dir: string) {
  mkdirSync(join(dir, "files"), { recursive: true })
  for (const weight of WEIGHTS) {
    for (const f of served(weight)) copyFileSync(join(PACKAGE, "files", f), join(dir, "files", f))
  }
  writeFileSync(join(dir, "noto-sans-jp.css"), WEIGHTS.map(faces).join("\n"))
  writeFileSync(join(dir, "first.txt"), firstText(faces(400)))
}

// 画面が、ページを描く前に先に読む字の範囲: @fontsource は番号の大きい範囲ほどよく使う字を入れる（[119] がかなと句読点、[118] が英数字、小さい番号は使うことの少ない漢字）。
// 番号の大きい方から FIRST_RANGES 個と latin を先に読む
const FIRST_RANGES = 25
// 範囲の名前（[119] なら "119"、latin なら "latin"）と、その範囲の字
function rangesOf(css: string): { name: string; points: number[] }[] {
  return [...css.matchAll(/noto-sans-jp-\[?([0-9a-z]+)\]?-\d+-normal \*\/[^}]*unicode-range:([^;]*);/g)].map(m => ({
    name: m[1] ?? "",
    points: (m[2] ?? "").split(",").flatMap(part => {
      const [from, to] = part.trim().replace(/^U\+/i, "").split("-")
      const start = Number.parseInt(from ?? "", 16)
      const end = to === undefined ? start : Number.parseInt(to, 16)
      return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    }),
  }))
}
// 先に読む範囲ごとに、その範囲だけに入る字を 1 字ずつ並べた文（画面は、この字を描くための範囲を読む）
function firstText(css: string): string {
  const ranges = rangesOf(css)
  const numbered = ranges.filter(r => /^\d+$/.test(r.name)).sort((a, b) => Number(b.name) - Number(a.name))
  const first = [...numbered.slice(0, FIRST_RANGES), ...ranges.filter(r => r.name === "latin")]
  const count = new Map<number, number>()
  for (const r of ranges) for (const p of r.points) count.set(p, (count.get(p) ?? 0) + 1)
  return first
    .map(r => {
      const own = r.points.find(p => count.get(p) === 1) ?? r.points[0]
      return own === undefined ? "" : String.fromCodePoint(own)
    })
    .join("")
}

// 字ごとの幅（1 em を 1000 にした値）を、続く字が同じ幅の並び [最初の字, 字の数, 幅] にまとめる
function runs(weight: number): number[] {
  const widths = new Map<number, number>()
  for (const f of served(weight)) {
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
