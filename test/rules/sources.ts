// 規約を見張るテスト（test/rules）が共に使う物: web/src のファイルと読み込みの先、クレートごとに読んでよいもの
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"

export const ROOT = resolve(import.meta.dir, "../..")
export const SRC = join(ROOT, "web/src")

export function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return filesUnder(p)
    return /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

// dir の下の、名前が ext で終わるファイル
export const filesEnding = (dir: string, ext: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? filesEnding(join(dir, e.name), ext) : e.name.endsWith(ext) ? [join(dir, e.name)] : [],
  )

export const sources = filesUnder(SRC).map(path => ({
  path,
  rel: relative(SRC, path),
  text: readFileSync(path, "utf8"),
}))
export const crateOf = (rel: string) => rel.split("/")[0]!
// 読んでよい物をクレートで 1 行に書いたクレートは、自分のフォルダの中のファイルも読んでよい（ファイルごとに書いたクレートは、その行のとおり）
export const READS_OWN = ["core", "store", "ui", "host-client", "engine"]
export const inOwnCrate = (rel: string, target: string) =>
  READS_OWN.includes(crateOf(rel)) && topOf(target) === crateOf(rel)

// import の行き先。相対なら web/src から見たパス（拡張子なし）、そうでなければパッケージ名
export function importsOf(file: { path: string; text: string }): string[] {
  const specs = [
    ...file.text.matchAll(
      /(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g,
    ),
  ].map(m => (m[1] ?? m[2] ?? m[3])!)
  return specs.map(s => (s.startsWith(".") ? relative(SRC, resolve(dirname(file.path), s)) : s))
}
export const topOf = (t: string) => t.split("/")[0]!

// フォルダごとに、自分のほかに読み込んでよいもの（土台のフォルダの名前か、パッケージ名）
export const ALLOWED: Record<string, (target: string) => boolean> = {
  core: t => t === "zod",
  store: t => t === "core" || t === "zustand/vanilla",
  "host-client": t => t === "core" || t === "store" || t === "zod",
  engine: t => t === "core" || t === "store" || t === "plugins" || t === "plugin-modules" || t === "zod",
  ui: t =>
    ["core", "store", "react", "react-dom", "react-dom/client", "zustand", "zustand/react/shallow"].includes(t) ||
    t.endsWith(".css"),
  // プラグイン API は土台から名前を出し直すだけ（index は core・store、ui は ui。architecture.test.ts の「プラグイン API のクレート」で分けて見る）。プラグインは読まない
  "plugin-api": t => t === "core" || t === "store" || t === "ui",
}
// プラグインのファイルは役割で見る。見た目（.tsx と ui.ts）は ui と同じもの、ほかは core・store・zod だけ
export const isView = (rel: string) => rel.endsWith(".tsx") || basename(rel) === "ui.ts"
// プラグインのフォルダ: plugins/名前。ページのタイプのプラグインは plugins/page-types/名前、アイテムのプラグインは plugins/items/名前
export const pluginRoot = (rel: string) => {
  const parts = rel.split("/")
  return parts.slice(0, parts[1] === "page-types" || parts[1] === "items" ? 3 : 2).join("/")
}
// base は土台を直に読む（プラグイン API の部品を作る側）。プラグイン API は読まない（plugin-api が base を読まないのと合わせて、輪を作らない）
// 土台の表で読んでよい物のほかの外のライブラリは、ライブラリごとに決めた 1 つのファイルだけが読む（mdast・hast は型だけ。@types/mdast・@types/hast）
export const LIBRARY_READERS: Record<string, readonly string[]> = {
  "plugins/base/markdown/parse.ts": ["mdast", "mdast-util-from-markdown", "mdast-util-gfm", "micromark-extension-gfm"],
  "plugins/base/code-highlight/highlight.ts": ["hast", "refractor", "refractor/zig"],
}
export const baseAllowed = (rel: string) => (t: string) =>
  (isView(rel) ? t === "ui" || ALLOWED.ui!(t) : t === "core" || t === "store" || t === "zod") ||
  (LIBRARY_READERS[rel]?.includes(t) ?? false)
// base 以外のビルトインプラグインは、プラグイン API と zod だけ（見た目は plugin-api/ui と react も。react-dom は読まない: 追加プラグインが借りられる物と合わせる。
// document.body に描くゴーストは base の GhostArea で描く）。状態は plugin-api/ui のフックで読む
export const apiAllowed = (rel: string) => (t: string) =>
  t === "plugin-api" ||
  t === "plugin-api/builtin" ||
  t === "zod" ||
  (isView(rel) && ["plugin-api/ui", "react"].includes(t))

// web/src の直下は、architecture の表のクレートと、直下に置くファイル（画面の入口・CSS の型の宣言）だけ。
// 表に無いクレートは architecture.test.ts の「依存の向き」が見ないので、足したら表と ALLOWED（か入口の見張り）を決める
export const CRATES = [...Object.keys(ALLOWED), "plugins", "plugin-entry", "testing", "plugin-modules"]
export const ROOT_FILES = ["main.tsx", "css.d.ts"]

// 追加プラグインの見本（test/added-plugins）のファイルと、見本・連携ポイントのフォルダ
export const ADDED = join(ROOT, "test/added-plugins")
export const added = filesUnder(ADDED)
  .filter(path => /\.tsx?$/.test(path))
  .map(path => ({ path, rel: relative(ADDED, path), text: readFileSync(path, "utf8") }))
export const folders = readdirSync(ADDED).filter(name => statSync(join(ADDED, name)).isDirectory())
export const plugins = folders.filter(name => existsSync(join(ADDED, name, "matomezu.json"))) // 見本のプラグイン（フォルダの名前が id）
// 連携ポイント: 名前が「<見本>-spec」で、matomezu.json を持たず、対になる見本（その連携ポイントの持ち主）がある
export const SPEC = /^(.+)-spec$/
export const specs = folders.filter(name => !plugins.includes(name) && plugins.includes(SPEC.exec(name)?.[1] ?? ""))
export const specOwner = (spec: string) => SPEC.exec(spec)![1]!
export const named = (names: readonly string[], s: string) => names.some(n => s === n || s.startsWith(`${n}/`))
// 読み込みの名前と、型だけ（import type・export type）か
export const readsOf = (text: string) =>
  [...text.matchAll(/(?:import|export)\s+(type\s+)?[^"';]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g)].map(
    m => ({
      spec: (m[2] ?? m[3])!,
      typeOnly: m[1] !== undefined,
    }),
  )

// declare module の塊を取り除いた文（行番号は変えない）
export function withoutDeclareModule(text: string): string {
  let out = ""
  let at = 0
  for (const m of text.matchAll(/declare module\s+["'][^"']+["']\s*\{/g)) {
    if (m.index < at) continue
    out += text.slice(at, m.index)
    let depth = 0
    let i = m.index + m[0].length - 1
    for (; i < text.length; i++) {
      if (text[i] === "{") depth++
      else if (text[i] === "}" && --depth === 0) break
    }
    // 行番号がずれないよう、取り除いた塊の改行は残す
    out += text.slice(m.index, i + 1).replace(/[^\n]/g, "")
    at = i + 1
  }
  return out + text.slice(at)
}
