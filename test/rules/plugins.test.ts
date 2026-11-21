// 「プラグイン」の決まりを見張る: プラグインの中のファイルの役割、base の utils、core/catalog.ts への書き足し、見本、ステージ・スクリーンを id で名指すファイル
import { expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { basename, dirname, join, normalize, relative, resolve } from "node:path"
import { WEB_ENTRIES } from "../../scripts/web-build"
import {
  ADDED,
  added,
  crateOf,
  folders,
  isView,
  named,
  pluginRoot,
  plugins,
  ROOT,
  readsOf,
  SRC,
  sources,
  specOwner,
  specs,
  withoutDeclareModule,
} from "./sources"

test("画面のビルドが別に組む Web Worker のファイルは base の中にあり、base がその出力の名前で引く。ほかのファイルは型だけ読む", () => {
  const workers = WEB_ENTRIES.filter(e => e.endsWith(".ts")).map(e => relative(SRC, join(ROOT, e)))
  for (const rel of workers) {
    expect(existsSync(join(SRC, rel))).toBe(true)
    expect(rel.startsWith("plugins/base/")).toBe(true)
    const out = `${basename(rel, ".ts")}.js`
    expect(sources.some(f => f.rel !== rel && f.text.includes(`"${out}"`))).toBe(true)
    const name = `./${basename(rel, ".ts")}`
    const readers = sources.filter(f => f.rel !== rel && f.text.includes(`"${name}"`))
    expect(readers.filter(f => !new RegExp(`import type [^;]*"${name}"`).test(f.text)).map(f => f.rel)).toEqual([])
  }
})

test("型の書き足し（declare module）は core/catalog.ts そのもの（見本は matomezu/catalog）に向ける", () => {
  const CATALOG = join(SRC, "core/catalog")
  const bad = [...sources, ...added].flatMap(f =>
    [...f.text.matchAll(/declare module\s+["']([^"']+)["']/g)]
      .map(m => m[1]!)
      .filter(target => {
        if (target.startsWith("*.")) return !f.path.endsWith("css.d.ts")
        if (target === "matomezu/catalog") return false
        return !target.startsWith(".") || resolve(dirname(f.path), target) !== CATALOG
      })
      .map(target => `${relative(ROOT, f.path)} → ${target}`),
  )
  expect(bad).toEqual([])
})

// プラグインの中のファイルの役割: 機能台帳に足す定義（kit.define…）は見た目でないファイル、文言の表は messages.ts、見た目を結ぶのはプラグインの ui.tsx（plugins の「プラグインの中の形」）
test("プラグインが機能台帳に足す定義（kit.define…）は、見た目でないファイルにだけ書く", () => {
  const offenders = sources
    .filter(f => crateOf(f.rel) === "plugins" && (f.rel.endsWith(".tsx") || f.rel.endsWith("/ui.ts")))
    .filter(f => /\bkit\.define[A-Z]/.test(f.text))
    .map(f => f.rel)
  expect(offenders).toEqual([])
})

test("プラグインの文言の表（defineMessages）は、messages.ts にだけ書く", () => {
  const offenders = sources
    .filter(f => crateOf(f.rel) === "plugins" && !f.rel.endsWith("/messages.ts"))
    .filter(f => /\bdefineMessages\(/.test(f.text))
    .map(f => f.rel)
  expect(offenders).toEqual([])
})

test("見た目を結ぶ（definePluginUi）のは、プラグインの ui.tsx だけ", () => {
  const offenders = sources
    .filter(f => crateOf(f.rel) === "plugins" && !/\/ui\.tsx?$/.test(f.rel))
    .filter(f => /\bdefinePluginUi\(/.test(f.text))
    .map(f => f.rel)
  expect(offenders).toEqual([])
})

// base の utils は、どの機能にも属さない共通の処理の置き場なので、base の utils の外のファイルを読まない。base の機能のフォルダも、直下のファイルも、kit も（kit は base の全部の文言を読むので、機能のフォルダにつながる）（plugins の「プラグインどうしの関係」）
test("base の utils は、base の utils の外のファイルを読まない", () => {
  const offenders = sources
    .filter(f => f.rel.startsWith("plugins/base/utils/"))
    .flatMap(f =>
      [...f.text.matchAll(/from\s*["'](\.\.\/[^"']+)["']/g)]
        .map(m => normalize(join(dirname(f.rel), m[1]!)))
        .filter(t => t.startsWith("plugins/base/") && !t.startsWith("plugins/base/utils/"))
        .map(t => `${f.rel} → ${t}`),
    )
  expect(offenders).toEqual([])
})

// プラグインの index.ts・ui.tsx（ui.ts）・messages.ts は、機能のフォルダの同じ役割のファイル（ui は、見た目を結ぶ定義の index も）だけを読み、フォルダの奥のファイルを直に読まない。
// フォルダの中は、そのフォルダが組み直してよい。base の utils は機能のフォルダでないので除く（plugins の「プラグインの中の形」）
const ENTRY_READS: Record<string, readonly string[]> = {
  "index.ts": ["index"],
  "ui.tsx": ["ui", "index"],
  "ui.ts": ["ui", "index"],
  "messages.ts": ["messages"],
}
test("プラグインの index・ui・messages は、機能のフォルダの同じ役割のファイルだけを読む", () => {
  const offenders = sources
    .filter(f => crateOf(f.rel) === "plugins" && dirname(f.rel) === pluginRoot(f.rel) && basename(f.rel) in ENTRY_READS)
    .flatMap(f =>
      [...f.text.matchAll(/(?:from\s*|import\s+)["'](\.\/[^"']+)["']/g)]
        .map(m => m[1]!.slice(2))
        .filter(spec => {
          const [folder, ...rest] = spec.split("/")
          const root = pluginRoot(f.rel)
          if (`${root}/${folder}` === "plugins/base/utils") return false
          const isFolder = statSync(join(SRC, root, folder!), { throwIfNoEntry: false })?.isDirectory() === true
          if (!isFolder) return false
          const role = rest.length === 0 ? "index" : rest.join("/")
          return !ENTRY_READS[basename(f.rel)]!.includes(role)
        })
        .map(spec => `${f.rel} → ./${spec}`),
    )
  expect(offenders).toEqual([])
})

// 追加プラグインの見本（test/added-plugins/exN。それぞれ開発者プロジェクトの形）: 中（web/src）を直に読まず、プラグイン API の名前だけを読む。
// 見本どうしは読まない。読んでよいのは連携ポイント（matomezu.json の無いフォルダ。例 ex6-spec）を、パッケージの名前で型だけ（import type）。
// 見た目でないファイルは matomezu/ui も React も読まない。テスト（test/）は matomezu/testing と、自分のプラグインのファイルも読み、
// ほかの見本と一緒に組むテストは、その見本のコードもパッケージの名前で読む（ex7 のテストが ex6/ui を読む）
// 見本が答える連携ポイントの持ち主（自分のテストだけが、一緒に組むためにコードを読んでよい。ex7 → ex6）
const answers = (own: string) =>
  added
    .filter(f => f.rel.split("/")[0] === own && f.rel.split("/")[1] !== "test")
    .flatMap(f => readsOf(f.text).map(r => r.spec))
    .filter(spec => specs.includes(spec))
    .map(specOwner)

test("見本の tsconfig は、どれも package.json の typecheck で確かめる", () => {
  const typecheck = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: { typecheck: string } })
    .scripts.typecheck
  const projects = [...typecheck.matchAll(/-p (\S+)/g)].map(m => m[1]!.replace(/\/tsconfig\.json$/, ""))
  const configs = folders.flatMap(name =>
    readdirSync(join(ADDED, name))
      .filter(f => /^tsconfig.*\.json$/.test(f))
      .map(f => relative(ROOT, join(ADDED, name, f)).replace(/\/tsconfig\.json$/, "")),
  )
  expect(configs.filter(c => !projects.includes(c))).toEqual([])
})

test("見本のフォルダは、見本（matomezu.json）か、対になる見本のある連携ポイント（<見本>-spec）", () => {
  expect(folders.filter(name => !plugins.includes(name) && !specs.includes(name))).toEqual([])
})

test("追加プラグインの見本はプラグイン API と連携ポイント（型だけ）を読み、見本どうしは読まない", () => {
  expect(added.length).toBeGreaterThan(0)
  expect(specs.length).toBeGreaterThan(0)
  const bad = added.flatMap(f => {
    const [own, ...rest] = f.rel.split("/")
    const isTest = rest[0] === "test"
    const view = isView(f.rel) && !isTest
    return readsOf(f.text)
      .filter(({ spec: s, typeOnly }) => {
        if (s.startsWith(".")) {
          const target = relative(ADDED, resolve(dirname(f.path), s))
          if (target.split("/")[0] !== own) return true
          // 見た目でないファイルは、自分の見た目（.tsx と ui.ts）も CSS も読まない（engine の入口が React を読まないように）
          const targetIsView = isView(target) || added.some(a => a.rel === `${target}.tsx`)
          return !view && !isTest && (s.endsWith(".css") || targetIsView)
        }
        const forViews = ["matomezu/ui", "react"]
        const forTests = ["matomezu/testing", "matomezu/ui", "bun:test", "@testing-library/react"]
        if (s === "matomezu") return false // zod も matomezu から読む
        if (s === "matomezu/catalog") return !typeOnly // 型の書き足しの先（ホストの実物の表に無いので、値では読めない）
        if (named(specs, s)) return !typeOnly // 連携ポイントは型だけ
        if (isTest) return !(forTests.includes(s) || named(answers(own!), s))
        return !(forViews.includes(s) && view)
      })
      .map(({ spec }) => `${f.rel} → ${spec}`)
  })
  expect(bad).toEqual([])
})

test("連携ポイントは型の宣言だけを持つ（最上位は declare module・import type・export type だけ）", () => {
  const files = added.filter(f => named(specs, f.rel.split("/")[0]!))
  expect(files.length).toBeGreaterThan(0)
  const bad = files.flatMap(f =>
    withoutDeclareModule(f.text)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map(line => line.replace(/\/\/.*$/, "").trim())
      .filter(line => line !== "" && !/^(import|export) type\b/.test(line))
      .map(line => `${f.rel}: ${line}`),
  )
  expect(bad).toEqual([])
})

// 骨組み: ステージ・ダイアログ・パネル・スクリーンアレンジメントなど、描いている場所（ui/scope.tsx）を置く側のファイルと、場所を名指す操作を、描いている場所に向けたフックにして出すファイル、
// ほかのスクリーン・ステージを名指す base の物（コマンドの screensOf・storeActionsOf と、useShowControlCenter など）。ここに無いファイルは、場所を id で名指さない
// （プラグイン API で名指せるのは、スクリーンアレンジメントのウィジェットの中の useArrangedScreens・ScreenView だけで、外では E128）
const FRAMES = [
  "book-new/useCreateBook.tsx",
  "context-menu/ContextMenuHost.tsx",
  "dialog-host/DialogHost.tsx",
  "left-side-panel/LeftSidePanel.tsx",
  "left-side-panel/hooks.tsx",
  "library/open-from.ts",
  "library/screen.ts",
  "mail/Bookmarks.tsx",
  "mail/MailDialog.tsx",
  "mail/MailWatch.tsx",
  "mail/bird-visit.tsx",
  "mail/hooks.tsx",
  "page-tabs/PageList.tsx",
  "page-tabs/useAddPage.tsx",
  "participant/JoinRequestWatch.tsx",
  "print-preview/PrintPreviewView.tsx",
  "print-preview/SheetFrame.tsx",
  "right-side-panel/RevealAndRestore.tsx",
  "right-side-panel/RightSidePanel.tsx",
  "right-side-panel/hooks.tsx",
  "scrap/ScrapForm.tsx",
  "scrap/ScrapView.tsx",
  "search/SearchDialog.tsx",
  "stage/StageView.tsx",
  "stage/index.ts",
  "tool-picker/ToolPickerView.tsx",
  "utils/open-dialog-in-recent-stage.tsx",
  "stand/reveal-request.tsx",
  "window/ScreensView.tsx",
  "window/WindowView.tsx",
  "window/index.ts",
  "window/show-control-center.tsx",
  "window/useScreenSplit.tsx",
  "workspace/WorkspaceView.tsx",
].map(f => `plugins/base/${f}`)

test("場所（ステージ・スクリーン）を id で名指すのは土台と base の骨組みだけ（場所を置く物・id を取るフック・場所を引数に取る素の操作・向け先のステージの id・ほかのスクリーンの並びを、ほかは使わない）", () => {
  const names =
    /\b(StageScope|PageScope|ActsOnScope|ArrangedProvider|useStoreActions|useStageId|screensOf|arrangementValueIn|storeActionsOf|updatePluginStateAtOf)\b|ui\/at-hooks"/
  const users = sources
    .filter(f => !["ui", "store"].includes(crateOf(f.rel)) && names.test(f.text))
    .map(f => f.rel)
    .sort()
  expect(users).toEqual([...FRAMES].sort())
})
