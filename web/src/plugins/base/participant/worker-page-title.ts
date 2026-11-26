// ワーカーブックのページの名前: 作業のレコードのワーカーブック（tickets-history の中の、workKey が作業のレコードのブック）の名前は、その作業のレコードの
// 短く呼ぶ名前（チケットの番号。workRecordName の label）なので、ページの名前に同じ番号を写させない認可ステップ。
// 足した・名前が変わった・ほかの所から入ったページの名前が、そのブックの今の短く呼ぶ名前で始まっていたら止める（すぐ後ろが数字なら、別の番号として通す）。
// ワークルーム自身のワーカーブック（名前がワークルームの名前）とバインダの名前は見ない。どの入口から入っても、行った後の keeps が止める

import { pagesOf } from "../../../core/book"
import type { PermissionCheck, PermissionInput } from "../../../core/def/permission"
import { kit } from "../kit"
import { TICKETS_HISTORY } from "../library/backyards"
import { workRecordNameOf, workRecordNameReadsOf } from "./activity"
import { WORKROOM } from "./workroom"

// 名前 title が、短く呼ぶ名前 label で始まるか（すぐ後ろが数字なら、別の番号なので違う）
export const startsWithLabel = (title: string, label: string): boolean =>
  label !== "" && title.startsWith(label) && !/^[0-9]/.test(title.slice(label.length))

// 確かめ c が、作業のレコードのワーカーブックのページに、その短く呼ぶ名前で始まる名前を付けていないか
function keeps(c: PermissionCheck, input: PermissionInput): boolean {
  if (c.kind !== "folder" || !c.after) return true
  const entry = c.backyardEntry.after
  if (entry?.backyard !== TICKETS_HISTORY.id || entry.workKey === undefined || entry.workKey.subject === WORKROOM.id)
    return true
  const label = workRecordNameOf(input.catalog, input.read, entry.workKey)?.label ?? ""
  if (label === "") return true
  const named = new Set(
    c.changes.pages
      .filter(
        p => p.change === "added" || p.change === "movedIn" || (p.change === "changed" && p.fields.includes("title")),
      )
      .map(p => p.id),
  )
  return !pagesOf(c.after).some(p => named.has(p.id) && startsWithLabel(p.title, label))
}

export const WORKER_PAGE_TITLE = kit.definePermission({
  id: "worker-page-title",
  title: "A page's name cannot start with the book's name",
  aiDescription:
    "the page's name starts with the name of its worker book (the short name of the work, such as the ticket's number); the book's name shows it already, so name the page without it",
  readsSubjects: workRecordNameReadsOf,
  denies: () => false,
  keeps,
})
