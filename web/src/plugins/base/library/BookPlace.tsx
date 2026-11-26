// 開いているブックとブックの外のバインダの置き場所の印（ウィジェット book-place）: ステージの下の行のブックの名前の枠の中、名前の前に出す 1 つのボタン。
// ブックは本の絵、バインダは入れるページのタイプの絵（名乗らないタイプはバインダの絵）。押すと書庫でその物の入っているフォルダを開き、その物を選ぶ（コマンド library-place-open）。
// 乗せると置き場所の道を出す。作業しているワークルームの鳥を出すワーカーブック（participant の worker-birds が置き場所を開く）・書庫の上に置き場所の無い物・ブックの外のページには出さない
import { NO_BOOK, NO_OUTSIDE_BINDER } from "../../../store/commands/def"
import { useMessages } from "../../../ui/i18n"
import { defineWidget } from "../../../ui/layout"
import { useUiCatalog } from "../../../ui/store-context"
import { useBook, useOutsideBinder } from "../../../ui/view-hooks"
import { BOOK_NAME_HEAD } from "../book-name/head"
import { kit } from "../kit"
import { useWorkerBirds } from "../participant/WorkerBirds"
import { BookIcon } from "../utils/book-icons"
import styles from "./BookPlace.module.css"
import { iconOf } from "./icons"
import { useOpenedPlace } from "./PagePlace"

function BookPlace() {
  const t = useMessages(kit)
  const at = useOpenedPlace()
  const book = useBook()
  const binder = useOutsideBinder()
  const birds = useWorkerBirds(book === NO_BOOK ? undefined : book.id).length > 0
  const typed = useUiCatalog().pageTypeIcons
  if (at === undefined || !at.tabbed || birds) return null
  const picture =
    book !== NO_BOOK ? (
      <BookIcon size={14} />
    ) : (
      (binder !== NO_OUTSIDE_BINDER && typed.get(binder.pageType)) || iconOf("binder")
    )
  return (
    <button
      type="button"
      className={styles.place}
      aria-label={t("Place: {path}", { path: at.whole })}
      title={at.whole}
      disabled={!at.open.enabled}
      onClick={() => at.open.run({ entry: at.entry })}
      data-book-place
    >
      {picture}
    </button>
  )
}

export const BOOK_PLACE = defineWidget({
  id: kit.name("book-place"),
  slots: [BOOK_NAME_HEAD],
  view: BookPlace,
})
