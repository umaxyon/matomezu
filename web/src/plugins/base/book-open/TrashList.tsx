// ゴミ箱の一覧: ゴミ箱のブックを入れた時刻の新しい順に並べ、右の列にその時刻を「〜前」で出す。
// 行ごとに戻すボタン（entry-restore）と消すボタン（entry-purge。上に重ねたモーダルで確かめてから。戻せないため）、
// 上の行にゴミ箱を空にするボタン（trash-empty。同じく確かめる）。行えないボタンは押せず、断られたらトーストで知らせる
import { useState } from "react"
import type { Book } from "../../../core/schema/book"
import { useMessages } from "../../../ui/i18n"
import { useMatomezuState } from "../../../ui/store-context"
import { useAllowedOn } from "../../../ui/view-hooks"
import { Confirm } from "../dialog-host/Confirm"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { ENTRY_PURGE, ENTRY_RESTORE, TRASH_EMPTY, trashOrder } from "../library/entry-trash"
import { useLibraryPerform } from "../library/useLibraryPerform"
import { useElapsed } from "../utils/ui"
import styles from "./BookSearch.module.css"

export function TrashList() {
  const books = useMatomezuState(s => s.trash)
  const folders = useMatomezuState(s => s.folders)
  const trash = trashOrder(books, folders)
  const run = useLibraryPerform()
  const t = useMessages(kit)
  const emptiable = useAllowedOn(TRASH_EMPTY.id, {}).ok
  // 確かめている削除（ブック 1 冊か、ゴミ箱を空にする）
  const [confirming, setConfirming] = useState<{ book: string } | "all" | null>(null)
  return (
    <div className={styles.search}>
      <div className={styles.trashHead}>
        <ActionButton danger disabled={trash.length === 0 || !emptiable} onClick={() => setConfirming("all")}>
          {t("Empty trash")}
        </ActionButton>
      </div>
      <div className={styles.results}>
        <ul className={styles.list} aria-label={t("Trash")}>
          {trash.map(({ book: b, trashed }) => (
            <TrashRow
              key={b.id}
              book={b}
              trashed={trashed}
              onRestore={() => run(ENTRY_RESTORE.id, { entry: b.id }, "Could not restore")}
              onDelete={() => setConfirming({ book: b.id })}
            />
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
            if (confirming === "all") run(TRASH_EMPTY.id, {}, "Could not delete")
            else run(ENTRY_PURGE.id, { entries: [confirming.book] }, "Could not delete")
            setConfirming(null)
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}

// ゴミ箱の 1 行（trashed は入れた時刻）: 戻すボタンと消すボタンは、そのブックに行えるときだけ押せる
function TrashRow({
  book,
  trashed,
  onRestore,
  onDelete,
}: {
  book: Book
  trashed: string
  onRestore: () => void
  onDelete: () => void
}) {
  const elapsed = useElapsed()
  const t = useMessages(kit)
  const restorable = useAllowedOn(ENTRY_RESTORE.id, { entry: book.id }).ok
  const deletable = useAllowedOn(ENTRY_PURGE.id, { entries: [book.id] }).ok
  return (
    <li className={styles.trashed}>
      <span className={styles.title}>{book.title}</span>
      <span className={styles.when}>{elapsed(trashed)}</span>
      <ActionButton disabled={!restorable} onClick={onRestore}>
        {t("Restore")}
      </ActionButton>
      <ActionButton danger disabled={!deletable} onClick={onDelete}>
        {t("Delete")}
      </ActionButton>
    </li>
  )
}
