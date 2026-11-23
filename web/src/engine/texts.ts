// 常駐が利用者とログに出す文: 参加を利用者に伝える文と、窓が送ってきた warning の 1 行。
// 台帳アセンブルの結果（Assembled）は、呼ぶたびに引数で受ける

import { z } from "zod"
import { rowsLibraryOf } from "../core/folders-tree"
import { translate } from "../core/i18n/i18n"
import { sourceOf } from "../core/record-source"
import { langOf, restoreSettings } from "../core/settings"
import { WARNINGS, warning, warningText } from "../core/warnings"
import { JOINED_MESSAGE, myWorkdeskIn, VISITOR_JOINED_MESSAGE, workTitleIn } from "../plugins/base"
import type { Assembled } from "../store/plugin"
import { hostSource } from "./records"

// engine.ts の matomezuJoinedText の中身
export function joinedText(of: Assembled, settings: string, workroom: string): string {
  return translate(
    of.catalog.core.messages,
    langOf(of.catalog.core, restoreSettings(JSON.parse(settings)), "en"),
    JOINED_MESSAGE,
    { name: workroom },
  )
}

// engine.ts の matomezuVisitorJoinedText の中身
export function visitorJoinedText(of: Assembled, settings: string): string {
  return translate(
    of.catalog.core.messages,
    langOf(of.catalog.core, restoreSettings(JSON.parse(settings)), "en"),
    VISITOR_JOINED_MESSAGE,
  )
}

// engine.ts の matomezuWorkTitle の中身: ワークルーム（id と名前）に参加しているセッションの作業名（WorkTitle の JSON）。レコードはホストの読み口から引く
export function workTitle(of: Assembled, settings: string, workroom: string, name: string): string {
  // ホストの読み口が無ければ、レコードが無い物として作る（設定が止めていれば off のまま）
  const source = hostSource({}) ?? sourceOf({})
  return JSON.stringify(
    workTitleIn(of.catalog.core, restoreSettings(JSON.parse(settings)), source, { id: workroom, name }),
  )
}

// engine.ts の matomezuMyWorkdesk の中身: ワークルーム workroom の作業机（MyWorkdesk の JSON）。folders は書庫のフォルダの行の全部。レコードはホストの読み口から引く
export function myWorkdesk(of: Assembled, workroom: string, folders: string): string {
  const source = hostSource({}) ?? sourceOf({})
  const { folders: table } = rowsLibraryOf(JSON.parse(folders) as unknown[], {})
  return JSON.stringify(myWorkdeskIn(of.catalog.core, source, table, workroom))
}

const WindowWarningSchema = z.object({
  code: z.string(),
  plugin: z.string(),
  params: z.record(z.string(), z.string()),
})

// engine.ts の matomezuWarningLines の中身
export function windowWarningLines(warnings: string): string {
  const lines: string[] = []
  for (const raw of z.array(z.unknown()).catch([]).parse(JSON.parse(warnings))) {
    const n = WindowWarningSchema.safeParse(raw)
    if (n.success && Object.hasOwn(WARNINGS, n.data.code))
      lines.push(warningText(warning(n.data.code as keyof typeof WARNINGS, n.data.plugin, n.data.params)))
  }
  return JSON.stringify(lines)
}
