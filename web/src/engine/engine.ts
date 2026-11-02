// 常駐（Go）の中で動くアクションの入口: ビルトインプラグインで機能台帳を組み、JSON で受けた世界（ブックと設定）にアクションを行い、変わったものを JSON で返す。
// 常駐は、これをまとめたファイル（internal/engine/engine.js。bun run build:engine）を埋め込み、goja で動かす。
// 追加プラグインは、常駐が変換した JS を同じ goja で動かして受け取り、matomezuUse でビルトインプラグインに足して組み直す。
// 追加プラグインが借りる実物（plugin-modules）は、読み込んだときに globalThis.__matomezuModules に置く（変換した JS はここから取り出す）
// 画面と同じ performIn を使うので、画面で先に行ったアクションを常駐で行い直すと同じ結果になる（振る id は ids で受ける）
import { z } from "zod"
import { type Annotations, annotationsForAi, checkAnnotations, restoreAnnotations } from "../core/annotation"
import { checkBooks, restoreBooks } from "../core/book"
import { PALETTE, PALETTE_MEANINGS } from "../core/color"
import type { CoreCatalog } from "../core/core-catalog"
import { detectLang, translate } from "../core/i18n/i18n"
import { splitId } from "../core/names"
import { type PerformedIn, performIn } from "../core/perform"
import type { Book, Page } from "../core/schema/book"
import { aiSettings, langOf, restoreSettings, settingSchema } from "../core/settings"
import { WARNINGS, warning, warningText } from "../core/warnings"
import { MODULES, UI_NAMES } from "../plugin-modules"
import { BUILTIN } from "../plugins"
import { type GrowRule, textColorRef } from "../plugins/base"
import { MASTER_BOOK } from "../plugins/books/master"
import { type Assembled, assemble, type Plugin, warningsOf } from "../store/plugin"

;(globalThis as { __matomezuModules?: unknown }).__matomezuModules = MODULES

let assembled = assemble(BUILTIN, MASTER_BOOK.id)

// 追加プラグインを足して組み直す。新しい組で MCP 公開ツールの actions が返す物まで作り終えてから入れ替える（途中で投げれば、前の組み立てのまま）。
// 返すのは JSON: warnings は warning の 1 行ずつ（常駐がログに書く）、ai は新しい組の MCP 公開ツールの actions が返す物
function use(added: readonly Plugin[]): string {
  const next = assemble([...BUILTIN, ...added], MASTER_BOOK.id)
  const ai = aiCatalog(next)
  assembled = next
  return JSON.stringify({ warnings: warningsOf(next.catalog).map(warningText), ai })
}

// 受けるもの。books は対象のアクションが要るブック（一覧のアクションなら全部）、ids は振る id のもと（画面で先に行ったときの値。尽きたら randomUUID）
interface Input {
  action: string
  args: unknown
  on?: { book: string }
  lang?: string // 画面で先に行ったときの言語。無ければ（AI が頼んだときなど）設定の言語の項目で決める
  ids?: string[]
  now?: string // 画面で先に行った時点。無ければ（AI が頼んだときなど）ここで決める
  books?: unknown[]
  settings: unknown
  annotations?: Readonly<Record<string, unknown>> // 要るブックのアノテーション（ブックの id → 並び）
  by?: "ai" // 頼んだのが AI か（無ければ利用者）
}

// 返すもの。books は変わった・足したブック、removed は一覧から無くなったブック、annotations はアノテーションが変わったブックの id → 新しい並び（空なら全部無くなった）。
// 断ったら、detail に AI への説明（MCP 公開ツールが理由に添えて AI に返す）。認可ステップが止めたら（denied）、permission にそのステップの id
type Output =
  | {
      ok: true
      result: unknown
      books: Book[]
      removed: string[]
      settings?: unknown
      annotations?: Annotations
      notice?: string
    }
  | { ok: false; reason: string; permission?: string; detail?: string }

declare const crypto: { randomUUID(): string }

// 理由ごとの AI への説明
const AI_REFUSALS: Record<Exclude<PerformedIn, { ok: true }>["reason"], string> = {
  unknown: "there is no action with that id (see actions)",
  "bad-args": "the args do not match the action's args (see actions)",
  "not-allowed": "this book's type (or, for the library and the settings, the home book's type) does not allow it",
  refused: "the action's rules refuse it (for example the page or item does not exist); read_book to check",
  denied: "a permission step stopped it",
  "no-book": "there is no book with that id (see list_books)",
}

// 断りに、AI への説明を添える
function refusal(catalog: CoreCatalog, done: Exclude<PerformedIn, { ok: true }>): Output {
  if ("permission" in done)
    return {
      ...done,
      detail: `by ${done.permission}: ${catalog.permissions.get(done.permission)?.aiDescription ?? AI_REFUSALS.denied}`,
    }
  if ("setting" in done && done.setting !== undefined) {
    const detail =
      done.because === "user-only"
        ? `the setting ${done.setting} is changed only by the user; ask the user in the chat`
        : `the home book's type keeps the setting ${done.setting} fixed`
    return { ok: false, reason: done.reason, detail }
  }
  return { ok: false, reason: done.reason, detail: AI_REFUSALS[done.reason] }
}

function perform(input: Input): Output {
  const { home } = assembled
  const catalog = assembled.catalog.core
  const settings = restoreSettings(input.settings)
  const lang = input.lang ? detectLang([input.lang], [...catalog.languages.keys()]) : langOf(catalog, settings, "en")
  const ids = [...(input.ids ?? [])]
  const books = Object.fromEntries(restoreBooks(catalog, input.books ?? []).map(b => [b.id, b]))
  const annotations = Object.fromEntries(
    Object.entries(input.annotations ?? {}).map(([book, list]) => [book, restoreAnnotations(list)]),
  )
  const done = performIn({ books, settings, annotations }, input.action, input.args, input.on, {
    catalog,
    home,
    lang,
    newId: () => ids.shift() ?? crypto.randomUUID(),
    now: input.now ?? new Date().toISOString(),
    ...(input.by === "ai" ? { by: "ai" as const } : {}),
  })
  if (!done.ok) return refusal(catalog, done)
  const next = done.books
  const changed = done.book ? [done.book] : Object.values(next ?? {}).filter(b => books[b.id] !== b)
  const removed = next ? Object.keys(books).filter(id => !(id in next)) : []
  const notice = shiftNotice(books, changed)
  return {
    ok: true,
    result: done.result,
    books: changed,
    removed,
    ...(done.settings ? { settings: done.settings } : {}),
    ...(done.annotations ? { annotations: done.annotations } : {}),
    ...(notice ? { notice } : {}),
  }
}

// 中身をずらした可変ページ（ページの shift が変わった）があれば、AI への知らせ（位置が変わったので読み直す）
function shiftNotice(before: Readonly<Record<string, Book>>, changed: readonly Book[]): string | null {
  const shiftOf = (b: Book | undefined, page: string) =>
    (b && "pages" in b ? (b.pages as readonly Page[]).find(p => p.id === page)?.shift : undefined) ?? { x: 0, y: 0 }
  const moved = changed.flatMap(b =>
    "pages" in b
      ? (b.pages as readonly Page[]).flatMap(p => {
          const was = shiftOf(before[b.id], p.id)
          const now = shiftOf(b, p.id)
          const dx = now.x - was.x
          const dy = now.y - was.y
          return dx || dy ? [`page ${p.id} of book ${b.id} by ${dx} paper(s) right and ${dy} down`] : []
        })
      : [],
  )
  return moved.length
    ? `The contents of a variable page were shifted by whole papers, so every position there changed (${moved.join("; ")}); read_book before using positions.`
    : null
}
// MCP 公開ツールの actions が返す物: 機能台帳から AI に見せるアクション（利用者だけのアクションは除く）・ブックのタイプ・アイテム・利用者の設定の項目（利用者だけが変える項目は除く）・テーマ・代表色を絞って書き出したもの。
// args・props・設定の項目の schema は JSON Schema。名前は英語
// ブックのタイプのページの grows に書ける値（aiCatalog）
const growsOf = (rule: GrowRule | undefined): readonly string[] | true | null =>
  !rule ? null : "choices" in rule ? rule.choices : true

function aiCatalog(of: Assembled = assembled) {
  const catalog = of.catalog.core
  const en = (key: string) => translate(catalog.messages, "en", key as never)
  return {
    actions: [...catalog.actions.values()]
      .filter(a => !a.userOnly)
      .map(a => ({
        id: a.id,
        target: a.target,
        title: en(a.title),
        description: a.aiDescription,
        args: z.toJSONSchema(a.describeArgs?.(catalog) ?? a.args, { io: "input", unrepresentable: "any" }),
      })),
    bookTypes: [...catalog.bookTypes.values()].map(t => ({
      id: t.id,
      title: en(t.title),
      creatable: !t.single, // book-create で作れるか（1 冊だけのタイプは作れない）
      pages: t.pages !== null,
      // ページの grows に書ける値: 利用者が選べる増やす向きの一覧（最初のものが既定）、タイプが向きを決めるなら true、可変ページを作れなければ null
      grows: t.pages ? growsOf(t.grow) : null,
      items: t.items.allowed, // ページに置けるアイテム
    })),
    items: [...catalog.items.values()].map(i => ({
      id: i.id,
      kind: i.kind, // shape は置く形、connector は 2 つの形をつなぐもの
      title: en(i.title),
      size: i.kind === "shape" ? i.size : null,
      props: z.toJSONSchema(i.props, { io: "input", unrepresentable: "any" }),
    })),
    // 利用者の設定の項目（settings-set で変え、read_settings で読む）
    settings: [...catalog.userSettings.values()]
      .filter(d => !d.userOnly)
      .map(d => ({
        id: d.id,
        title: en(d.title),
        schema: z.toJSONSchema(settingSchema(catalog, d), { io: "input", unrepresentable: "any" }),
      })),
    // アノテーションの種類（read_book・read_page の annotations と view の awaiting の annotation は、この id）
    annotations: [...catalog.annotations.values()].map(a => ({
      id: a.id,
      title: en(a.title),
      description: a.aiDescription,
      props: z.toJSONSchema(a.props, { io: "input", unrepresentable: "any" }),
    })),
    themes: [...catalog.themes.values()].map(th => ({ id: th.id, title: en(th.title) })),
    // 言語パック（言語の項目の値は、この id）とスキン
    languages: [...catalog.languagePacks.values()].map(p => ({ id: p.id, lang: p.lang, name: p.name })),
    skins: [...catalog.skins.keys()],
    colors: PALETTE.map(id => ({ id, meaning: PALETTE_MEANINGS[id] })),
    // 本文の装飾の文字の色（name は本文に書く名前: {name:文字}）
    textColors: [...catalog.textColors.values()].map(c => ({
      id: c.id,
      name: textColorRef(c.id),
      meaning: c.aiDescription,
    })),
  }
}

;(globalThis as { matomezuModuleNames?: () => string }).matomezuModuleNames = () =>
  JSON.stringify({ engine: Object.keys(MODULES), ui: UI_NAMES })

;(globalThis as { matomezuUse?: (added: readonly Plugin[]) => string }).matomezuUse = use

;(globalThis as { matomezuAiCatalog?: () => string }).matomezuAiCatalog = () => JSON.stringify(aiCatalog())

// AI が読む設定（MCP 公開ツールの read_settings）: 残した設定から、利用者だけが変える項目と機能台帳に無い項目を除き、値が無いか形に合わない項目は既定にする
;(globalThis as { matomezuReadSettings?: (settings: string) => string }).matomezuReadSettings = settings =>
  JSON.stringify(aiSettings(assembled.catalog.core, restoreSettings(JSON.parse(settings))))

// 残したブックを今の機能台帳で確かめ、warning のあるブック（読めない W004〜W006・一部に無い物がある W007）の id・番号・warning の 1 行と、
// 読めないか（unreadable）を返す（常駐が一覧に持つ）
;(globalThis as { matomezuCheckBooks?: (books: string) => string }).matomezuCheckBooks = books => {
  const { warnings, partial } = checkBooks(assembled.catalog.core, JSON.parse(books) as unknown[])
  return JSON.stringify(
    [...warnings.map(n => [n, true] as const), ...partial.map(n => [n, false] as const)].map(([n, unreadable]) => ({
      book: n.params.book ?? "",
      code: n.code,
      warning: warningText(n),
      unreadable,
    })),
  )
}

// 残したアノテーションを今の機能台帳で確かめ、効かないもの（種類が無い W018・形が合わない W019）の warning の 1 行ずつを返す（常駐がログに書く）。
// 読めないブックのアノテーションは確かめない
;(globalThis as { matomezuCheckAnnotations?: (pairs: string) => string }).matomezuCheckAnnotations = pairs => {
  const catalog = assembled.catalog.core
  const lines = (JSON.parse(pairs) as { book: unknown; annotations: unknown }[]).flatMap(p => {
    const [book] = restoreBooks(catalog, [p.book])
    return book ? checkAnnotations(catalog, book, restoreAnnotations(p.annotations)).map(warningText) : []
  })
  return JSON.stringify(lines)
}

// ブックとそのアノテーションの並びごとに、AI に見せる並び（annotationsForAi。結び付く物の最後のあるページと、AI の応えを待っているか）を返す。
// 読めないブックのアノテーションは、ページが分からず待たないものとして返す
;(globalThis as { matomezuAiAnnotations?: (pairs: string) => string }).matomezuAiAnnotations = pairs => {
  const catalog = assembled.catalog.core
  const out = (JSON.parse(pairs) as { book: unknown; annotations: unknown }[]).map(p => {
    const list = restoreAnnotations(p.annotations)
    const [book] = restoreBooks(catalog, [p.book])
    return book ? annotationsForAi(catalog, book, list) : list.map(a => ({ ...a, page: null, awaits: false }))
  })
  return JSON.stringify(out)
}

// アノテーションの並びから、プラグイン plugin が足した種類（種類の id の持ち主が plugin）の物を除く（利用者がプラグインを外したときに常駐が消す）
;(globalThis as { matomezuAnnotationsWithout?: (plugin: string, list: string) => string }).matomezuAnnotationsWithout =
  (plugin, list) => {
    const all = restoreAnnotations(JSON.parse(list))
    const kept = all.filter(a => splitId(String(a.annotation)).owner !== plugin)
    return JSON.stringify({ annotations: kept, changed: kept.length !== all.length })
  }

// 画面が見つけて送ってきた warning（{code, plugin, params} の並び）を、warning の表の 1 行ずつにする（常駐が集めてログと AI に出す）。
// 表に無い番号・形の合わないものは捨てる（画面が作った文は使わない）
const ScreenWarningSchema = z.object({
  code: z.string(),
  plugin: z.string(),
  params: z.record(z.string(), z.string()),
})
;(globalThis as { matomezuWarningLines?: (warnings: string) => string }).matomezuWarningLines = warnings => {
  const lines: string[] = []
  for (const raw of z.array(z.unknown()).catch([]).parse(JSON.parse(warnings))) {
    const n = ScreenWarningSchema.safeParse(raw)
    if (n.success && n.data.code in WARNINGS)
      lines.push(warningText(warning(n.data.code as keyof typeof WARNINGS, n.data.plugin, n.data.params)))
  }
  return JSON.stringify(lines)
}

// 常駐が呼ぶ口: JSON の文字列で受けて返す
;(globalThis as { matomezuPerform?: (input: string) => string }).matomezuPerform = input =>
  JSON.stringify(perform(JSON.parse(input) as Input))
