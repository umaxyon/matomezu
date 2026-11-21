// セッション名: AI のセッション（会話）の名前を、参加しているワークルームの名前と作業から作る（例「sub5_work M-0167 名前」「sub5_work（空き）」）。
// 書くのは AI のプログラムのフックと、AI を並べて起動する道具の表示名（どちらもホストが行う）。利用者の設定の項目で、書き換えを止められる
import { z } from "zod"
import type { CoreCatalog } from "../../../core/core-catalog"
import { translate } from "../../../core/i18n/i18n"
import type { RecordSource } from "../../../core/record-source"
import { langOf, type Settings, userSetting } from "../../../core/settings"
import { kit } from "../kit"
import { workroomWorkIn } from "./activity"

export const SESSION_RENAME = kit.defineSetting({
  id: "session-rename",
  title: "Rename sessions",
  schema: z.boolean(),
  default: true,
  userOnly: true, // 利用者が自分の見え方のために決める（AI が読む設定にも出さず、AI に変えさせない）
})

const IDLE_TITLE = kit.message("{name} (idle)")

// 利用者の設定 settings で、ワークルーム（id と名前 name）に参加しているセッションの名前（書き換えを止めていれば off）。
// 作業中なら名前と作業の題名、空きなら空きの印、作業を答える種類が無ければ名前だけ
export function sessionTitleIn(
  catalog: CoreCatalog,
  settings: Settings,
  source: RecordSource,
  workroom: { id: string; name: string },
): string | "off" {
  if (userSetting(catalog, settings, SESSION_RENAME.id) === false) return "off"
  const work = workroomWorkIn(catalog, source, workroom.id)
  if (work === "unknown") return workroom.name
  if (work.kind === "working") return `${workroom.name} ${work.title}`
  return translate(catalog.messages, langOf(catalog, settings, "en"), IDLE_TITLE, { name: workroom.name })
}
