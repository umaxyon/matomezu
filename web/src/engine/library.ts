// ブックと書庫の確かめと整え: 残したブック・フォルダの行の確かめ・システムフォルダ・読めない物のフォルダへの出し入れと完全に消す行。
// 台帳アセンブルの結果（Assembled）は、呼ぶたびに引数で受ける

import { checkBooks, checkOutsidePages } from "../core/book"
import type { CoreCatalog } from "../core/core-catalog"
import { namingOf } from "../core/entries"
import { BROKEN, UNREADABLE_ID, unreadableFolderOf } from "../core/folders"
import { rowsHoldTree } from "../core/folders-tree"
import { translate } from "../core/i18n/i18n"
import { restoreSettings, type Settings } from "../core/settings"
import { purgedRows, type RowWrites, settleLibrary, unreadableWarning } from "../core/unreadable"
import { type Warning, warning, warningText } from "../core/warnings"
import type { Assembled } from "../store/plugin"
import { type RowChange, rowChanges } from "./wire"

declare const crypto: { randomUUID(): string }

// engine.ts の matomezuCheckBooks の中身
// warning 1 つを、常駐が持つ形にする: entry は warning の付くステージエントリ（ブックか、ブックの外のページ）の id
const entryLine = (n: Warning, unreadable: boolean) => ({
  entry: n.params.book ?? n.params.page ?? "",
  code: n.code,
  warning: warningText(n),
  unreadable,
})

export function checkBookLines(of: Assembled, books: string): string {
  const read = checkBooks(of.catalog.core, JSON.parse(books) as unknown[])
  return JSON.stringify([...read.warnings.map(n => entryLine(n, true)), ...read.partial.map(n => entryLine(n, false))])
}

// engine.ts の matomezuCheckOutsidePages の中身
export function checkOutsidePageLines(of: Assembled, pages: string): string {
  return JSON.stringify(checkOutsidePages(of.catalog.core, JSON.parse(pages) as unknown[]).map(n => entryLine(n, false)))
}

// engine.ts の matomezuCheckLibrary の中身
export function checkLibraryLine(folders: string, pages: string): string {
  return rowsHoldTree(JSON.parse(folders) as unknown[], JSON.parse(pages) as string[])
    ? ""
    : warningText(warning("W030", "", {}))
}

// engine.ts の matomezuSystemFolderTitles の中身
export function systemFolderTitlesOf(of: Assembled): string {
  const { messages, systemFolders } = of.catalog.core
  return JSON.stringify(
    Object.fromEntries([...systemFolders.values()].map(d => [d.id, translate(messages, "en", d.title)])),
  )
}

// engine.ts の matomezuSettleLibrary の中身
export function settleLibraryOf(of: Assembled, pages: string, folders: string, settings: string, now: string): string {
  const catalog = of.catalog.core
  const done = settleLibrary(catalog, JSON.parse(pages) as unknown[], JSON.parse(folders) as unknown[], {
    naming: namingOf(catalog, restoreSettings(JSON.parse(settings))),
    now,
    newId: () => crypto.randomUUID(),
  })
  if (done === BROKEN) return JSON.stringify({ broken: true })
  return JSON.stringify({
    ...rowWrites(done.writes),
    moved: done.moved.map(u => ({ id: u.element.id, code: u.code, ...(u.type === undefined ? {} : { type: u.type }) })),
    returned: done.returned,
    added: done.added,
    numbered: done.numbered.map(n => ({ id: n.id, title: n.title })),
    warning: warningLineOf(done.writes.folders[UNREADABLE_ID], JSON.parse(folders) as unknown[]),
  })
}

// engine.ts の matomezuMovedIfOff の中身: 機能台帳 catalog（無効にした追加プラグインを外して台帳アセンブルした結果）で整えたら、読めない物のフォルダへ移る物（移す順。書かない）
export function movedIfOffOf(
  catalog: CoreCatalog,
  pages: string,
  folders: string,
  settings: Settings,
  now: string,
): string {
  const done = settleLibrary(catalog, JSON.parse(pages) as unknown[], JSON.parse(folders) as unknown[], {
    naming: namingOf(catalog, settings),
    now,
    newId: () => crypto.randomUUID(),
  })
  if (done === BROKEN) return JSON.stringify({ broken: true })
  return JSON.stringify({
    moved: done.moved.map(u => ({
      id: u.element.id,
      kind: u.element.kind,
      holder: u.holder,
      code: u.code,
      ...(u.type === undefined ? {} : { type: u.type }),
    })),
  })
}

// 書庫を整えるのに失敗した訳 reason（常駐が渡す。engine: 整える関数が失敗した・broken: 読めない物のフォルダの行が形に合わない・write: 書き込みが失敗した）ごとの、warning W033 に書く言い方
const SETTLE_FAILURES: Readonly<Record<"engine" | "broken" | "write", string>> = {
  engine: "engine failed",
  broken: "the unreadable folder does not fit its shape",
  write: "could not write",
}

// engine.ts の matomezuSettleFailed の中身
export function settleFailedLine(reason: string): string {
  return warningText(
    warning("W033", "", {
      reason: Object.hasOwn(SETTLE_FAILURES, reason) ? SETTLE_FAILURES[reason as keyof typeof SETTLE_FAILURES] : reason,
    }),
  )
}

// engine.ts の matomezuPurgedRows の中身
export function purgedRowsOf(pages: string, folders: string, id: string): string {
  const rows = JSON.parse(folders) as unknown[]
  const done = purgedRows(JSON.parse(pages) as unknown[], rows, id)
  if (!done) return JSON.stringify({ none: true })
  return JSON.stringify({ ...rowWrites(done), warning: warningLineOf(done.folders[UNREADABLE_ID], rows) })
}

// 書く行の変わり writes を、engine の Output の pages・folders の形にした物（id の順）
function rowWrites(writes: RowWrites): { pages: RowChange[]; folders: RowChange[] } {
  const of = (puts: Readonly<Record<string, unknown>>, gone: readonly string[]) =>
    [...rowChanges(puts), ...gone.map(id => ({ id, removed: true as const }))].sort((a, b) => a.id.localeCompare(b.id))
  return { pages: of(writes.pages, writes.removedPages), folders: of(writes.folders, writes.removedFolders) }
}

// 書いた後の読めない物のフォルダの行 written（書かなければ、置き場所の行 folders の物）の warning W032 の 1 行（読めない物が無ければ空）
function warningLineOf(written: unknown, folders: readonly unknown[]): string {
  const folder = unreadableFolderOf(written === undefined ? folders : [written])
  const found = folder === BROKEN ? undefined : unreadableWarning(folder)
  return found ? warningText(found) : ""
}
