// 常駐（Go）の中で動くアクションの入口: 中の部品で登録表を組み、JSON で受けた世界（ブックと設定）にアクションを行い、変わったものを JSON で返す。
// 常駐は、これをまとめたファイル（internal/engine/engine.js。bun run build:engine）を埋め込み、goja で動かす。
// 画面と同じ performIn を使うので、画面で先に行ったアクションを常駐で行い直すと同じ結果になる（振る id は ids で受ける）
import { restoreBooks } from "../core/book"
import { detectLang } from "../core/i18n/i18n"
import { NO_KEY_CHANGES } from "../core/keys"
import { performIn } from "../core/perform"
import type { Book } from "../core/schema/book"
import { restoreSettings } from "../core/settings"
import { BUILTIN } from "../plugins"
import { assemble } from "../store/plugin"

const { registry, home } = assemble(BUILTIN, "master")

// 受けるもの。books は対象のアクションが要るブック（一覧のアクションなら全部）、ids は振る id のもと（画面で先に行ったときの値。尽きたら randomUUID）
interface Input {
  action: string
  args: unknown
  on?: { book: string }
  lang: string
  ids?: string[]
  books?: unknown[]
  settings: unknown
}

// 返すもの。books は変わった・足したブック、removed は一覧から無くなったブック
type Output =
  | { ok: true; result: unknown; books: Book[]; removed: string[]; settings?: unknown }
  | { ok: false; reason: string }

declare const crypto: { randomUUID(): string }

function perform(input: Input): Output {
  const lang = detectLang([input.lang], [...registry.languages.keys()])
  const ids = [...(input.ids ?? [])]
  const books = Object.fromEntries(restoreBooks(registry, input.books ?? []).map(b => [b.id, b]))
  const settings = restoreSettings(registry, { lang, skin: "auto", keys: NO_KEY_CHANGES }, input.settings)
  const done = performIn({ books, settings }, input.action, input.args, input.on, {
    registry,
    home,
    lang,
    newId: () => ids.shift() ?? crypto.randomUUID(),
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
// 常駐が呼ぶ口: JSON の文字列で受けて返す
;(globalThis as { matomezuPerform?: (input: string) => string }).matomezuPerform = input =>
  JSON.stringify(perform(JSON.parse(input) as Input))
