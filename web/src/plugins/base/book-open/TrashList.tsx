// ゴミ箱の一覧: ゴミ箱のブックを入れた時刻の新しい順に並べ、右の列にその時刻を「〜前」で出す。
// 行ごとに戻すボタン（book-restore）と消すボタン（book-purge。上に重ねたモーダルで確かめてから。戻せないため）、
// 上の行にゴミ箱を空にするボタン（trash-empty。同じく確かめる）。行えないボタンは押せず、断られたらトーストで知らせる
import { useState } from "react"
import type { Book } from "../../../core/schema/book"
import { useMessages } from "../../../ui/i18n"
import { useActions, useCatalog, useMatomezuState } from "../../../ui/store-context"
import { useAllowedOn } from "../../../ui/view-hooks"
import { Confirm } from "../dialog-host/Confirm"
import { ActionButton } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { refusalMessage } from "../utils"
import { useElapsed } from "../utils/ui"
import styles from "./BookSearch.module.css"
import { bookTitle } from "./book-title"
import { BOOK_PURGE, BOOK_RESTORE, TRASH_EMPTY, trashOrder } from "./book-trash"

export function TrashList() {
  const trash = trashOrder(useMatomezuState(s => s.trash))
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
          {trash.map(b => (
            <TrashRow
              key={b.id}
              book={b}
              onRestore={() => run(BOOK_RESTORE.id, { book: b.id }, "Could not restore")}
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
            else run(BOOK_PURGE.id, { books: [confirming.book] }, "Could not delete")
            setConfirming(null)
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}

// ゴミ箱の 1 行: 戻すボタンと消すボタンは、そのブックに行えるときだけ押せる
function TrashRow({ book, onRestore, onDelete }: { book: Book; onRestore: () => void; onDelete: () => void }) {
  const elapsed = useElapsed()
  const catalog = useCatalog().core
  const lang = useMatomezuState(s => s.lang)
  const t = useMessages(kit)
  const restorable = useAllowedOn(BOOK_RESTORE.id, { book: book.id }).ok
  const deletable = useAllowedOn(BOOK_PURGE.id, { books: [book.id] }).ok
  return (
    <li className={styles.trashed}>
      <span className={styles.title}>{bookTitle(catalog, book, lang)}</span>
      <span className={styles.when}>{elapsed(book.trashed ?? "")}</span>
      <ActionButton disabled={!restorable} onClick={onRestore}>
        {t("Restore")}
      </ActionButton>
      <ActionButton danger disabled={!deletable} onClick={onDelete}>
        {t("Delete")}
      </ActionButton>
    </li>
  )
}

// 一覧が対象のアクションを行う関数: 断られたら断りをトーストに出す（refused は断りの理由が無いときの文言）
function useLibraryPerform(): (action: string, args: unknown, refused: Parameters<typeof kit.message>[0]) => void {
  const { perform, showToast } = useActions()
  const catalog = useCatalog().core
  const run = perform as (
    action: string,
    args: unknown,
  ) => { ok: true } | { ok: false; reason: string; permission?: string }
  return (action, args, refused) => {
    const done = run(action, args)
    if (!done.ok) showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message(refused)) })
  }
}
