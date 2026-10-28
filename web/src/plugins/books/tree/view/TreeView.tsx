// ツリーのビュー（見せ方 tree）: ステージの紙の置き場所（placement）に紙を描き、その上に開いたページの根から伸びる木を描く
// （節の位置と線は layout.ts が伸びる向きから決める）。
// ページが無ければ、真ん中にページを作るボタン（コマンド page-new）を出す。表に無い紙は「不明な紙」と示し、描けない紙は知らせだけを出す。
// 画面のどこを右クリックしても、ツリーのメニュー（tree-context）を開く。編集の道具の間に節を右クリックすると、その節を選んで節のメニュー（node-context）を開く。
// 編集の道具の間は、選んでいる節（無ければ根）に印を付け、ほかを少し暗くし、押した節を選ぶ。選んでいる節がいつもビューの真ん中に来るように紙をずらす
// （編集の道具では 125%、ほかの道具では 100% に。選ぶ節が替わると紙の動きをなめらかにする）。
// 選んでいる節には＋（子・前と後ろの兄弟。中央の木の根は上下左右の子。ふだんは小さな点で、ポインタを近づけると＋の丸に開く）を出し、押すと空の節を足して、その場で編集し始める。ダブルクリック（と F2 のコマンド）でも編集し始める
// （根はページの設定のダイアログを開く）。節の形が下線でも、根は箱で描く。
// その場で編集中は、書いている字で節の大きさを決め直し、テキストFormのすぐ上に装飾のボックス（base の RichBar。太字と文字の色）を出す（押しても焦点は外れない）。キャプションは普通の太さで、装飾して描く。節の形が下線なら、テキストFormと選んでいる印も下線で描く。Enter かテキストFormの外を押すと確定、Escape で取り消す。空のまま終えた、キャプションの空の子は消す。
// 編集の道具の間は、根でない節を押して動かすとドラッグになり、落とした所で子孫ごと付け替える（落とす先は drag.ts が決める。節の写しがポインタに付き、元の節と子孫は薄く、
// 子として入る節には点線の枠、兄弟の間に入る所には線を出す）。押している間は、選んだ節を真ん中に持ってこない（離してから）。
// 足す・書き換える・付け替えるのが紙に入らないので断られたら、トーストで知らせる
import { type CSSProperties, Fragment, type RefObject, useEffect, useRef, useState } from "react"
import { type Point, placement, type Size, type StageView, toPaper } from "../../../../plugin-api"
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
import { RichBar, RichText, useResize, useZoomMotion } from "../../../base/ui"
import { NODE_ADD, NODE_MOVE, NODE_REMOVE, NODE_UPDATE } from "../actions"
import { dropAt, subtreeIds } from "../drag"
import {
  addArgs,
  afterRemove,
  centerShift,
  editEnd,
  nodeOf,
  type Plus,
  plusesOf,
  plusPoint,
  selectedIn,
  toolZoom,
  withCaption,
} from "../edit"
import { GROW } from "../grow"
import { kit } from "../kit"
import { editorWidth, type LaidNode, layoutTree } from "../layout"
import { DEFAULT_LINE_SHAPE, LINE_SHAPE, treePath } from "../line-shape"
import { TreeRootSchema } from "../node"
import { DEFAULT_NODE_SHAPE, NODE_SHAPE } from "../shape"
import { DEFAULT_NODE_SIZE, NODE_SIZE } from "../size"
import { EDIT_TOOL } from "../tools"
import { NODE_CONTEXT, TREE_CONTEXT, TREE_PAGE_SETTINGS_DIALOG } from "../tree"
import { nodePaint } from "./paint"
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
      <Content stage={stage} view={view} area={ref} />
    </div>
  )
}

function Content({
  stage,
  view,
  area,
}: {
  stage: StageView
  view: Size | null
  area: RefObject<HTMLDivElement | null>
}) {
  const t = useMessages(kit)
  const p = placement(stage)
  // 倍率と、編集の道具で選んでいる節が替わったときは、紙の動きをなめらかにする
  const motion = useZoomMotion(stage.zoom, stage.tool === EDIT_TOOL.id ? (stage.selection[0] ?? "") : "")
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
          transition: motion,
        } as CSSProperties
      }
    >
      {paper?.status === "unknown" && <span className={styles.unknown}>{t("Unknown paper")}</span>}
      <Tree stage={stage} paper={{ w: p.w, h: p.h }} view={view} area={area} />
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
// area はステージの表示領域の要素（押した所を紙の座標に直すのに使う）
function Tree({
  stage,
  paper,
  view,
  area,
}: {
  stage: StageView
  paper: Size
  view: Size | null
  area: RefObject<HTMLDivElement | null>
}) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const book = useShownBook(stage.id)
  const page = useShownPage(stage.id)
  const perform = usePerform(stage.id)
  const { select, setEditing, panStageBy, zoomStage, showToast, openDialog } = useActions()
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
  const editor = useRef<HTMLInputElement>(null)
  const drag = useNodeDrag(stage, area)
  const text = writing && draft?.node === selected ? draft.text : null
  const shown = root.success && selected && text !== null ? withCaption(root.data, selected, text) : root.data
  const size = NODE_SIZE.schema.safeParse(setting(NODE_SIZE.id)).data ?? DEFAULT_NODE_SIZE
  const shape = NODE_SHAPE.schema.safeParse(setting(NODE_SHAPE.id)).data ?? DEFAULT_NODE_SHAPE
  const lineShape = LINE_SHAPE.schema.safeParse(setting(LINE_SHAPE.id)).data ?? DEFAULT_LINE_SHAPE
  const laid = shown ? layoutTree(shown, grow, paper, size, shape) : null
  const at = laid?.nodes.find(n => n.id === selected)
  useCentered(stage, usingEdit && !drag.state ? at : undefined, view, panStageBy)
  useToolZoom(stage.id, usingEdit, zoomStage)
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
    const done = perform(NODE_ADD.id, addArgs(pageId, plus))
    const id = done.ok ? done.result.nodes[0]?.id : undefined
    if (!id) return refused()
    select(stage.id, [id])
    setEditing(stage.id, true)
  }
  const { nodes, lines } = laid
  // ドラッグで動かしている節（押しただけでまだ動かしていなければ null）と、落とす先
  const dragging = drag.state?.moved ? drag.state : null
  const moving = dragging ? subtreeIds(nodeOf(tree, dragging.node) ?? { id: dragging.node, caption: "" }) : null
  const drop = dragging ? dropAt(tree, grow, nodes, dragging.node, dragging.at) : null
  const ghost = dragging && nodes.find(n => n.id === dragging.node)
  drag.onDrop.current = (node, at) => {
    const target = dropAt(tree, grow, nodes, node, at)
    if (!target) return
    const { mark: _mark, ...where } = target
    if (!perform(NODE_MOVE.id, { page: pageId, node, ...where }).ok) refused()
  }
  return (
    <>
      <svg className={styles.lines} width={paper.w} height={paper.h} aria-hidden="true">
        {lines.map(l => (
          <path key={`${l.from.x},${l.from.y}-${l.to.x},${l.to.y}`} d={treePath(l, lineShape)} />
        ))}
      </svg>
      {nodes.map(n => (
        // biome-ignore lint/a11y/noStaticElementInteractions: 節はポインタで選び・編集し始め、キーの操作はコマンドが受ける
        <div
          key={n.id}
          className={styles.node}
          data-node={n.id}
          data-root={n.id === tree.id}
          data-shape={n.id === tree.id ? "box" : shape}
          data-selected={usingEdit && n.id === selected}
          data-dragging={moving?.has(n.id) === true}
          data-drop={drop?.mark.kind === "into" && drop.mark.node === n.id}
          style={{ left: n.x, top: n.y, width: n.w, height: n.h, ...nodePaint(n.color) }}
          onPointerDown={e => {
            if (e.button !== 0 || !usingEdit) return
            if (writing) end(true) // テキストFormが外れるより先に選びが替わるので、ここで確定する
            select(stage.id, [n.id])
            if (n.id !== tree.id) drag.start(n, e.clientX, e.clientY)
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
            if (n.id === tree.id) openDialog(stage.id, TREE_PAGE_SETTINGS_DIALOG.id, { page: pageId })
            else setEditing(stage.id, true)
          }}
        >
          <NodeText node={n} />
        </div>
      ))}
      {ghost && dragging && (
        <div
          className={`${styles.node} ${styles.ghost}`}
          data-root={false}
          data-shape={shape}
          style={{
            left: dragging.at.x - dragging.grab.x,
            top: dragging.at.y - dragging.grab.y,
            width: ghost.w,
            height: ghost.h,
            ...nodePaint(ghost.color),
          }}
        >
          <NodeText node={ghost} />
        </div>
      )}
      {drop?.mark.kind === "between" && (
        <div
          data-drop-line
          className={styles.dropLine}
          style={{
            left: Math.min(drop.mark.from.x, drop.mark.to.x) - 1,
            top: Math.min(drop.mark.from.y, drop.mark.to.y) - 1,
            width: Math.abs(drop.mark.to.x - drop.mark.from.x) + 2,
            height: Math.abs(drop.mark.to.y - drop.mark.from.y) + 2,
          }}
        />
      )}
      {usingEdit && at && !dragging && (
        // 選んでいる節のほかを少し暗くする（節の周りに大きな影を落とす）
        <div data-spotlight className={styles.spotlight} style={{ left: at.x, top: at.y, width: at.w, height: at.h }} />
      )}
      {writing && at && (
        <RichBar
          stage={stage.id}
          target={editor}
          value={text ?? at.caption}
          maxLength={Number.POSITIVE_INFINITY}
          onChange={next => setDraft({ node: selected, text: next })}
          className={styles.editorBar}
          style={{ left: at.x, top: at.y }}
        />
      )}
      {writing && at && (
        <input
          ref={editor}
          className={styles.editor}
          data-shape={selected === tree.id ? "box" : shape}
          aria-label={t("Caption")}
          // biome-ignore lint/a11y/noAutofocus: その場で編集し始めたら、すぐに書ける
          autoFocus
          value={text ?? at.caption}
          style={{ left: at.x, top: at.y, width: editorWidth(text ?? at.caption, at.w), height: at.h }}
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
        !dragging &&
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
              <span className={styles.plusMark}>
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M5 1V9M1 5H9" />
                </svg>
              </span>
            </button>
          )
        })}
    </>
  )
}

// 節のキャプションと、根の本文（描くときだけ）
function NodeText({ node: n }: { node: LaidNode }) {
  return (
    <>
      {n.lines.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 行は折り返した順の並びで、並べ替えない
        <Fragment key={i}>
          {i > 0 && "\n"}
          <RichText line={line} />
        </Fragment>
      ))}
      {n.body && (
        <div className={styles.body}>
          {n.body.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 行は折り返した順の並びで、並べ替えない
            <div key={i}>
              <RichText line={line} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ドラッグを始めるまでに動かす長さ（画面の px）
const DRAG_START = 4

interface NodeDrag {
  node: string
  from: Point // 押した所（画面の座標）
  grab: Point // 節の左上から、押した所まで（紙の座標）
  at: Point // ポインタの所（紙の座標）
  moved: boolean // DRAG_START より動かしたか
}

// 節のドラッグ: start で押した節を覚え、動かすと紙の座標の位置を追い、離したら onDrop に渡す（動かさずに離せば何もしない）。
// 押した所は、ステージ stage の表示領域の要素 area から見た点にして、紙の座標に直す（押している間は紙を動かさない）
function useNodeDrag(stage: StageView, area: RefObject<HTMLDivElement | null>) {
  const [state, setPress] = useState<NodeDrag | null>(null)
  const latest = useRef(state)
  latest.current = state
  const onDrop = useRef<(node: string, at: Point) => void>(() => {})
  const toPaperAt = (cx: number, cy: number): Point | null => {
    const r = area.current?.getBoundingClientRect()
    return r ? toPaper(stage, { x: cx - r.left, y: cy - r.top }) : null
  }
  const toPaperRef = useRef(toPaperAt)
  toPaperRef.current = toPaperAt
  const pressed = state !== null
  useEffect(() => {
    if (!pressed) return
    const move = (e: PointerEvent) => {
      const d = latest.current
      if (!d) return
      if (!d.moved && Math.hypot(e.clientX - d.from.x, e.clientY - d.from.y) < DRAG_START) return
      const at = toPaperRef.current(e.clientX, e.clientY)
      if (at) setPress({ ...d, moved: true, at })
    }
    const up = () => {
      const d = latest.current
      setPress(null)
      if (d?.moved) onDrop.current(d.node, d.at)
    }
    const cancel = () => setPress(null)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
    }
  }, [pressed])
  const start = (node: { id: string; x: number; y: number }, cx: number, cy: number) => {
    const at = toPaperAt(cx, cy)
    if (at)
      setPress({
        node: node.id,
        from: { x: cx, y: cy },
        grab: { x: at.x - node.x, y: at.y - node.y },
        at,
        moved: false,
      })
  }
  return { state, start, onDrop }
}

// 道具が替わったら（初めて描くときも）、道具の倍率にする（edit.ts の toolZoom）
function useToolZoom(stage: string, usingEdit: boolean, zoomStage: (stage: string, zoom: number) => void) {
  useEffect(() => {
    zoomStage(stage, toolZoom(usingEdit))
  }, [stage, usingEdit, zoomStage])
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
