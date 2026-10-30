// データのアイテムのビュー: 表を持たない間は、点線の枠の真ん中に「No Data」と出す。表を持てば、見出しの行（列の名前）の下に行を並べた表で描く
// （数の列は右寄せ、文字の列は左寄せ。列の幅と行の高さは size.ts の値で、セルの中では折り返さない）。入りきらない行と列は、枠の中でスクロールする。
// データにテーマ（theme）を当てていれば、そのテーマのデータのテーマキーで描く。表に無いテーマならブックのテーマのまま
import type { ItemProps } from "../../../plugin-api"
import { type ItemViewProps, useMessages } from "../../../plugin-api/ui"
import { useThemeVars } from "../../base/ui"
import styles from "./DataItemView.module.css"
import { type DATA, DATA_TOKENS } from "./data"
import { kit } from "./kit"
import { cellText, columnWidths, ROW_HEIGHT, TABLE_LOOK } from "./size"
import type { Table } from "./table"

type DataProps = ItemProps<typeof DATA.id>

export function DataItemView({ props, content }: ItemViewProps<DataProps, { readonly table?: Table }>) {
  const t = useMessages(kit)
  const vars = useThemeVars(props.theme, DATA_TOKENS)
  const table = content.table
  if (!table)
    return (
      <div className={styles.empty} style={vars} data-theme={props.theme} data-empty>
        {t("No Data")}
      </div>
    )
  const widths = columnWidths(table)
  // セルの大きさ: 2 列目からは左に、2 行目からは上に罫線を引く
  const cell = (row: number, col: number) => ({
    width: widths[col],
    height: ROW_HEIGHT + (row > 0 ? TABLE_LOOK.rule : 0),
  })
  return (
    <div className={styles.frame} style={vars} data-theme={props.theme}>
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
