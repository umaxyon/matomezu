// 参照エントリのレイヤー（スロット book-layers に置くウィジェット）: ステージが参照エントリを開いている間（core/stage.ts の openedReference）、指す先のページを、
// 指す先のブックの見た目で、倍率 1 の紙の座標に見るだけで描く（ステージの外で見るだけに描くページ。ui/scope.tsx の PageScope。中からは何も行えず、ポインタも受けない）。
// 描いた広さはステージに知らせ（ずらす量の範囲と、全体を収める倍率はそれで決まる）、指す先が見えない・空のバインダなら、表示領域の真ん中に No Data を出して広さを捨てる
import { useCallback, useLayoutEffect } from "react"
import { useShallow } from "zustand/react/shallow"
import { findReference } from "../../../core/book"
import type { Size } from "../../../core/geom"
import { openablePage } from "../../../core/library"
import { referencePage } from "../../../core/references"
import { NO_REFERENCE, NO_STAGE, openedReference } from "../../../core/stage"
import { paperOrigin } from "../../../core/viewport"
import { useMessages } from "../../../ui/i18n"
import { PageScope } from "../../../ui/scope"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { useActions, useStage, useStagePan } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { pageArea } from "../place/grow"
import { DrawnSheet } from "../scrap/ScrapView"
import styles from "./ReferenceLayer.module.css"

export function ReferenceLayer() {
  const stage = useStage()
  const pan = useStagePan()
  const catalog = useCatalog().core
  const { setReferenceArea } = useActions()
  const t = useMessages(kit)
  const o = stage === NO_STAGE ? NO_REFERENCE : openedReference(stage.opened)
  // 見せるページと、その見た目と設定を持つステージエントリ（今そのページを持っている物から引く）
  const found = useMatomezuState(
    useShallow(s => {
      const book = o === NO_REFERENCE ? undefined : s.books[o.outermost.id]
      const ref = o === NO_REFERENCE || !book ? undefined : findReference(book, o.reference)
      const at = o !== NO_REFERENCE && ref ? openablePage(s, referencePage(s, ref, o.chosen)) : undefined
      return { outermost: at?.outermost.id ?? null, page: at?.page ?? null }
    }),
  )
  const report = useCallback((size: Size) => setReferenceArea(size), [setReferenceArea])
  const none = o !== NO_REFERENCE && (!found.outermost || !found.page)
  useLayoutEffect(() => {
    if (none) setReferenceArea(null)
  }, [none, setReferenceArea])
  if (stage === NO_STAGE || o === NO_REFERENCE || pan === NO_STAGE) return null
  const { outermost, page } = found
  if (!outermost || !page)
    return (
      <div className={styles.none} data-reference="none">
        {t("No Data")}
      </div>
    )
  const origin = paperOrigin(pan)
  return (
    <div
      className={styles.frame}
      data-reference="shown"
      style={{ transform: `translate(${origin.x}px, ${origin.y}px) scale(${stage.zoom})` }}
    >
      <PageScope outermost={outermost} page={page.id} zoom={stage.zoom}>
        <DrawnSheet key={`${o.reference}/${page.id}`} page={page} size={pageArea(catalog, page).size} onSize={report} />
      </PageScope>
    </div>
  )
}
