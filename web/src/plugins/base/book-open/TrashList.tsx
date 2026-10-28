// ゴミ箱の一覧: ゴミ箱のブックを入れた時刻の新しい順に並べ、右の列にその時刻を「〜前」で出す。
// 行ごとに戻すボタンと消すボタン（消すのは上に重ねたモーダルで確かめてから。戻せないため）、上の行にゴミ箱を空にするボタン（同じく確かめる）
import { useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { useActions, useCatalog, useMatomezuState } from "../../../ui/store-context"
import { Confirm } from "../dialog-host/Confirm"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { useElapsed } from "../utils/ui"
import styles from "./BookSearch.module.css"
import { trashTitle } from "./book-trash"

export function TrashList() {
  const trash = useMatomezuState(s => s.trash)
  const { restoreBook, purgeBooks } = useActions()
  const elapsed = useElapsed()
  const catalog = useCatalog().core
  const lang = useMatomezuState(s => s.settings.lang)
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
              <span className={styles.title}>{trashTitle(catalog, b, lang) ?? t("Untitled ({id})", { id: b.id })}</span>
              <span className={styles.when}>{elapsed(b.at)}</span>
              <ActionButton onClick={() => restoreBook(b.id)}>{t("Restore")}</ActionButton>
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
            purgeBooks(confirming === "all" ? [] : [confirming.book])
            setConfirming(null)
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}
