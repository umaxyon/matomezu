// ワーカーブックの片付け: tickets-history のブックを、持ち主のレコード（workKey が指すワークルームや、作業のレコード）の変わりに応じて片付けるフォローステップ。
// ワークルームが消えたら（ワークルームを消した・引き継がずに入り直した）そのワークルーム自身のブックを、作業のレコードが消えたらそのレコードのブックを完全に消す。
// 作業が終わったら（completesWork）、その作業のレコードのブックのアノテーションを消す（ブックは残る）
import type { CatalogCheckDef } from "../../../core/core-catalog"
import type { RecordRead } from "../../../core/def/action"
import type { FollowedChange, FollowStepDef } from "../../../core/def/follow-step"
import { problem } from "../../../core/errors"
import { TICKETS_HISTORY } from "../library/backyards"
import { WORKROOM } from "./workroom"

declare module "../../../core/catalog" {
  interface SubjectExtras {
    // このレコードの before（作ったなら none）から after への変わりで、そのレコードに取り組む作業が終わったか（例: チケットが完了した）。
    // 終わったら、そのレコードのワーカーブックのアノテーションを消す。workroomWork が答えるレコードの種類が書く。
    // record は completesWorkReads に書いた物を読む口（無ければ none）
    completesWork?(before: unknown, after: unknown, record: (subject: string, id: string) => unknown): boolean
    // completesWork が読む物（種類と id。種類の id から型を引くと、対象の定義の型が自分を指すので、型の付かない形で書く）
    completesWorkReads?(before: unknown, after: unknown): readonly { subject: string; id: string }[]
  }
}

// 変わり change のレコードのワーカーブックを、完全に消す（レコードが消えたとき）
const purgedOn = (change: FollowedChange) =>
  change.after === "removed"
    ? {
        backyard: [
          { backyard: TICKETS_HISTORY.id, key: { subject: change.subject, id: change.id }, does: "purge" as const },
        ],
      }
    : {}

// ワークルームが消えたら、そのワークルーム自身のブックを完全に消す（チケットのブックは残る）
// ワークルームの作業を答える種類が workroomWorkSubjects に書いた種類が、どれも機能台帳に在って completesWork を持つか（無ければ片付かないワーカーブックができる）
export const WORK_SUBJECTS_CHECK: CatalogCheckDef = catalog =>
  [...catalog.subjects.values()].flatMap(s =>
    s.workroomWork
      ? (s.workroomWorkSubjects ?? []).flatMap(ref =>
          catalog.subjects.get(ref)?.completesWork ? [] : [problem("E133", { id: s.id, ref })],
        )
      : [],
  )

export const FOLLOW_WORKROOM_GONE: FollowStepDef<typeof WORKROOM.id> = {
  watches: WORKROOM.id,
  writes: [],
  backyards: [TICKETS_HISTORY.id],
  follow: change => purgedOn(change as FollowedChange),
}

// 作業のレコード（completesWork を持つ種類）が消えたらそのブックを完全に消し、作業が終わったらそのブックのアノテーションを消す
export const FOLLOW_WORK_ENDED: FollowStepDef = {
  watches: { having: "completesWork" },
  writes: [],
  backyards: [TICKETS_HISTORY.id],
  reads: (change, catalog) =>
    change.after === "removed"
      ? []
      : ((catalog.subjects.get(change.subject)?.completesWorkReads?.(change.before, change.after) ??
          []) as readonly RecordRead[]),
  follow: (change, ctx) => {
    if (change.after === "removed") return purgedOn(change)
    const ended =
      ctx.catalog.subjects.get(change.subject)?.completesWork?.(change.before, change.after, ctx.record) ?? false
    return ended
      ? {
          backyard: [
            {
              backyard: TICKETS_HISTORY.id,
              key: { subject: change.subject, id: change.id },
              does: "clear-annotations",
            },
          ],
        }
      : {}
  },
}
