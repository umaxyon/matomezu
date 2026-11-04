// 物の画面に出す名前を読むフック（引き方は labels.ts）
import { useMemo } from "react"
import { useMessages } from "../../../ui/i18n"
import { useBook, useCoreCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { anchorLabel } from "./labels"

// ステージ stage のブックの物 id の、画面に出す名前（種類の名前は今の言葉で。ブックに無ければ id）
export function useAnchorName(stage: string, id: string): string {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const book = useBook(stage)
  return useMemo(() => {
    const label = anchorLabel(catalog, book, id)
    return !label ? id : "text" in label ? label.text : t(label.title as Parameters<typeof t>[0])
  }, [catalog, book, id, t])
}
