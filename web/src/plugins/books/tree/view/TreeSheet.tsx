// ツリーの印刷区画 1 つのビュー（印刷プレビューと印刷。ブックのビューの定義の printSheet）: ページの木を、書く画面と同じ並べ方（print.ts の printLaid。可変ページでは境目をまたぐ節を次の印刷区画へ送る）で、
// 見るだけで、ページの原点で描く。
// 入力を受けず、＋や選んだ印、e2e や操作が探す印（data-node など）も付けない

import { useCoreCatalog } from "../../../../plugin-api/ui"
import { growOf, pageContext } from "../../../base"
import type { PrintSheetProps } from "../../../base/ui"
import { LINE_SHAPE, treePath } from "../line-shape"
import { treeRootOf } from "../node"
import { printLaid } from "../print"
import { NODE_SHAPE } from "../shape"
import { nodePaint } from "./paint"
import { NodeText } from "./TreeView"
import styles from "./TreeView.module.css"

export function TreeSheet({ book, page, paper }: PrintSheetProps) {
  const catalog = useCoreCatalog()
  const setting = pageContext(catalog, book, page).setting
  const laid = printLaid(catalog, page, { setting, grow: growOf(catalog, book, page) })
  const root = treeRootOf(page)
  if (!laid || !root) return null
  const lineShape = setting(LINE_SHAPE)
  const shape = setting(NODE_SHAPE)
  return (
    <>
      <svg className={styles.lines} width={paper.w} height={paper.h} aria-hidden="true">
        {laid.lines.map(l => (
          <path key={`${l.from.x},${l.from.y}-${l.to.x},${l.to.y}`} d={treePath(l, lineShape)} />
        ))}
      </svg>
      {laid.nodes.map(n => (
        <div
          key={n.id}
          className={styles.node}
          data-root={n.id === root.id}
          data-shape={n.id === root.id ? "box" : shape}
          style={{ left: n.x, top: n.y, width: n.w, height: n.h, ...nodePaint(n.color) }}
        >
          <NodeText node={n} />
        </div>
      ))}
    </>
  )
}
