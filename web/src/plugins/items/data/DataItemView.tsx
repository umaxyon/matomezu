// データのアイテムのビュー: 表を持たない間は、点線の枠の真ん中に「No Data」と出す。表を持てば、見出しの行（列の名前）の下に行を並べた表で描く
// （数の列は右寄せ、文字の列は左寄せ）。入りきらない行と列は、枠の中でスクロールする。
// データにテーマ（theme）を当てていれば、そのテーマのデータのテーマキーで描く。表に無いテーマならブックのテーマのまま
import type { ItemProps } from "../../../plugin-api"
import { type ItemViewProps, useMessages } from "../../../plugin-api/ui"
import { useThemeVars } from "../../base/ui"
import styles from "./DataItemView.module.css"
import { type DATA, DATA_TOKENS } from "./data"
import { kit } from "./kit"
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
  return (
    <div className={styles.frame} style={vars} data-theme={props.theme}>
      <table className={styles.table}>
        <thead>
          <tr>
            {table.columns.map(c => (
              <th key={c.id} data-type={c.type}>
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map(r => (
            <tr key={r.id}>
              {r.cells.map((cell, i) => (
                <td key={table.columns[i]?.id} data-type={table.columns[i]?.type}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
