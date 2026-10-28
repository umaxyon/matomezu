// 常駐（Go）の中で動くアクションの入口: ビルトインプラグインで機能台帳を組み、JSON で受けた世界（ブックと設定）にアクションを行い、変わったものを JSON で返す。
// 常駐は、これをまとめたファイル（internal/engine/engine.js。bun run build:engine）を埋め込み、goja で動かす。
// 追加プラグインは、常駐が変換した JS を同じ goja で動かして受け取り、matomezuUse でビルトインプラグインに足して組み直す。
// 追加プラグインが借りる実物（plugin-modules）は、読み込んだときに globalThis.__matomezuModules に置く（変換した JS はここから取り出す）
// 画面と同じ performIn を使うので、画面で先に行ったアクションを常駐で行い直すと同じ結果になる（振る id は ids で受ける）
import { z } from "zod"
import { checkBooks, restoreBooks } from "../core/book"
import { PALETTE, PALETTE_MEANINGS } from "../core/color"
import { detectLang, translate } from "../core/i18n/i18n"
import { NO_KEY_CHANGES } from "../core/keys"
import { performIn } from "../core/perform"
import type { Book } from "../core/schema/book"
import { NO_TEXT_COLORS, restoreSettings } from "../core/settings"
import { WARNINGS, warning, warningText } from "../core/warnings"
import { MODULES, UI_NAMES } from "../plugin-modules"
import { BUILTIN } from "../plugins"
import { textColorRef } from "../plugins/base"
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
  lang: string
  ids?: string[]
  now?: string // 画面で先に行った時点。無ければ（AI が頼んだときなど）ここで決める
  books?: unknown[]
  settings: unknown
}

// 返すもの。books は変わった・足したブック、removed は一覧から無くなったブック
type Output =
  | { ok: true; result: unknown; books: Book[]; removed: string[]; settings?: unknown }
  | { ok: false; reason: string }

declare const crypto: { randomUUID(): string }

function perform(input: Input): Output {
  const { home } = assembled
  const catalog = assembled.catalog.core
  const lang = detectLang([input.lang], [...catalog.languages.keys()])
  const ids = [...(input.ids ?? [])]
  const books = Object.fromEntries(restoreBooks(catalog, input.books ?? []).map(b => [b.id, b]))
  const settings = restoreSettings(
    catalog,
    { lang, skin: "auto", keys: NO_KEY_CHANGES, textColors: NO_TEXT_COLORS },
    input.settings,
  )
  const done = performIn({ books, settings }, input.action, input.args, input.on, {
    catalog,
    home,
    lang,
    newId: () => ids.shift() ?? crypto.randomUUID(),
    now: input.now ?? new Date().toISOString(),
  })
  if (!done.ok) return done
  const next = done.books
  const changed = done.book ? [done.book] : Object.values(next ?? {}).filter(b => books[b.id] !== b)
  const removed = next ? Object.keys(books).filter(id => !(id in next)) : []
  return {
    ok: true,
    result: done.result,
    books: changed,
    removed,
    ...(done.settings ? { settings: done.settings } : {}),
  }
}
// MCP 公開ツールの actions が返す物: 機能台帳から AI に見せるアクション・ブックのタイプ・アイテム・テーマ・代表色を絞って書き出したもの。args と props は JSON Schema。名前は英語
function aiCatalog(of: Assembled = assembled) {
  const catalog = of.catalog.core
  const en = (key: string) => translate(catalog.messages, "en", key as never)
  return {
    actions: [...catalog.actions.values()].map(a => ({
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
      items: t.items.allowed, // ページに置けるアイテム
    })),
    items: [...catalog.items.values()].map(i => ({
      id: i.id,
      kind: i.kind, // shape は置く形、connector は 2 つの形をつなぐもの
      title: en(i.title),
      size: i.kind === "shape" ? i.size : null,
      props: z.toJSONSchema(i.props, { io: "input", unrepresentable: "any" }),
    })),
    themes: [...catalog.themes.values()].map(th => ({ id: th.id, title: en(th.title) })),
    languages: [...catalog.languages.keys()],
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

// 残したブックを今の機能台帳で確かめ、warning のあるブック（読めない W004〜W006・一部に無い物がある W007）の id・番号・warning の 1 行を返す（常駐が一覧に持つ）
;(globalThis as { matomezuCheckBooks?: (books: string) => string }).matomezuCheckBooks = books => {
  const { warnings, partial } = checkBooks(assembled.catalog.core, JSON.parse(books) as unknown[])
  return JSON.stringify(
    [...warnings, ...partial].map(n => ({ book: n.params.book ?? "", code: n.code, warning: warningText(n) })),
  )
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
