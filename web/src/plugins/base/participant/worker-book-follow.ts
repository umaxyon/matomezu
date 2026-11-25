// ワーカーブックの片付けと名前: tickets-history のブックを、持ち主のレコード（workKey が指すワークルームや、作業のレコード）の変わりに応じて直すフォローステップ。
// ワークルームが消えたら（ワークルームを消した・引き継がずに入り直した）そのワークルーム自身のブックを、作業のレコードが消えたらそのレコードのブックを完全に消す。
// 作業が終わったら（completesWork）、その作業のレコードのブックのアノテーションを消す（ブックは残る）。
// ブックの名前は、ワークルームの名前か作業のレコードの短く呼ぶ名前（worker-book.ts の workerBookOf）の写しなので、それが変わったら同じ書き込みで直す。
// あわせて、作業のレコードの種類（workroomWorkSubjects）が completesWork と workRecordName を持つかの台帳アセンブルの確かめ
import type { CatalogCheckDef, CoreCatalog } from "../../../core/core-catalog"
import type { AnyRecordRead, RecordRead } from "../../../core/def/action"
import type { BackyardFollow, FollowedChange, FollowStepDef } from "../../../core/def/follow-step"
import { problem } from "../../../core/errors"
import type { RecordReader } from "../../../core/record-source"
import { TICKETS_HISTORY } from "../library/backyards"
import { workRecordNameOf } from "./activity"
import { WORKROOM } from "./workroom"

declare module "../../../core/catalog" {
  interface SubjectExtras {
    // このレコードの before（作ったなら none）から after への変わりで、そのレコードに取り組む作業が終わったか（例: チケットが完了した）。
    // 終わったら、そのレコードのワーカーブックのアノテーションを消す。workroomWork が答えるレコードの種類が書く。
    // record は completesWorkReads に書いた物を読む口（無ければ none）
    completesWork?(before: unknown, after: unknown, record: (subject: string, id: string) => unknown): boolean
    // completesWork が読む物（種類と id。種類の id から型を引くと、対象の定義の型が自分を指すので、型の付かない形で書く）
    completesWorkReads?(before: unknown, after: unknown): readonly { subject: string; id: string }[]
    // このレコードの before（作ったなら none）から after（消したなら removed）への変わりで、短く呼ぶ名前（workRecordName の label）が
    // 変わり得る作業のレコードと、その名前を引くのに読む物（reads の形。変わったこのレコード自身は足さなくてよい）。変わり得なければ空。
    // 作業のレコードの名前が依る種類（作業のレコードの種類自身と、workRecordNameReads の種類）が書く。読んだ物のうち workRecordName を持つ種類のレコードの
    // ワーカーブックの名前を、今の短く呼ぶ名前に直す
    workRecordsRenamedBy?(before: unknown, after: unknown): readonly AnyRecordRead[]
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

// ワークルームの作業を答える種類が workroomWorkSubjects に書いた種類が、どれも機能台帳に在って completesWork と workRecordName を持つか
// （無ければ片付かないワーカーブックか、名前の無いワーカーブックができる）
export const WORK_SUBJECTS_CHECK: CatalogCheckDef = catalog =>
  [...catalog.subjects.values()].flatMap(s =>
    s.workroomWork
      ? (s.workroomWorkSubjects ?? []).flatMap(ref => {
          const work = catalog.subjects.get(ref)
          return work?.completesWork && work.workRecordName ? [] : [problem("E133", { id: s.id, ref })]
        })
      : [],
  )

// ワークルームが消えたら、そのワークルーム自身のブックを完全に消す（チケットのブックは残る）。名前が変わったら、そのブックの名前を直す
export const FOLLOW_WORKROOM: FollowStepDef<typeof WORKROOM.id> = {
  watches: WORKROOM.id,
  writes: [],
  backyards: [TICKETS_HISTORY.id],
  follow: change => {
    if (change.after === "removed") return purgedOn(change as FollowedChange)
    if (change.before !== "none" && change.before.name === change.after.name) return {}
    return {
      backyard: [
        {
          backyard: TICKETS_HISTORY.id,
          key: { subject: WORKROOM.id, id: change.id },
          does: "retitle",
          title: change.after.name,
        },
      ],
    }
  },
}

// 種類 subject の変わり change で名前が変わり得る作業のレコードを読む物（workRecordsRenamedBy。空でなければ、変わったレコード自身も読む）
function renamedReads(change: FollowedChange, catalog: CoreCatalog): readonly AnyRecordRead[] {
  const reads = catalog.subjects.get(change.subject)?.workRecordsRenamedBy?.(change.before, change.after) ?? []
  return reads.length === 0 ? [] : [{ subject: change.subject, id: change.id }, ...reads]
}

// 作業のレコードの短く呼ぶ名前が変わり得る変わり（workRecordsRenamedBy が答える）で、読んだ作業のレコードのワーカーブックの名前を、今の名前に直す
// （今と同じ名前なら、core が変えない。ブックが無ければ何もしない）
export const FOLLOW_WORK_RENAMED: FollowStepDef = {
  watches: { having: "workRecordsRenamedBy" },
  writes: [],
  backyards: [TICKETS_HISTORY.id],
  reads: (change, catalog) => renamedReads(change, catalog) as readonly RecordRead[],
  follow: (change, ctx) => {
    if (renamedReads(change, ctx.catalog).length === 0) return {}
    const read: RecordReader = { record: ctx.record, find: () => [] }
    const backyard: BackyardFollow[] = []
    for (const [subject, rows] of Object.entries(ctx.records)) {
      if (!ctx.catalog.subjects.get(subject)?.workRecordName) continue
      for (const id of Object.keys(rows ?? {})) {
        const name = workRecordNameOf(ctx.catalog, read, { subject, id })
        if (name && name.label !== "")
          backyard.push({ backyard: TICKETS_HISTORY.id, key: { subject, id }, does: "retitle", title: name.label })
      }
    }
    return { backyard }
  },
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
