// データのアイテムのビュー: 枠の中に、文字の領域（キャプションと本文。base の TextBlockView）と、表やグラフを描く所を上下に並べる（areas.ts）。
// 表を持たない間は、点線の枠で、描く所の真ん中に「No Data」と出す。表を持てば、見た目が表なら見出しの行（列の名前）の下に行を並べた表
// （数の列は右寄せ、文字の列は左寄せ。列の幅と行の高さは size.ts の値で、セルの中では折り返さない。入りきらない行と列は描く所の中でスクロールする）、
// グラフの見た目なら、グラフ（ChartView）を描く。
// データを選んでいる間（紙をずらす道具の間は除く）は、本文の列の端につまみを出し、離したら本文の幅（bodyWidth）をアクション item-update で書く。
// 表やグラフの動き（motion.ts）のきっかけは、ここで前の様子と比べて決める（表からグラフに変えたのも、見た目を変えたきっかけにする）。
// データにテーマ（theme）を当てていれば、そのテーマのデータのテーマキーで描く。表に無いテーマならブックのテーマのまま
import { type ReactNode, useState } from "react"
import type { ItemProps } from "../../../plugin-api"
import { type ItemViewProps, useAllowed, useMessages, usePerform, useStage } from "../../../plugin-api/ui"
import { TextBlockView, useThemeVars } from "../../base/ui"
import { areasOf } from "./areas"
import { ChartView } from "./ChartView"
import styles from "./DataItemView.module.css"
import { type DATA, DATA_TOKENS } from "./data"
import { kit } from "./kit"
import { type MotionState, type MotionTrigger, motionOf, motionState } from "./motion"
import { cellText, columnWidths, ROW_HEIGHT, TABLE_LOOK } from "./size"
import type { Table } from "./table"

type DataProps = ItemProps<typeof DATA.id>

export function DataItemView({
  props,
  content,
  size,
  stage,
  id,
}: ItemViewProps<DataProps, { readonly table?: Table }>) {
  const t = useMessages(kit)
  const vars = useThemeVars(props.theme, DATA_TOKENS)
  const at = useStage(stage)
  const page = at?.opened?.page ?? undefined
  const perform = usePerform(stage)
  const allowed = useAllowed(stage, "@matomezu/paper:item-update", { page, items: [id] }).ok
  const grips = allowed && at !== null && !at.pans && at.selection.includes(id)
  const table = content.table
  const areas = areasOf(props, size)
  const motion = useMotion(motionState(table, props))
  const text = areas.text && (
    <div className={styles.text} style={{ height: areas.text.height }}>
      <TextBlockView
        props={props}
        inner={areas.text.inner}
        least={areas.text.least}
        maxH={areas.text.maxH}
        stage={stage}
        grips={grips}
        lineColor="var(--data-line)"
        onBodyWidth={bodyWidth => {
          if (page) perform("@matomezu/paper:item-update", { page, item: id, props: { bodyWidth } })
        }}
      />
    </div>
  )
  let body: ReactNode
  if (!table) body = <div className={styles.noData}>{t("No Data")}</div>
  else if (props.view !== "table")
    body = <ChartView table={table} props={props} size={areas.content} stage={stage} id={id} motion={motion} />
  else body = <TableView table={table} />
  return (
    <div
      className={styles.frame}
      style={vars}
      data-theme={props.theme}
      data-view={props.view}
      data-empty={table ? undefined : ""}
    >
      {!areas.contentTop && text}
      <div className={styles.content} style={{ height: areas.content.h }}>
        {body}
      </div>
      {areas.contentTop && text}
    </div>
  )
}

// 前に描いたときの様子と比べた、動かすきっかけ（変わったときだけ回の番号を増やす。初めて描いたときは draw）。
// 様子が変われば、描いている間に覚え直す（React の、前の値から決まる状態の形）
function useMotion(next: MotionState | null): { trigger: MotionTrigger | null; round: number } {
  const [last, setLast] = useState<{
    state: MotionState | null | undefined
    trigger: MotionTrigger | null
    round: number
  }>({ state: undefined, trigger: null, round: 0 })
  if (JSON.stringify(last.state) !== JSON.stringify(next) || last.state === undefined) {
    const trigger = motionOf(last.state, next)
    const now = trigger ? { state: next, trigger, round: last.round + 1 } : { ...last, state: next }
    setLast(now)
    return now
  }
  return last
}

function TableView({ table }: { table: Table }) {
  const widths = columnWidths(table)
  // セルの大きさ: 2 列目からは左に、2 行目からは上に罫線を引く
  const cell = (row: number, col: number) => ({
    width: widths[col],
    height: ROW_HEIGHT + (row > 0 ? TABLE_LOOK.rule : 0),
  })
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={c.id} data-type={c.type} style={cell(0, i)}>
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, row) => (
            <tr key={r.id}>
              {r.cells.map((value, i) => (
                <td key={table.columns[i]?.id} data-type={table.columns[i]?.type} style={cell(row + 1, i)}>
                  {cellText(value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
