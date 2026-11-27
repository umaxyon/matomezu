// 常駐が利用者とログに出す文: 参加を利用者に伝える文と、窓が送ってきた warning の 1 行。
// 台帳アセンブルの結果（Assembled）は、呼ぶたびに引数で受ける

import { z } from "zod"
import { rowsLibraryOf } from "../core/folders-tree"
import { translate } from "../core/i18n/i18n"
import { readerOf, sourceOf } from "../core/record-source"
import { langOf, restoreSettings } from "../core/settings"
import { WARNINGS, warning, warningText } from "../core/warnings"
import {
  JOINED_MESSAGE,
  leftTitleIn,
  myWorkdeskIn,
  READS_ADMIN,
  VISITOR_JOINED_MESSAGE,
  workroomActivitiesFrom,
  workShiftIn,
  workTitleIn,
} from "../plugins/base"
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

// engine.ts の matomezuIsAdminWorkroom の中身: ワークルーム（id）が、このホストの管理者のワークルームか（レコードはホストの読み口から引く）
export function isAdminWorkroom(of: Assembled, workroom: string): boolean {
  const source = hostSource({}) ?? sourceOf({})
  return readerOf(of.catalog.core, source, [READS_ADMIN.subject])
    .find(READS_ADMIN.subject, [])
    .some(m => {
      const mark = m as { workroom?: unknown; by?: unknown }
      return mark.workroom === workroom && mark.by === "user"
    })
}

// engine.ts の matomezuWorkTitle の中身: ワークルーム（id と名前）に参加しているセッションの作業名（WorkTitle の JSON）。レコードはホストの読み口から引く
export function workTitle(of: Assembled, settings: string, workroom: string, name: string): string {
  // ホストの読み口が無ければ、レコードが無い物として作る（設定が止めていれば off のまま）
  const source = hostSource({}) ?? sourceOf({})
  return JSON.stringify(
    workTitleIn(of.catalog.core, restoreSettings(JSON.parse(settings)), source, { id: workroom, name }),
  )
}

// engine.ts の matomezuLeftTitle の中身: ワークルームの名前 name から外れたセッションに書く名前（作業名ではない。WorkTitle の型の JSON）
export function leftTitle(of: Assembled, settings: string, name: string): string {
  return JSON.stringify(leftTitleIn(of.catalog.core, restoreSettings(JSON.parse(settings)), name))
}

// engine.ts の matomezuWorkShift の中身: ワークルーム workroom の今の作業と、前のターンの終わりの印 before から、今の作業が替わったかの答え（WorkShift の JSON）。レコードはホストの読み口から引く
export function workShift(of: Assembled, settings: string, workroom: string, before: string): string {
  const source = hostSource({}) ?? sourceOf({})
  return JSON.stringify(workShiftIn(of.catalog.core, restoreSettings(JSON.parse(settings)), source, workroom, before))
}

// engine.ts の matomezuMyWorkdesk の中身: ワークルーム workroom の作業机（MyWorkdesk の JSON）。folders は書庫のフォルダの行の全部。レコードはホストの読み口から引く
export function myWorkdesk(of: Assembled, workroom: string, folders: string): string {
  const source = hostSource({}) ?? sourceOf({})
  const { folders: table } = rowsLibraryOf(JSON.parse(folders) as unknown[], {})
  return JSON.stringify(myWorkdeskIn(of.catalog.core, source, table, workroom))
}

// engine.ts の matomezuWorkroomActivities の中身: ワークルームの id の並び workrooms（JSON）それぞれの作業の様子（id → working・idle・unknown の JSON）。レコードはホストの読み口から引く
export function workroomActivities(of: Assembled, workrooms: string): string {
  const source = hostSource({}) ?? sourceOf({})
  return JSON.stringify(workroomActivitiesFrom(of.catalog.core, source, JSON.parse(workrooms) as string[]))
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
