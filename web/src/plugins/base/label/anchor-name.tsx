// 物の画面に出す名前を読むフック（引き方は labels.ts）
import { useMemo } from "react"
import { useMessages } from "../../../ui/i18n"
import { useCoreCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { useOpenedPages } from "../utils/useOpenedPages"
import { anchorLabel } from "./labels"

// 描いている場所のステージで開いている物（ブックか、ブックの外のページ）の物 id の、画面に出す名前（種類の名前は今の言葉で。そこに無ければ id）
export function useAnchorName(id: string): string {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const pages = useOpenedPages()
  return useMemo(() => {
    const label = anchorLabel(catalog, pages, id)
    return !label ? id : "text" in label ? label.text : t(label.title as Parameters<typeof t>[0])
  }, [catalog, pages, id, t])
}
