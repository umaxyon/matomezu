// 検索ダイアログ（ウィジェット search-dialog。根のスロットに置く）: 検索を開いているステージ（カレントのステージを先に）の検索を、画面の上に浮かぶダイアログで見せる。
// ほかの操作を止めない（ページをスクロールしたり書いたりできる。外を押しても閉じない）。見出しを掴んで動かせ、動かした所は閉じても覚える。
// 探す字・置き換える字・切り替え（大文字小文字・正規表現・範囲・端で回る）は base のプラグイン状態（state.ts）に書き、
// 変えたら今の当たりを選び直す（計算は search.ts）。次・前・置換・閉じるはコマンド（index.ts）。入力Formは検索のキーの範囲を名乗る

import { type PointerEvent, useEffect, useRef } from "react"
import type { Point } from "../../../core/geom"
import { NO_PAGE } from "../../../core/stage"
import { recentBookScreen } from "../../../core/window"
import { NO_BOOK } from "../../../store/commands/def"
import { pluginValueOf } from "../../../store/plugin-state"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { usePluginState, useSetPluginState } from "../../../ui/plugin-state-hooks"
import { StageScope } from "../../../ui/scope"
import { useMatomezuState } from "../../../ui/store-context"
import { useBook, useCoreCatalog, usePage, useStage } from "../../../ui/view-hooks"
import { controlClass } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { DRAG_START } from "../utils/drag"
import { stagePageId } from "../utils/opened-page"
import { useOpenedPages } from "../utils/useOpenedPages"
import {
  SEARCH_CLOSE,
  SEARCH_KEY_SCOPE,
  SEARCH_NEXT,
  SEARCH_PREVIOUS,
  SEARCH_REPLACE_ALL,
  SEARCH_REPLACE_ONE,
} from "./index"
import styles from "./SearchDialog.module.css"
import { changedSearch, searchableOf, searchCount } from "./search"
import { SEARCH_AT_STATE, SEARCH_STATE, type SearchOpen } from "./state"
import { useReadSearchHere, useSearchHere } from "./useSearchHere"

// 開いたことの無いときの、窓の右上からの位置
const FIRST_AT = { right: 24, top: 64 }

export function SearchDialogHost() {
  const stage = useMatomezuState(s => {
    const open = (id: string) => pluginValueOf(s.pluginValues, id, SEARCH_STATE) !== undefined
    const ws = recentBookScreen(s.window)?.stages
    if (!ws) return null
    if (open(ws.current)) return ws.current
    return ws.stages.find(st => open(st.id))?.id ?? null
  })
  // 中の物の描いている場所を、検索を開いたステージにする
  return stage ? (
    <StageScope stage={stage}>
      <SearchDialog key={stage} stage={stage} />
    </StageScope>
  ) : null
}

function SearchDialog({ stage }: { stage: string }) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const book = useBook()
  const page = usePage()
  const within = useOpenedPages()
  const view = useStage()
  const opened = stagePageId(view)
  const search = useSearchHere()
  const at = usePluginState(kit, SEARCH_AT_STATE)
  const readSearch = useReadSearchHere()
  const setSearch = useSetPluginState(kit, SEARCH_STATE)
  const setAt = useSetPluginState(kit, SEARCH_AT_STATE)
  const next = useCommand(SEARCH_NEXT.id)
  const previous = useCommand(SEARCH_PREVIOUS.id)
  const close = useCommand(SEARCH_CLOSE.id)
  const replaceOne = useCommand(SEARCH_REPLACE_ONE.id)
  const replaceAll = useCommand(SEARCH_REPLACE_ALL.id)
  const find = useRef<HTMLInputElement>(null)
  const replace = useRef<HTMLInputElement>(null)
  // 開くたびに、開き方の入力Formに焦点を当てて中の字を選ぶ（打つ・切り替えるたびには当てない）
  const openedN = search?.opened
  const focus = search?.focus
  useEffect(() => {
    if (openedN === undefined) return
    const el = focus === "replace" ? replace.current : find.current
    el?.focus()
    el?.select()
  }, [openedN, focus])
  if (page === NO_PAGE) return null
  const s = searchableOf(catalog, page)
  if (!search || s === "none") return null
  // 探せるページの全部: 開いている物のページの全部
  const counted = searchCount(catalog, within, search, opened)
  const bad = counted.kind === "bad-pattern"
  const count =
    counted.kind === "bad-pattern"
      ? t("{at}/{all}", { at: 0, all: 0 })
      : counted.pages === "none" || counted.pages.at === 0
        ? t("{at}/{all}", { at: counted.at, all: counted.all })
        : t("{at}/{all} (page {page} of {pages})", {
            at: counted.at,
            all: counted.all,
            page: counted.pages.at,
            pages: counted.pages.all,
          })
  const none = counted.kind === "bad-pattern" || counted.all === 0

  // 検索を change で変える（探す字か切り替えが変われば、今の当たりを選び直す。search.ts の changedSearch）
  const update = (change: Partial<SearchOpen>) => {
    const was = readSearch()
    if (was) setSearch(changedSearch(catalog, within, was, change, opened))
  }
  const query = (change: Partial<SearchOpen["query"]>) => update({ query: { ...search.query, ...change } })

  return (
    <div
      role="dialog"
      aria-label={t("Search dialog")}
      className={styles.dialog}
      data-key-scope={SEARCH_KEY_SCOPE.id}
      style={at ? { left: at.x, top: at.y } : { right: FIRST_AT.right, top: FIRST_AT.top }}
    >
      <Head title={t("Search")} closeLabel={t("Close search")} onClose={() => close.run()} onMove={p => setAt(p)} />
      <div className={styles.row}>
        <label className={styles.label} htmlFor={`${stage}-search-find`}>
          {t("Find")}
        </label>
        <input
          id={`${stage}-search-find`}
          ref={find}
          className={`${controlClass} ${styles.input}`}
          value={search.query.text}
          aria-invalid={bad}
          data-key-scope={SEARCH_KEY_SCOPE.id}
          onChange={e => query({ text: e.target.value })}
        />
        <span className={styles.count} data-search-count>
          {count}
        </span>
      </div>
      <div className={styles.row}>
        <label className={styles.label} htmlFor={`${stage}-search-replace`}>
          {t("Replace with")}
        </label>
        <input
          id={`${stage}-search-replace`}
          ref={replace}
          className={`${controlClass} ${styles.input}`}
          value={search.replacement}
          data-key-scope={SEARCH_KEY_SCOPE.id}
          onChange={e => update({ replacement: e.target.value })}
        />
      </div>
      <div className={styles.buttons}>
        <button type="button" className={styles.button} disabled={!previous.enabled} onClick={() => previous.run()}>
          ↑ {t("Previous hit")}
        </button>
        <button type="button" className={styles.button} disabled={!next.enabled} onClick={() => next.run()}>
          ↓ {t("Next hit")}
        </button>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.button}
          disabled={!replaceOne.enabled || none}
          onClick={() => replaceOne.run()}
        >
          {t("Replace one")}
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={!replaceAll.enabled || none}
          onClick={() => replaceAll.run()}
        >
          {t("Replace all")}
        </button>
      </div>
      <div className={styles.row}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={search.query.caseSensitive}
            onChange={e => query({ caseSensitive: e.target.checked })}
          />
          {t("Match case")}
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={search.query.regex} onChange={e => query({ regex: e.target.checked })} />
          {t("Regular expression")}
        </label>
      </div>
      <div className={styles.row} role="radiogroup" aria-label={t("Scope")}>
        <span className={styles.label}>{t("Scope")}</span>
        {(book !== NO_BOOK ? (["page", "book"] as const) : (["page"] as const)).map(scope => (
          <label key={scope} className={styles.check}>
            <input
              type="radio"
              name={`${stage}-search-scope`}
              checked={search.scope === scope}
              onChange={() => update({ scope })}
            />
            {t(scope === "page" ? "This page" : "Whole book")}
          </label>
        ))}
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={search.wrap} onChange={e => update({ wrap: e.target.checked })} />
        {t("Wrap around")}
      </label>
    </div>
  )
}

// 見出しの行: 掴んで DRAG_START より動かすと、ダイアログの左上を動かす（onMove に窓の中の位置を渡す）
function Head({
  title,
  closeLabel,
  onClose,
  onMove,
}: {
  title: string
  closeLabel: string
  onClose: () => void
  onMove: (at: Point) => void
}) {
  const press = useRef<{ x: number; y: number; dx: number; dy: number; moving: boolean } | null>(null)
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest("button")) return
    const box = e.currentTarget.parentElement?.getBoundingClientRect()
    if (!box) return
    press.current = { x: e.clientX, y: e.clientY, dx: e.clientX - box.left, dy: e.clientY - box.top, moving: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current
    if (!p) return
    if (!p.moving && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_START) return
    p.moving = true
    // 窓の外へ出し切らない（見出しが窓の中に残る）
    const x = Math.min(Math.max(0, e.clientX - p.dx), window.innerWidth - 80)
    const y = Math.min(Math.max(0, e.clientY - p.dy), window.innerHeight - 32)
    onMove({ x, y })
  }
  return (
    <div
      className={styles.head}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => {
        press.current = null
      }}
      onPointerCancel={() => {
        press.current = null
      }}
    >
      <span>{title}</span>
      <button type="button" className={styles.close} aria-label={closeLabel} title={closeLabel} onClick={onClose}>
        ×
      </button>
    </div>
  )
}
