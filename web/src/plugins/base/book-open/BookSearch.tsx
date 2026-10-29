// ブックを探して選ぶコンポーネント: 打つたびに題名で絞り込み、↑↓で選び、Enter かクリックで決める。
// 候補の一覧は高さが決まっていて、絞り込んでもコンポーネントの大きさは変わらない（真ん中に置いても探すテキストFormが動かない）。
// 読めないブック（プラグインが無いなど）も名前で絞り込んで後ろに並べ、押せない行として開けない理由を添える。
// 読めるが一部のプラグインが無いブックは、名前の横に印を付ける。
// 並びは触れた（開いたか書いた）時刻の新しい順で、右の列にその時刻を「〜前」で出す（時刻を知らないブックは出さない）。
// onTrash を渡すと、ゴミ箱に入れられるブック（canTrash）の行にポインタを乗せている間、ゴミ箱のボタンを出す（入れられない行も同じ幅を空け、時刻の列をそろえる）
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { bookTitle } from "../../../core/book"
import type { Book } from "../../../core/schema/book"
import type { Warning } from "../../../core/warnings"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import { useElapsed } from "../utils/ui"
import styles from "./BookSearch.module.css"
import { matchesQuery, searchBooks } from "./book-search"
import { TrashIcon } from "./TrashIcon"

export function BookSearch({
  onSelect,
  onTrash,
  canTrash = () => false,
  autoFocus = false,
}: {
  onSelect: (book: string) => void
  onTrash?: (book: string) => void
  canTrash?: (book: Book) => boolean
  autoFocus?: boolean
}) {
  const books = useMatomezuState(useShallow(s => Object.values(s.books)))
  const unreadable = useMatomezuState(s => s.unreadable)
  const partial = useMatomezuState(s => s.partial)
  const lang = useMatomezuState(s => s.lang)
  const touched = useMatomezuState(s => s.touched)
  const elapsed = useElapsed()
  const catalog = useCatalog().core
  const t = useMessages(kit)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const listId = useId()
  const activeRef = useRef<HTMLDivElement>(null)
  const found = searchBooks(catalog, books, query, lang, touched)
  const broken = unreadable.filter(n => matchesQuery(n.params.title ?? "", query))
  const reason = (n: Warning) =>
    n.code === "W004"
      ? t("Cannot open: there is no book type {type}", { type: n.params.type ?? "" })
      : n.code === "W005"
        ? t("Cannot open: it does not fit the book type {type}", { type: n.params.type ?? "" })
        : t("Cannot open: it breaks the rules of the book type {type}", { type: n.params.type ?? "" })
  const current = Math.min(active, found.length - 1)
  const optionId = (i: number) => `${listId}-${i}`

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest" })
  })

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 日本語の変換中のキー（変換を確定する Enter など）は、候補の操作にしない
    if (e.nativeEvent.isComposing || found.length === 0) return
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      const step = e.key === "ArrowDown" ? 1 : -1
      setActive((current + step + found.length) % found.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const book = found[current]
      if (book) onSelect(book.id)
    }
  }

  return (
    <div className={styles.search}>
      <input
        className={styles.input}
        type="text"
        role="combobox"
        aria-label={t("Search books")}
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={current >= 0 ? optionId(current) : undefined}
        placeholder={t("Search by book name")}
        autoComplete="off"
        // biome-ignore lint/a11y/noAutofocus: 探すテキストFormを出したら、すぐ打てるようにする
        autoFocus={autoFocus}
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
      />
      <div className={styles.results}>
        <div className={styles.list} id={listId} role="listbox" aria-label={t("Books")}>
          {found.map((b, i) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: キーでの操作は探すテキストForm（combobox）が受け持つ
            <div
              key={b.id}
              ref={i === current ? activeRef : undefined}
              id={optionId(i)}
              role="option"
              tabIndex={-1}
              aria-selected={i === current}
              className={styles.option}
              onPointerDown={e => e.preventDefault()}
              onPointerMove={() => setActive(i)}
              onClick={() => onSelect(b.id)}
            >
              <span className={styles.title}>
                {bookTitle(catalog, b, lang)}
                {partial.some(n => n.params.book === b.id) && (
                  <span className={styles.partial}>{t("Some parts cannot be shown")}</span>
                )}
              </span>
              {touched[b.id] !== undefined && <span className={styles.when}>{elapsed(touched[b.id] as string)}</span>}
              {onTrash && !canTrash(b) && <span className={styles.trash} />}
              {onTrash && canTrash(b) && (
                <button
                  type="button"
                  className={styles.trash}
                  aria-label={t("Move to trash")}
                  title={t("Move to trash")}
                  onClick={e => {
                    e.stopPropagation()
                    onTrash(b.id)
                  }}
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
          {broken.map(n => (
            <div
              key={n.params.book}
              role="option"
              tabIndex={-1}
              aria-disabled="true"
              aria-selected={false}
              className={styles.broken}
            >
              <span>{n.params.title || t("Untitled ({id})", { id: n.params.book ?? "" })}</span>
              <span className={styles.reason}>{reason(n)}</span>
            </div>
          ))}
        </div>
        {found.length === 0 && broken.length === 0 && <p className={styles.empty}>{t("No matching books")}</p>}
      </div>
    </div>
  )
}
