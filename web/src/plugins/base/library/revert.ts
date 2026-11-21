// 書庫の履歴の段の置き直し（library-revert）: 書庫が対象のアクションの段が変えたページとフォルダごとに、変えた所だけを、前か後の値に置き直す
// （置き直す値は、ステージエントリの画面の履歴の段と同じ形。plugins/base/history/restore.ts）。今の書庫の上で行い、段が書いた値のままの所だけを置き直す。
// その間にほかの変更が同じ所を変えていれば、ぶつかりとして断る（core/folders-restore.ts の restoredTables）。置き直すと木の決まりや同じ名前の決まりを破るなら、
// 土台が断る（元の名前がほかの物に使われた、など）。置き直しても何も変わらなければ、断りの種類 REVERT_UNCHANGED で断る。利用者だけ（userOnly）
import { z } from "zod"
import { restoredTables } from "../../../core/folders-restore"
import type { HistoryStep } from "../../../core/history"
import { DECLINED_UNCHANGED, PatchSchema, patchesToward } from "../history/restore"
import { kit } from "../kit"

export const LibraryRevertArgs = z.strictObject({
  pages: z.record(z.string(), PatchSchema),
  folders: z.record(z.string(), PatchSchema),
})

export type LibraryRevertArgs = z.output<typeof LibraryRevertArgs>

// 書庫の履歴の段 step を、to の側（"before" なら戻す、"after" ならやり直す）へ置き直す引数
export const libraryRevertArgs = (step: HistoryStep, to: "before" | "after"): LibraryRevertArgs => ({
  pages: patchesToward(step.pages, to),
  folders: patchesToward(step.folders, to),
})

export const LIBRARY_REVERT = kit.defineAction({
  id: "library-revert",
  userOnly: true,
  history: false,
  aiDescription: "The library screen's undo and redo: put back what one step of the user's library history changed.",
  title: "Undo or redo",
  target: "library",
  permissionScope: "unknown", // 変えるブックは、置き直す値の中身で決まる（認可ステップは、行った後の確かめで止める）
  args: LibraryRevertArgs,
  run: (library, args) => {
    const next = restoredTables(library, args)
    if (next === library) return DECLINED_UNCHANGED
    return next && { next, result: {} }
  },
})
