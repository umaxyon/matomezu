// リストのアイテムのビュー: 上にキャプションの見出し、その下に行を並べ、最後に行を足す「＋」の行。行がリストの高さを超えたら、行の所だけをスクロールする
// （スクロールできるときのホイールは紙に渡さない）。行の並びと高さは size.ts の listLayout のとおりに描く。
// 行をダブルクリックすると行の編集、右クリックすると行のメニュー（row.context）。チェックリストなら、行の左のチェックを押すだけで入れ切りする。
// 行の中の操作（チェック・「＋」・行のダブルクリックと右クリック）は、リストを動かす・リストの設定を開く操作に渡さない（行を押すとリストを選ぶだけで、
// リストを動かすのは見出しと枠をつかんだとき。行を押してドラッグを始めると、ダブルクリックがリストの方へ届いてしまうため）。
// 行の下の端をつかんでドラッグすると、その行の高さを 1 行刻みで変える（離したときに list.stretchRow。ドラッグの途中の動いた量だけはビューに持つ）。
// 設定のダイアログの「行の高さ」の下書き（項目 rowLines。データには無い）があれば、全部の行をそれで描く。
// リストのテーマと色は箱と同じ欄（box.*）で描き、行はリストに従う
import { type CSSProperties, type PointerEvent, useMemo, useRef, useState } from "react"
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
import { paintVars } from "../box/paint"
import type { ListRow } from "."
import styles from "./ListView.module.css"
import { linesFor, listLayout, type RowsLines, rowHeight } from "./size"

const inside = { onPointerDown: (e: { stopPropagation(): void }) => e.stopPropagation() }

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
    () => (theme && registry.themes.has(theme) ? themeVars(resolveTokens(registry, theme, BOX.tokens)) : undefined),
    [registry, theme],
  )
  const add = useCommand(stage, "list.addRow")
  const edit = useCommand(stage, "list.editRow")
  const check = useCommand(stage, "list.check")
  const openMenu = useContextMenu(stage, "row.context")
  const stretchRow = useCommand(stage, "list.stretchRow")
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
      <div className={styles.list} style={paintVars(props.color) as CSSProperties} data-zebra={props.zebra}>
        <div className={styles.head}>{props.caption}</div>
        <div
          className={styles.rows}
          onWheel={e => {
            const el = e.currentTarget
            if (el.scrollHeight > el.clientHeight) e.stopPropagation()
          }}
        >
          <ul className={styles.items} aria-label={t("Rows of {name}", { name: props.caption })}>
            {rows.map((row, i) => {
              const look = layout[i]
              return (
                <li
                  key={row.id}
                  className={styles.row}
                  data-row={row.id}
                  onPointerDown={e => {
                    if (e.button !== 0) return
                    e.stopPropagation()
                    select(stage, [id])
                  }}
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
    </div>
  )
}
