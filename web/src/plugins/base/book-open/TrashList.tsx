// ゴミ箱の一覧: ゴミ箱のブックを入れた時刻の新しい順に並べ、右の列にその時刻を「〜前」で出す。
// 行ごとに戻すボタン（book-restore）と消すボタン（book-purge。上に重ねたモーダルで確かめてから。戻せないため）、
// 上の行にゴミ箱を空にするボタン（trash-empty。同じく確かめる）
import { useState } from "react"
import { bookTitle } from "../../../core/book"
import { useMessages } from "../../../ui/i18n"
import { useActions, useCatalog, useMatomezuState } from "../../../ui/store-context"
import { Confirm } from "../dialog-host/Confirm"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { useElapsed } from "../utils/ui"
import styles from "./BookSearch.module.css"
import { BOOK_PURGE, BOOK_RESTORE, TRASH_EMPTY, trashOrder } from "./book-trash"

export function TrashList() {
  const trash = trashOrder(useMatomezuState(s => s.trash))
  const { perform } = useActions()
  const elapsed = useElapsed()
  const catalog = useCatalog().core
  const lang = useMatomezuState(s => s.lang)
  const t = useMessages(kit)
  // 確かめている削除（ブック 1 冊か、ゴミ箱を空にする）
  const [confirming, setConfirming] = useState<{ book: string } | "all" | null>(null)
  return (
    <div className={styles.search}>
      <div className={styles.trashHead}>
        <ActionButton danger disabled={trash.length === 0} onClick={() => setConfirming("all")}>
          {t("Empty trash")}
        </ActionButton>
      </div>
      <div className={styles.results}>
        <ul className={styles.list} aria-label={t("Trash")}>
          {trash.map(b => (
            <li key={b.id} className={styles.trashed}>
              <span className={styles.title}>{bookTitle(catalog, b, lang)}</span>
              <span className={styles.when}>{elapsed(b.trashed ?? "")}</span>
              <ActionButton onClick={() => perform(BOOK_RESTORE.id, { book: b.id })}>{t("Restore")}</ActionButton>
              <ActionButton danger onClick={() => setConfirming({ book: b.id })}>
                {t("Delete")}
              </ActionButton>
            </li>
          ))}
        </ul>
        {trash.length === 0 && <p className={styles.empty}>{t("The trash is empty")}</p>}
      </div>
      {confirming && (
        <Confirm
          message={
            confirming === "all"
              ? t("Every book in the trash will be deleted for good")
              : t("The book will be deleted for good")
          }
          ok={t("Delete")}
          cancel={t("Cancel")}
          onOk={() => {
            if (confirming === "all") perform(TRASH_EMPTY.id, {})
            else perform(BOOK_PURGE.id, { books: [confirming.book] })
            setConfirming(null)
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}
