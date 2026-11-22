// 描いている場所のステージで開いている、ブックの外のバインダ（中のページごと。ブックやブックの外のページを開いている・何も開いていなければ null）
import { outsideBinderIn } from "../../../core/folders-tree"
import type { BinderEntry } from "../../../core/schema/book"
import { useStageHere } from "../../../ui/scope"

export function useOutsideBinder(): BinderEntry | null {
  return useStageHere((st, s) => {
    const entry = st?.opened?.outermost
    return (entry?.kind === "binder" && outsideBinderIn(s, entry.id)) || null
  })
}
