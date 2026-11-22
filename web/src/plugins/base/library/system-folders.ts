// システムフォルダ: base のドキュメントとワークルーム。足りない行を足し、名前の当たる物に番号を付けるのは、core の読む関数（core/unreadable.ts の settleLibrary）

import type { PlaceFolder } from "../../../core/def/permission"
import { systemFolderOf } from "../../../core/folders-tree"
import { kit } from "../kit"

export const DOCUMENTS = kit.defineSystemFolder({
  id: "documents",
  title: "Documents",
  aiDescription: "The documents folder: a folder that is always at the top of the library home.",
})

// ワークルーム: 中には何も置かない。書庫の画面は、この下に参加しているワークルームごとの作業机を映して出す
export const WORKROOMS = kit.defineSystemFolder({
  id: "workrooms",
  title: "Workrooms",
  aiDescription:
    "The workrooms folder: it is always empty and nothing can be put in it. The user's library screen shows each workroom's work under it; add pages to your own with worker-page-add.",
})

// 書庫のフォルダの列 over（近い順）の、どれかがワークルームか
const underWorkrooms = (over: readonly PlaceFolder[] | "none"): boolean =>
  over !== "none" && over.some(f => systemFolderOf(f) === WORKROOMS.id)

// ワークルームの中: ワークルームとその下には、利用者も AI も物を入れない・作らない（中は書庫の画面が映す物だけ）
export const IN_WORKROOMS = kit.definePermission({
  id: "in-workrooms",
  title: "Nothing goes in the workrooms folder",
  aiDescription:
    "nothing can be put in or made in the workrooms folder; it only shows each workroom's work on the user's screen",
  denies: q => q.kind === "place" && underWorkrooms(q.into),
  keeps: c => c.kind !== "place" || !underWorkrooms(c.after),
})
