// ブックを探して選ぶコンポーネント: 打つたびに題名で絞り込み、↑↓で選び、Enter かクリックで決める。
// 候補の欄は高さが決まっていて、絞り込んでもコンポーネントの大きさは変わらない（真ん中に置いても探す欄が動かない）
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { bookTitle } from "../../../core/book"
import { searchBooks } from "../../../core/book-search"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { kit } from "../kit"
import styles from "./BookSearch.module.css"

export function BookSearch({ onSelect, autoFocus = false }: { onSelect: (book: string) => void; autoFocus?: boolean }) {
  const books = useMatomezuState(useShallow(s => Object.values(s.books)))
  const lang = useMatomezuState(s => s.settings.lang)
  const catalog = useCatalog().core
  const t = useMessages(kit)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const listId = useId()
  const activeRef = useRef<HTMLDivElement>(null)
  const found = searchBooks(catalog, books, query, lang)
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
        // biome-ignore lint/a11y/noAutofocus: 探す欄を出したら、すぐ打てるようにする
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
            // biome-ignore lint/a11y/useKeyWithClickEvents: キーでの操作は探す欄（combobox）が受け持つ
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
              {bookTitle(catalog, b, lang)}
            </div>
          ))}
        </div>
        {found.length === 0 && <p className={styles.empty}>{t("No matching books")}</p>}
      </div>
    </div>
  )
}
