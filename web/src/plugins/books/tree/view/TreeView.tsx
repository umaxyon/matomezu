// ツリーのビュー（見せ方 tree）: ステージの紙の置き場所（placement）に紙を描き、その上に開いたページの根から伸びる木を描く
// （節の位置と線は layout.ts が伸びる向きから決める）。
// ページが無ければ、真ん中にページを作るボタン（コマンド page-new）を出す。表に無い紙は「不明な紙」と示し、描けない紙は知らせだけを出す。
// 画面のどこを右クリックしても、ツリーのメニュー（tree-context）を開く。
// 編集の道具の間は、選んでいる節（無ければ根）に印を付け、押した節を選ぶ。選んでいる節がいつもビューの真ん中に来るように紙をずらす
import { type CSSProperties, useEffect, useRef, useState } from "react"
import { placement, type Size, type StageView } from "../../../../plugin-api"
import {
  type BookViewProps,
  useActions,
  useCommand,
  useContextMenu,
  useCoreCatalog,
  useMessages,
  useShownBook,
  useShownPage,
  useStage,
} from "../../../../plugin-api/ui"
import { settingValue } from "../../../base"
import { useResize } from "../../../base/ui"
import { centerShift, selectedIn } from "../edit"
import { GROW, type Grow } from "../grow"
import { kit } from "../kit"
import { layoutTree } from "../layout"
import { TreeRootSchema } from "../node"
import { EDIT_TOOL } from "../tools"
import { TREE_CONTEXT } from "../tree"
import styles from "./TreeView.module.css"

export function TreeView({ stage: id }: BookViewProps) {
  const stage = useStage(id)
  const openMenu = useContextMenu(id, TREE_CONTEXT)
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<Size | null>(null)
  useResize(ref, setView)
  if (!stage) return null
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 右クリックのメニューはポインタの操作で、キーの操作はメニューとコマンドが受ける
    <div ref={ref} className={styles.tree} onContextMenu={e => openMenu(e, {})}>
      <Content stage={stage} view={view} />
    </div>
  )
}

function Content({ stage, view }: { stage: StageView; view: Size | null }) {
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
      <Tree stage={stage} paper={{ w: p.w, h: p.h }} view={view} />
    </div>
  )
}

// 開いたページの木（根の無いページは何も描かない）
function Tree({ stage, paper, view }: { stage: StageView; paper: Size; view: Size | null }) {
  const catalog = useCoreCatalog()
  const book = useShownBook(stage.id)
  const page = useShownPage(stage.id)
  const { select, panStageBy } = useActions()
  const root = TreeRootSchema.safeParse((page as { root?: unknown } | null)?.root)
  const grow = book && page ? (settingValue(catalog, book, page, GROW.id) as Grow) : "down"
  const laid = root.success ? layoutTree(root.data, grow, paper) : null
  const editing = stage.tool === EDIT_TOOL.id
  const selected = root.success ? selectedIn(root.data, stage.selection) : null
  const at = laid?.nodes.find(n => n.id === selected)
  useCentered(stage, editing ? at : undefined, view, panStageBy)
  if (!book || !page || !root.success || !laid) return null
  const { nodes, lines } = laid
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
          key={n.id}
          className={styles.node}
          data-node={n.id}
          data-root={n.id === root.data.id}
          data-selected={editing && n.id === selected}
          style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
          onPointerDown={e => {
            if (e.button === 0 && editing) select(stage.id, [n.id])
          }}
        >
          {n.caption}
        </div>
      ))}
    </>
  )
}

// 紙の上の四角 rect（無ければ何もしない）の真ん中が、大きさ view のビューの真ん中に来るように紙をずらす（紙の端では、ずらせる所まで）
function useCentered(
  stage: StageView,
  rect: { x: number; y: number; w: number; h: number } | undefined,
  view: Size | null,
  panStageBy: (stage: string, dx: number, dy: number) => void,
) {
  const latest = useRef(stage)
  latest.current = stage
  const { x, y, w, h } = rect ?? {}
  useEffect(() => {
    const at = placement(latest.current)
    if (x === undefined || y === undefined || w === undefined || h === undefined || !view?.w || !view.h || !at) return
    const shift = centerShift({ x, y, w, h }, view, at)
    if (shift) panStageBy(latest.current.id, shift.dx, shift.dy)
  }, [x, y, w, h, view, panStageBy])
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
