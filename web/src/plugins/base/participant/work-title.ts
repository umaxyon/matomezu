// 作業名: 参加しているワークルームの名前と作業から作る、AI のセッション名に書く名前（例「sub5_work M-0167 名前」「sub5_work（空き）」）。
// 書くのは AI のプログラムのフックと、ADE のワークスペースの表示名（どちらもホストが行う）。利用者の設定の項目で、書くのを止められる
import { z } from "zod"
import type { CoreCatalog } from "../../../core/core-catalog"
import { translate } from "../../../core/i18n/i18n"
import type { RecordSource } from "../../../core/record-source"
import { langOf, type Settings, userSetting } from "../../../core/settings"
import { kit } from "../kit"
import { workroomWorkIn } from "./activity"

export const SESSION_RENAME = kit.defineSetting({
  id: "session-rename",
  title: "Name sessions by work",
  schema: z.boolean(),
  default: true,
  userOnly: true, // 利用者が自分の見え方のために決める（AI が読む設定にも出さず、AI に変えさせない）
})

const IDLE_TITLE = kit.message("{name} (idle)")

// 作業名。off は、利用者の設定が書くのを止めている（名前を書かない）
export type WorkTitle = { kind: "title"; title: string } | { kind: "off" }

// 利用者の設定 settings で、ワークルーム（id と名前 name）に参加しているセッションの作業名。
// 作業中なら名前と作業の題名、作業が無ければ空きと添え、作業を答える種類が無ければ名前だけ
export function workTitleIn(
  catalog: CoreCatalog,
  settings: Settings,
  source: RecordSource,
  workroom: { id: string; name: string },
): WorkTitle {
  if (userSetting(catalog, settings, SESSION_RENAME.id) === false) return { kind: "off" }
  const work = workroomWorkIn(catalog, source, workroom.id)
  if (work === "unknown") return { kind: "title", title: workroom.name }
  if (work.kind === "working") return { kind: "title", title: `${workroom.name} ${work.title}` }
  return {
    kind: "title",
    title: translate(catalog.messages, langOf(catalog, settings, "en"), IDLE_TITLE, { name: workroom.name }),
  }
}
