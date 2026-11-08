// 検索ダイアログ（ウィジェット search-dialog。根のスロットに置く）: 検索を開いているステージ（カレントのステージを先に）の検索を、画面の上に浮かぶダイアログで見せる。
// ほかの操作を止めない（ページをスクロールしたり書いたりできる。外を押しても閉じない）。見出しを掴んで動かせ、動かした所は閉じても覚える。
// 探す字・置き換える字・切り替え（大文字小文字・正規表現・範囲・端で回る）は base のステージの画面の状態（state.ts）に書き、
// 変えたら今の当たりを、今の当たりの頭から先の最初の当たりに選び直す。次・前・置換・閉じるはコマンド（index.ts）。入力Formは検索のキーの範囲を名乗る
import { type PointerEvent, useEffect, useRef } from "react"
import type { Point } from "../../../core/geom"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useMatomezuState, useReadState } from "../../../ui/store-context"
import { useBook, useCoreCatalog, useSetStageState, useStage } from "../../../ui/view-hooks"
import { controlClass } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { DRAG_START } from "../utils/drag"
import {
  SEARCH_CLOSE,
  SEARCH_KEY_SCOPE,
  SEARCH_NEXT,
  SEARCH_PREVIOUS,
  SEARCH_REPLACE_ALL,
  SEARCH_REPLACE_ONE,
} from "./index"
import styles from "./SearchDialog.module.css"
import { firstHitFrom, hitsIn, searchableOf } from "./search"
import { type SearchOpen, searchAtIn, searchIn, withSearch, withSearchAt } from "./state"

// 開いたことの無いときの、窓の右上からの位置
const FIRST_AT = { right: 24, top: 64 }

export function SearchDialogHost() {
  const stage = useMatomezuState(s => {
    const open = (id: string) => searchIn(s.stageStates[id]?.[kit.id]) !== null
    if (open(s.workspace.current)) return s.workspace.current
    return s.workspace.stages.find(st => open(st.id))?.id ?? null
  })
  return stage ? <SearchDialog key={stage} stage={stage} /> : null
}

function SearchDialog({ stage }: { stage: string }) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const book = useBook(stage)
  const opened = useStage(stage)?.opened?.page ?? null
  const state = useMatomezuState(s => s.stageStates[stage]?.[kit.id])
  const read = useReadState()
  const set = useSetStageState(kit)
  const search = searchIn(state)
  const at = searchAtIn(state)
  const next = useCommand(stage, SEARCH_NEXT.id)
  const previous = useCommand(stage, SEARCH_PREVIOUS.id)
  const close = useCommand(stage, SEARCH_CLOSE.id)
  const replaceOne = useCommand(stage, SEARCH_REPLACE_ONE.id)
  const replaceAll = useCommand(stage, SEARCH_REPLACE_ALL.id)
  const find = useRef<HTMLInputElement>(null)
  const replace = useRef<HTMLInputElement>(null)
  // 開くたびに、開き方の入力Formに焦点を当てて中の字を選ぶ
  useEffect(() => {
    if (!search) return
    const el = search.focus === "replace" ? replace.current : find.current
    el?.focus()
    el?.select()
  }, [search?.opened, search?.focus, search])
  const s = searchableOf(catalog, book)
  if (!search || s === "none" || !book) return null
  const pages = hitsIn(s, book, search.query, search.scope, opened)
  const bad = pages === "bad-pattern"
  const all = bad ? [] : pages.flatMap(p => p.hits.map(h => ({ page: p.page.id, start: h.start })))
  const cur = search.current
  const index = cur === "none" ? -1 : all.findIndex(h => h.page === cur.page && h.start === cur.start)
  const withPages = search.scope === "book" && !bad
  const pageNo = withPages && cur !== "none" ? pages.findIndex(p => p.page.id === cur.page) + 1 : 0
  const count = `${index < 0 ? 0 : index + 1}/${all.length}${pageNo > 0 && !bad ? `（${pageNo} / ${pages.length}）` : ""}`

  // 検索を change で変える（探す字か切り替えが変われば、今の当たりを選び直す）
  const update = (change: Partial<SearchOpen>) => {
    const now = read().stageStates[stage]?.[kit.id]
    const was = searchIn(now)
    if (!was) return
    const changed = { ...was, ...change }
    const requery = change.query !== undefined || (change.scope !== undefined && change.scope !== was.scope)
    const found = requery ? hitsIn(s, book, changed.query, changed.scope, opened) : "bad-pattern"
    const current = requery
      ? found === "bad-pattern"
        ? "none"
        : firstHitFrom(found, was.current, opened ?? "")
      : changed.current
    set(stage, withSearch(now, { ...changed, current }))
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
      <Head
        title={t("Search")}
        closeLabel={t("Close search")}
        onClose={() => close.run()}
        onMove={p => set(stage, withSearchAt(read().stageStates[stage]?.[kit.id], p))}
      />
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
          {bad ? "0/0" : count}
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
          disabled={!replaceOne.enabled || all.length === 0}
          onClick={() => replaceOne.run()}
        >
          {t("Replace one")}
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={!replaceAll.enabled || all.length === 0}
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
        {(["page", "book"] as const).map(scope => (
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
