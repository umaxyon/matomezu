// しおりの置き場（ウィジェット bookmark-host。根に置く）: スロット bookmarks に置いたウィジェットが useShowBookmarks で渡したしおりを、画面の上の右寄りから、しおりのようにぶら下げる
// （マーキーは消えるが、しおりは片づくまで残る）。並べるのは MAX_BOOKMARKS まで（allotBookmarks）。並べきれなければ横に「+n」を出し、押すと、並べきれなかった物を持つウィジェットの
// 「残りを開く」を呼ぶ（無ければ、ほかのウィジェットの物）。置いたウィジェットのビューは何も描かない（しおりの殻・並べ方は、ここが描く）
import { createContext, type ReactNode, useContext, useEffect, useMemo, useSyncExternalStore } from "react"
import { fail } from "../../../core/errors"
import { useMessages } from "../../../ui/i18n"
import { useLayout, useUiCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import { Tip } from "../utils/Tip"
import { allotBookmarks } from "./allot"
import styles from "./Bookmarks.module.css"
import { BOOKMARKS } from "./slots"

// しおり 1 つ。at は ISO 8601 の時点（同じウィジェットの中で古い物を先に並べる）。title は指したときの文と読み上げ。face は帯に描く絵（18px 四方）。
// tone は帯の色の番号（0〜2。色 color を渡せばそちらを使い、ink はその上の文字の色）
export interface Bookmark {
  key: string
  at: string
  title: string
  face: ReactNode
  tone?: number
  color?: string
  ink?: string
  open: () => void
}

// ウィジェットごとに渡された物
interface Shown {
  bookmarks: readonly Bookmark[]
  openRest?: () => void
}

// 渡された物の表（置き場が 1 つ持つ）
interface Shelf {
  set(widget: string, shown: Shown): void
  remove(widget: string): void
  entries(): ReadonlyMap<string, Shown>
  subscribe(listener: () => void): () => void
}

function newShelf(): Shelf {
  let entries: ReadonlyMap<string, Shown> = new Map()
  const listeners = new Set<() => void>()
  const changed = () => {
    for (const l of listeners) l()
  }
  return {
    set: (widget, shown) => {
      entries = new Map(entries).set(widget, shown)
      changed()
    },
    remove: widget => {
      if (!entries.has(widget)) return
      const next = new Map(entries)
      next.delete(widget)
      entries = next
      changed()
    },
    entries: () => entries,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

const Context = createContext<{ shelf: Shelf; widget: string } | null>(null)

// スロット bookmarks に置いたウィジェットのビューが、出すしおりを渡す（ウィジェットの中で古い順に並べなくてよい）。openRest は、並べきれなかったときに「+n」で開く物（無くてもよい）。
// 置き場の外で呼ばれたら何もしない
export function useShowBookmarks(bookmarks: readonly Bookmark[], openRest?: () => void) {
  const at = useContext(Context)
  useEffect(() => {
    at?.shelf.set(at.widget, openRest ? { bookmarks, openRest } : { bookmarks })
  }, [at, bookmarks, openRest])
  useEffect(() => () => at?.shelf.remove(at.widget), [at])
}

export function BookmarkHost() {
  const placed: readonly string[] = useLayout().slots[BOOKMARKS] ?? []
  const shelf = useMemo(newShelf, [])
  return (
    <>
      {placed.map(id => (
        <Placed key={id} shelf={shelf} widget={id} />
      ))}
      <Hanging shelf={shelf} order={placed} />
    </>
  )
}

// 置いたウィジェット 1 つのビュー（何も描かず、しおりを渡す）
function Placed({ shelf, widget }: { shelf: Shelf; widget: string }) {
  const { widgets } = useUiCatalog()
  const value = useMemo(() => ({ shelf, widget }), [shelf, widget])
  const View = (widgets.get(widget)?.view ?? fail("E109", { kind: "widget", id: widget })) as () => ReactNode
  return (
    <Context.Provider value={value}>
      <View />
    </Context.Provider>
  )
}

// ぶら下げるしおり
function Hanging({ shelf, order }: { shelf: Shelf; order: readonly string[] }) {
  const t = useMessages(kit)
  const entries = useSyncExternalStore(shelf.subscribe, shelf.entries)
  const { shown, rest, hidden } = useMemo(
    () => allotBookmarks(order, new Map([...entries].map(([w, s]) => [w, s.bookmarks]))),
    [order, entries],
  )
  if (shown.length === 0) return null
  const openRest = [...hidden, ...order].map(w => entries.get(w)?.openRest).find(f => f !== undefined)
  const more = t("{n} more", { n: rest })
  return (
    <div className={styles.bookmarks}>
      {shown.map(({ widget, bookmark: b }) => (
        <Tip key={`${widget}:${b.key}`} text={b.title}>
          <button
            type="button"
            className={styles.bookmark}
            data-tone={b.tone ?? 0}
            style={
              b.color ? ({ "--bookmark-tone": b.color, "--bookmark-ink": b.ink } as React.CSSProperties) : undefined
            }
            aria-label={b.title}
            onClick={b.open}
          >
            {b.face}
          </button>
        </Tip>
      ))}
      {rest > 0 && (
        <Tip text={more}>
          <button
            type="button"
            className={styles.bookmark}
            data-tone={0}
            aria-label={more}
            disabled={!openRest}
            onClick={openRest}
          >
            <span className={styles.count}>+{rest}</span>
          </button>
        </Tip>
      )}
    </div>
  )
}
