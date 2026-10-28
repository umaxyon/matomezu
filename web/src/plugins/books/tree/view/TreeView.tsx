// ツリーのビュー（見せ方 tree）: ステージの紙の置き場所（placement）に紙を描き、その上に開いたページの根から伸びる木を描く
// （節の位置と線は layout.ts が伸びる向きから決める）。
// ページが無ければ、真ん中にページを作るボタン（コマンド page-new）を出す。表に無い紙は「不明な紙」と示し、描けない紙は知らせだけを出す。
// 画面のどこを右クリックしても、ツリーのメニュー（tree-context）を開く
import type { CSSProperties } from "react"
import { placement, type StageView } from "../../../../plugin-api"
import {
  type BookViewProps,
  useCommand,
  useContextMenu,
  useCoreCatalog,
  useMessages,
  useShownBook,
  useShownPage,
  useStage,
} from "../../../../plugin-api/ui"
import { settingValue } from "../../../base"
import { GROW, type Grow } from "../grow"
import { kit } from "../kit"
import { layoutTree } from "../layout"
import { TreeRootSchema } from "../node"
import { TREE_CONTEXT } from "../tree"
import styles from "./TreeView.module.css"

export function TreeView({ stage: id }: BookViewProps) {
  const stage = useStage(id)
  const openMenu = useContextMenu(id, TREE_CONTEXT)
  if (!stage) return null
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 右クリックのメニューはポインタの操作で、キーの操作はメニューとコマンドが受ける
    <div className={styles.tree} onContextMenu={e => openMenu(e, {})}>
      <Content stage={stage} />
    </div>
  )
}

function Content({ stage }: { stage: StageView }) {
  const t = useMessages(kit)
  const p = placement(stage)
  const paper = stage.opened?.paper
  if (stage.opened?.page === null) return <NoPages stage={stage} />
  if (paper?.status === "unshowable") return <p className={styles.error}>{t("This paper cannot be shown")}</p>
  if (!p) return null
  return (
    <div
      className={styles.paper}
      role="img"
      aria-label={t("Paper")}
      style={
        {
          width: p.w,
          height: p.h,
          transform: `translate(${p.x}px, ${p.y}px) scale(${p.zoom})`,
        } as CSSProperties
      }
    >
      {paper?.status === "unknown" && <span className={styles.unknown}>{t("Unknown paper")}</span>}
      <Tree stage={stage} paper={{ w: p.w, h: p.h }} />
    </div>
  )
}

// 開いたページの木（根の無いページは何も描かない）
function Tree({ stage, paper }: { stage: StageView; paper: { w: number; h: number } }) {
  const catalog = useCoreCatalog()
  const book = useShownBook(stage.id)
  const page = useShownPage(stage.id)
  const root = TreeRootSchema.safeParse((page as { root?: unknown } | null)?.root)
  if (!book || !page || !root.success) return null
  const grow = settingValue(catalog, book, page, GROW.id) as Grow
  const { nodes, lines } = layoutTree(root.data, grow, paper)
  return (
    <>
      <svg className={styles.lines} width={paper.w} height={paper.h} aria-hidden="true">
        {lines.map(l => (
          <line
            key={`${l.from.x},${l.from.y}-${l.to.x},${l.to.y}`}
            x1={l.from.x}
            y1={l.from.y}
            x2={l.to.x}
            y2={l.to.y}
          />
        ))}
      </svg>
      {nodes.map(n => (
        <div
          key={n.id ?? ""}
          className={styles.node}
          data-node={n.id ?? "root"}
          data-root={n.id === null}
          style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
        >
          {n.caption}
        </div>
      ))}
    </>
  )
}

function NoPages({ stage }: { stage: StageView }) {
  const t = useMessages(kit)
  const newPage = useCommand(stage.id, "@matomezu/base:page-new")
  return (
    <div className={styles.empty}>
      <p className={styles.prompt}>{t("No pages")}</p>
      {newPage.shown && (
        <button type="button" className={styles.create} onClick={() => newPage.run()}>
          {t("Create page")}
        </button>
      )}
    </div>
  )
}
