// リストのアイテムのビュー: 上にキャプションの見出し、その下に行を並べ、最後に行を足す「＋」の行。行がリストの高さを超えたら、行の所だけをスクロールする
// （スクロールできるときのホイールは紙に渡さない）。行の並びと高さは size.ts の listLayout のとおりに描く。
// 行をダブルクリックすると行の編集、右クリックすると行のメニュー（row.context）。チェックリストなら、行の左のチェックを押すだけで入れ切りする。
// 行の中の操作（チェック・「＋」・行のダブルクリックと右クリック）は、リストを動かす・リストの設定を開く操作に渡さない（行を押すとリストを選ぶだけで、
// リストを動かすのは見出しと枠をつかんだとき。行を押してドラッグを始めると、ダブルクリックがリストの方へ届いてしまうため）。
// 行を押して少し動かすと行のドラッグになり（押しただけ・ダブルクリック・チェックは今まで通り）、行のカードの写しがポインタに付いてきて、
// 落とす所の行と行の間に線が出る。つかんだ行は元の所にそのまま描き、同じリストのほかの行を薄くする（アイテムのドラッグと同じ見せ方）。
// 写しは画面の上の層に描くので、行の所のテーマと色の変数を写し取って当てる。
// 離すと、同じページのリスト（自分のリストも）のその位置へ動かす（list.moveRow）。落とす所はポインタの下のリストの行の並びで決め、見せる順のとおりの位置にする。
// ドラッグの途中の行と、光る所はビューに持つ（画面の上に重ねて描く。紙は拡大縮小されているので、紙の外の層に描く）。
// 行の下の端をつかんでドラッグすると、その行の高さを 1 行刻みで変える（離したときに list.stretchRow。ドラッグの途中の動いた量だけはビューに持つ）。
// 設定のダイアログの「行の高さ」の下書き（項目 rowLines。データには無い）があれば、全部の行をそれで描く。
// リストのテーマと色は箱と同じ欄（box.*）と、リストの欄（list.*。見出しの帯・台紙・行の付箋）で描き、行はリストに従う。
// チェックリストでは、チェック済みの行を薄く描き（checkedGray）、先頭か最後に寄せて見せる（checkedOrder。データの順は変えない）。
// 行は台紙の上の 1 枚ずつのカードで、カードの地・角・影・折り返しはテーマが決める（付箋紙のテーマでは付箋）。色はリストの台紙と見出しに塗る（paint.ts）
import { type CSSProperties, type PointerEvent, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { ItemProps } from "../../../../core/registry"
import { toPaperDelta } from "../../../../core/stage"
import { resolveTokens } from "../../../../core/theme"
import { useCommand } from "../../../../ui/commands"
import { useContextMenu } from "../../../../ui/context-menu"
import { useT } from "../../../../ui/i18n"
import type { ItemViewProps } from "../../../../ui/plugin"
import { useActions, useApp, useRegistry } from "../../../../ui/store-context"
import { themeVars } from "../../../../ui/theme-vars"
import { BOX } from "../box"
import { LIST, type ListRow } from "."
import styles from "./ListView.module.css"
import { listPaintVars } from "./paint"
import { linesFor, listLayout, type RowLayout, type RowsLines, rowHeight } from "./size"

const inside = { onPointerDown: (e: { stopPropagation(): void }) => e.stopPropagation() }

// 行を見せる順（行の番号の並び）: チェック済みの行を先頭か最後に寄せる（ほかの順はデータのまま。データの順は変えない）
function shownOrder(rows: readonly ListRow[], order: "none" | "first" | "last"): number[] {
  const all = rows.map((_, i) => i)
  if (order === "none") return all
  const done = all.filter(i => rows[i]?.props.checked === true)
  const rest = all.filter(i => rows[i]?.props.checked !== true)
  return order === "first" ? [...done, ...rest] : [...rest, ...done]
}

// 行のドラッグを始めるまでに動かす量（画面の px）
const DRAG_START = 4

// 行のドラッグ: 押した行と位置、動かし始めたか、写しの見た目
interface Carry {
  pointer: number
  row: ListRow
  start: { x: number; y: number }
  moving: boolean
  look?: GhostLook
}

// ポインタに付く行の写し: 行の大きさ（紙の上の px）と画面での倍率、つかんだ所（行の左上から、画面の px）、行の所の CSS 変数
interface GhostLook {
  w: number
  h: number
  scale: number
  grab: { x: number; y: number }
  vars: Record<string, string>
}

// 行の要素 li から写しの見た目を取る。変数はテーマの欄（names）と、台紙・文字・行の地
function ghostLook(li: HTMLElement, x: number, y: number, names: readonly string[]): GhostLook {
  const r = li.getBoundingClientRect()
  const css = getComputedStyle(li)
  const vars: Record<string, string> = {}
  for (const name of [...names, "--mount", "--ink", "--row-fill"]) {
    const v = css.getPropertyValue(name)
    if (v !== "") vars[name] = v
  }
  const scale = li.offsetWidth > 0 ? r.width / li.offsetWidth : 1
  return { w: li.offsetWidth, h: li.offsetHeight, scale, grab: { x: x - r.left, y: y - r.top }, vars }
}

// 行を落とす所: リスト list の行 before の前（無ければ最後）と、光らせる所（画面の座標）
interface Drop {
  list: string
  before?: string
  bar: { x: number; y: number; w: number }
}

// ポインタ（画面の座標）の下のリストで、行 row を落とす所（無ければ null）。行の並びは画面に見えている順。行の真ん中より上なら、その行の前
function dropAt(x: number, y: number, row: string): Drop | null {
  const under = document.elementsFromPoint(x, y)
  const item = under.map(el => el.closest("[data-item]")).find(Boolean)
  const ul = item?.querySelector<HTMLElement>("[data-list-rows]")
  const list = ul?.dataset.listRows
  if (!ul || !list) return null
  const box = ul.getBoundingClientRect()
  const others = [...ul.querySelectorAll<HTMLElement>(":scope > [data-row]")].filter(li => li.dataset.row !== row)
  const next = others.find(li => {
    const r = li.getBoundingClientRect()
    return y < r.top + r.height / 2
  })
  const last = others.at(-1)?.getBoundingClientRect()
  const at = next ? next.getBoundingClientRect().top - GAP_MID : last ? last.bottom + GAP_MID : box.top + INSET_MID
  return {
    list,
    ...(next?.dataset.row ? { before: next.dataset.row } : {}),
    bar: { x: box.left + 8, y: at, w: box.width - 16 },
  }
}
const GAP_MID = 3 // 行の間の隙間（6px）の真ん中
const INSET_MID = 4 // 行の無いリストの、台紙の内側の余白の真ん中

// 行の高さを変えているドラッグ: つかんだ行と、その高さ（紙の上）、押したときのポインタの位置
interface Stretch {
  pointer: number
  row: string
  height: number
  start: number
}

export function ListView({ props, size, id, stage, content }: ItemViewProps<ItemProps<"shape.list">>) {
  const t = useT()
  const registry = useRegistry()
  const rows = content as readonly ListRow[]
  const theme = props.theme
  const vars = useMemo(
    () =>
      theme && registry.themes.has(theme)
        ? themeVars(resolveTokens(registry, theme, [...BOX.tokens, ...LIST.tokens]))
        : undefined,
    [registry, theme],
  )
  const add = useCommand(stage, "list.addRow")
  const edit = useCommand(stage, "list.editRow")
  const check = useCommand(stage, "list.check")
  const openMenu = useContextMenu(stage, "row.context")
  const stretchRow = useCommand(stage, "list.stretchRow")
  const moveRow = useCommand(stage, "list.moveRow")
  // 写しに写し取るテーマの変数の名前（テーマが違っても欄は同じ）
  const ghostNames = useMemo(() => {
    const any = [...registry.themes.keys()][0]
    if (any === undefined) return []
    return Object.keys(themeVars(resolveTokens(registry, any, [...BOX.tokens, ...LIST.tokens]))).filter(k =>
      k.startsWith("--"),
    )
  }, [registry])
  const carry = useRef<Carry | null>(null)
  const [carried, setCarried] = useState<{ x: number; y: number; drop: Drop | null } | null>(null)
  const endCarry = (drop: boolean) => {
    const c = carry.current
    carry.current = null
    const target = carried?.drop
    setCarried(null)
    if (!drop || !c?.moving || !target || target.before === c.row.id) return
    moveRow.run({ list: id, row: c.row.id, to: target.list, ...(target.before ? { before: target.before } : {}) })
  }
  const carrying = (row: ListRow) => ({
    onPointerDown: (e: PointerEvent<HTMLLIElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      select(stage, [id])
      carry.current = {
        pointer: e.pointerId,
        row,
        start: { x: e.clientX, y: e.clientY },
        moving: false,
      }
    },
    onPointerMove: (e: PointerEvent<HTMLLIElement>) => {
      const c = carry.current
      if (c?.pointer !== e.pointerId) return
      if (!c.moving) {
        if (Math.hypot(e.clientX - c.start.x, e.clientY - c.start.y) < DRAG_START) return
        c.moving = true
        c.look = ghostLook(e.currentTarget, c.start.x, c.start.y, ghostNames)
        e.currentTarget.setPointerCapture(e.pointerId)
      }
      setCarried({ x: e.clientX, y: e.clientY, drop: dropAt(e.clientX, e.clientY, c.row.id) })
    },
    onPointerUp: (e: PointerEvent<HTMLLIElement>) => {
      if (carry.current?.pointer === e.pointerId) endCarry(true)
    },
    onPointerCancel: () => endCarry(false),
  })
  const { select } = useActions()
  const at = useApp(s => s.workspace.stages.find(st => st.id === stage))
  const stretch = useRef<Stretch | null>(null)
  const [moved, setMoved] = useState(0) // 行の高さを変えているドラッグの、画面の上で動いた量
  const draft = (props as { rowLines?: RowsLines }).rowLines
  const layout = listLayout(rows, size.w, props.checklist, draft)
  // 高さを変えている途中の行は、一番近い行数の高さで描く
  const heightOf = (row: string, height: number) => {
    const st = stretch.current
    if (!st || st.row !== row || !at) return height
    return rowHeight(linesFor(st.height + toPaperDelta(at, { x: 0, y: moved }).y))
  }
  const grip = (row: string, height: number) => ({
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      stretch.current = { pointer: e.pointerId, row, height, start: e.clientY }
      select(stage, [id])
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const st = stretch.current
      if (st?.pointer === e.pointerId) setMoved(e.clientY - st.start)
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      const st = stretch.current
      if (st?.pointer !== e.pointerId) return
      stretch.current = null
      setMoved(0)
      if (moved !== 0) stretchRow.run({ list: id, row, height: st.height, by: { x: 0, y: moved } })
    },
    onPointerCancel: () => {
      stretch.current = null
      setMoved(0)
    },
    onDoubleClick: (e: { stopPropagation(): void }) => e.stopPropagation(),
  })
  return (
    <div className={styles.frame} style={vars} data-theme={theme}>
      <div className={styles.list} style={listPaintVars(props.color) as CSSProperties} data-zebra={props.zebra}>
        <div className={styles.head} data-align={props.captionAlign}>
          {props.caption}
        </div>
        <div
          className={styles.rows}
          onWheel={e => {
            const el = e.currentTarget
            if (el.scrollHeight > el.clientHeight) e.stopPropagation()
          }}
        >
          <ul
            className={styles.items}
            data-list-rows={id}
            data-carrying={carried !== null}
            aria-label={t("Rows of {name}", { name: props.caption })}
          >
            {shownOrder(rows, props.checklist ? props.checkedOrder : "none").map(i => {
              const row = rows[i] as ListRow
              const look = layout[i]
              return (
                <li
                  key={row.id}
                  className={styles.row}
                  data-row={row.id}
                  data-done={props.checklist && props.checkedGray && row.props.checked === true}
                  data-carried={carried !== null && carry.current?.row.id === row.id}
                  {...carrying(row)}
                  style={{ height: heightOf(row.id, look?.height ?? 0) }}
                  onDoubleClick={e => {
                    e.stopPropagation()
                    edit.run({ list: id, row: row.id })
                  }}
                  onContextMenu={e => openMenu(e, { list: id, row: row.id })}
                >
                  {props.checklist && (
                    <input
                      type="checkbox"
                      className={styles.check}
                      checked={row.props.checked === true}
                      aria-label={t("Check")}
                      {...inside}
                      onDoubleClick={e => e.stopPropagation()}
                      onChange={e => check.run({ list: id, row: row.id, checked: e.target.checked })}
                    />
                  )}
                  <RowFace row={row} look={look} />
                  <div className={styles.grip} data-grip="row" {...grip(row.id, look?.height ?? 0)} />
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            className={styles.add}
            aria-label={t("Add row")}
            {...inside}
            onDoubleClick={e => e.stopPropagation()}
            onClick={() => add.run({ list: id })}
          >
            +
          </button>
        </div>
      </div>
      {carried &&
        carry.current?.look &&
        createPortal(
          <>
            <Ghost
              row={carry.current.row}
              look={carry.current.look}
              x={carried.x}
              y={carried.y}
              checklist={props.checklist}
              lines={layout[rows.indexOf(carry.current.row)]}
              done={props.checklist && props.checkedGray && carry.current.row.props.checked === true}
            />
            {carried.drop && (
              <div
                className={styles.dropBar}
                data-drop-bar
                style={{ left: carried.drop.bar.x, top: carried.drop.bar.y - 1.5, width: carried.drop.bar.w }}
              />
            )}
          </>,
          document.body,
        )}
    </div>
  )
}

// 行のカードの地と、キャプション・線・本文（チェックの印は除く）
function RowFace({ row, look }: { row: ListRow; look: RowLayout | undefined }) {
  return (
    <>
      <div className={styles.cardShadow}>
        <div className={styles.card} />
      </div>
      <div className={styles.text}>
        <div className={styles.caption} data-align={row.props.captionAlign}>
          {row.props.caption}
        </div>
        {look?.rule && <hr className={styles.rule} />}
        {look && look.body.length > 0 && (
          <div data-align={row.props.bodyAlign}>
            {look.body.map((line, n) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 行は折り返した順の並びで、並べ替えない
              <div key={n} className={styles.line}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ポインタに付く行の写し: つかんだ所がポインタの下に来るように、行と同じ大きさ・倍率で描く。チェックの印は押せない飾り
function Ghost(p: {
  row: ListRow
  look: GhostLook
  x: number
  y: number
  checklist: boolean
  lines: RowLayout | undefined
  done: boolean
}) {
  const { look } = p
  const { "--row-fill": fill, ...vars } = look.vars
  return (
    <div
      className={styles.ghost}
      style={
        {
          ...vars,
          left: p.x - look.grab.x,
          top: p.y - look.grab.y,
          width: look.w,
          height: look.h,
          transform: `scale(${look.scale})`,
        } as CSSProperties
      }
    >
      <div
        className={styles.row}
        data-done={p.done}
        style={{ height: look.h, ...(fill ? { "--row-fill": fill } : {}) } as CSSProperties}
      >
        {p.checklist && (
          <input
            type="checkbox"
            className={styles.check}
            checked={p.row.props.checked === true}
            readOnly
            tabIndex={-1}
          />
        )}
        <RowFace row={p.row} look={p.lines} />
      </div>
    </div>
  )
}
