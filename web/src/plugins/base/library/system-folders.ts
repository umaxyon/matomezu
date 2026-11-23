// システムフォルダ: base のドキュメントとワークルーム。足りない行を足し、名前の当たる物に番号を付けるのは、core の読む関数（core/unreadable.ts の settleLibrary）

import type { PlaceFolder } from "../../../core/def/permission"
import { systemFolderOf } from "../../../core/folders-tree"
import { kit } from "../kit"

export const DOCUMENTS = kit.defineSystemFolder({
  id: "documents",
  title: "Documents",
  aiDescription: "The documents folder: a folder that is always at the top of the library home.",
})

// AI の read_folder が、呼んだ AI 自身の作業机を指すのに受ける名前（作業机はデータに無い物なので、フォルダの id でない。常駐の ai_folder.go の myWorkdeskFolder と同じ）
export const MY_WORKDESK = "my-workdesk"

// ワークルーム: 中には何も置かない
export const WORKROOMS = kit.defineSystemFolder({
  id: "workrooms",
  title: "Workrooms",
  aiDescription: `The workrooms folder: nothing can be put in it. Read your workdesk with read_folder with folder "${MY_WORKDESK}".`,
})

// 書庫のフォルダの列 over（近い順）の、どれかがワークルームか
const underWorkrooms = (over: readonly PlaceFolder[] | "none"): boolean =>
  over !== "none" && over.some(f => systemFolderOf(f) === WORKROOMS.id)

// ワークルームの中: ワークルームのフォルダとその下には、利用者も AI も物を入れない・作らない
export const IN_WORKROOMS = kit.definePermission({
  id: "in-workrooms",
  title: "Nothing goes in the workrooms folder",
  aiDescription: "nothing can be put in or made in the workrooms folder",
  denies: q => q.kind === "place" && underWorkrooms(q.into),
  keeps: c => c.kind !== "place" || !underWorkrooms(c.after),
})
