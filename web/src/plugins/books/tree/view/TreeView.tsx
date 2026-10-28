// ツリーのビュー（見せ方 tree）: ステージの紙の置き場所（placement）に紙を描き、その上に開いたページの根から伸びる木を描く
// （節の位置と線は layout.ts が伸びる向きから決める）。
// ページが無ければ、真ん中にページを作るボタン（コマンド page-new）を出す。表に無い紙は「不明な紙」と示し、描けない紙は知らせだけを出す。
// 画面のどこを右クリックしても、ツリーのメニュー（tree-context）を開く。編集の道具の間に節を右クリックすると、その節を選んで節のメニュー（node-context）を開く。
// 編集の道具の間は、選んでいる節（無ければ根）に印を付け、押した節を選ぶ。選んでいる節がいつもビューの真ん中に来るように紙をずらす。
// 選んでいる節には＋（子・前と後ろの兄弟。中央の木の根は上下左右の子）を出し、押すと空の節を足して、その場で編集し始める。ダブルクリック（と Enter のコマンド）でも編集し始める。
// その場で編集中は、書いている字で節の大きさを決め直す。Enter かテキストFormの外を押すと確定、Escape で取り消す。空のまま終えた、キャプションの空の子は消す。
// 足す・書き換えるのが紙に入らないので断られたら、トーストで知らせる
import { type CSSProperties, useEffect, useRef, useState } from "react"
import { placement, type Size, type StageView } from "../../../../plugin-api"
import {
  type BookViewProps,
  useActions,
  useCommand,
  useContextMenu,
  useCoreCatalog,
  useMessages,
  usePerform,
  useShownBook,
  useShownPage,
  useStage,
} from "../../../../plugin-api/ui"
import { settingValue } from "../../../base"
import { useResize } from "../../../base/ui"
import { NODE_ADD, NODE_REMOVE, NODE_UPDATE } from "../actions"
import { afterRemove, centerShift, editEnd, type Plus, plusesOf, plusPoint, selectedIn, withCaption } from "../edit"
import { GROW } from "../grow"
import { kit } from "../kit"
import { layoutTree } from "../layout"
import { TreeRootSchema } from "../node"
import { DEFAULT_NODE_SIZE, NODE_SIZE } from "../size"
import { EDIT_TOOL } from "../tools"
import { NODE_CONTEXT, TREE_CONTEXT } from "../tree"
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

const PLUS_NAMES = { child: "Add child", before: "Add sibling before", after: "Add sibling after" } as const
const TOWARDS_NAMES = {
  up: "Add child above",
  down: "Add child below",
  left: "Add child left",
  right: "Add child right",
} as const
// ＋の名前（中央の木の根の子の＋は、向きごと）
const plusName = (plus: Plus) =>
  plus.kind === "child" && plus.towards ? TOWARDS_NAMES[plus.towards] : PLUS_NAMES[plus.kind]

// 開いたページの木（根の無いページは何も描かない）
function Tree({ stage, paper, view }: { stage: StageView; paper: Size; view: Size | null }) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const book = useShownBook(stage.id)
  const page = useShownPage(stage.id)
  const perform = usePerform(stage.id)
  const { select, setEditing, panStageBy, showToast } = useActions()
  // 画面からの足す・書き換えが断られた（画面が渡すページと節はあるので、断られるのは紙に入らないとき）
  const refused = () => showToast({ kind: "warn", message: kit.message("Does not fit on the paper") })
  const openNodeMenu = useContextMenu(stage.id, NODE_CONTEXT)
  const root = TreeRootSchema.safeParse((page as { root?: unknown } | null)?.root)
  const setting = (id: string) => (book && page ? settingValue(catalog, book, page, id) : undefined)
  const grow = GROW.schema.safeParse(setting(GROW.id)).data ?? "down"
  const usingEdit = stage.tool === EDIT_TOOL.id
  const selected = root.success ? selectedIn(root.data, stage.selection) : null
  const writing = usingEdit && stage.editing && selected !== null
  // 書いている字（どの節のものか）と、テキストFormを出してから終えたか（Enter のあとの blur で 2 度終えない）
  const [draft, setDraft] = useState<{ node: string; text: string } | null>(null)
  const ended = useRef(false)
  const text = writing && draft?.node === selected ? draft.text : null
  const shown = root.success && selected && text !== null ? withCaption(root.data, selected, text) : root.data
  const size = NODE_SIZE.schema.safeParse(setting(NODE_SIZE.id)).data ?? DEFAULT_NODE_SIZE
  const laid = shown ? layoutTree(shown, grow, paper, size) : null
  const at = laid?.nodes.find(n => n.id === selected)
  useCentered(stage, usingEdit ? at : undefined, view, panStageBy)
  if (!book || !page || !root.success || !laid || !selected) return null
  const tree = root.data
  const pageId = page.id

  // その場の編集を終える（commit なら書いた字を確定する。することは edit.ts の editEnd が決める）
  const end = (commit: boolean) => {
    if (ended.current) return
    ended.current = true
    const todo = editEnd(tree, selected, commit ? text : null)
    if (todo.kind === "remove") {
      const next = afterRemove(tree, grow, selected)
      if (perform(NODE_REMOVE.id, { page: pageId, node: selected }).ok && next) select(stage.id, [next])
    }
    const done =
      todo.kind === "root"
        ? perform("@matomezu/base:page-update", { page: pageId, fields: { root: { caption: todo.caption } } })
        : todo.kind === "child"
          ? perform(NODE_UPDATE.id, { page: pageId, node: selected, caption: todo.caption })
          : null
    if (done && !done.ok) refused() // 紙に入らない字は書かず、元のキャプションのまま
    setDraft(null)
    setEditing(stage.id, false)
  }
  // ＋: 空の節を足して選び、その場で編集し始める
  const add = (plus: Plus) => {
    const done = perform(NODE_ADD.id, {
      page: pageId,
      parent: plus.parent,
      ...(plus.index === undefined ? {} : { index: plus.index }),
      nodes: [{ caption: "", ...(plus.towards ? { side: plus.towards } : {}) }],
    })
    const id = done.ok ? done.result.nodes[0]?.id : undefined
    if (!id) return refused()
    select(stage.id, [id])
    setEditing(stage.id, true)
  }
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
        // biome-ignore lint/a11y/noStaticElementInteractions: 節はポインタで選び・編集し始め、キーの操作はコマンドが受ける
        <div
          key={n.id}
          className={styles.node}
          data-node={n.id}
          data-root={n.id === tree.id}
          data-selected={usingEdit && n.id === selected}
          style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
          onPointerDown={e => {
            if (e.button !== 0 || !usingEdit) return
            if (writing) end(true) // テキストFormが外れるより先に選びが替わるので、ここで確定する
            select(stage.id, [n.id])
          }}
          onContextMenu={e => {
            if (!usingEdit) return
            if (writing) end(true)
            select(stage.id, [n.id])
            openNodeMenu(e, {})
          }}
          onDoubleClick={() => {
            if (!usingEdit) return
            select(stage.id, [n.id])
            setEditing(stage.id, true)
          }}
        >
          {n.lines.join("\n")}
        </div>
      ))}
      {writing && at && (
        <input
          className={styles.editor}
          aria-label={t("Caption")}
          // biome-ignore lint/a11y/noAutofocus: その場で編集し始めたら、すぐに書ける
          autoFocus
          value={text ?? at.caption}
          style={{ left: at.x, top: at.y, width: at.w, height: at.h }}
          onChange={e => setDraft({ node: selected, text: e.target.value })}
          onFocus={() => {
            ended.current = false
          }}
          onPointerDown={e => e.stopPropagation()}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return
            if (e.key !== "Enter" && e.key !== "Escape") return
            e.preventDefault()
            e.stopPropagation()
            end(e.key === "Enter")
          }}
          onBlur={() => end(true)}
        />
      )}
      {usingEdit &&
        !writing &&
        at &&
        plusesOf(tree, grow, selected).map(plus => {
          const p = plusPoint(at, plus.side)
          return (
            <button
              key={`${plus.kind}-${plus.side}`}
              type="button"
              className={styles.plus}
              aria-label={t(plusName(plus))}
              title={t(plusName(plus))}
              style={{ left: p.x, top: p.y }}
              onPointerDown={e => e.stopPropagation()}
              onClick={() => add(plus)}
            >
              +
            </button>
          )
        })}
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
