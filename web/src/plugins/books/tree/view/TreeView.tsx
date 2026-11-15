// ツリーのビュー（見せ方 tree）: ブックのビューのレイヤー（book-content）が描く。紙の枠（PaperFrame。紙の面は下のレイヤーが描く）の中に、開いたページの根から伸びる木を描く
// （節の位置と線は layout.ts が伸びる向きから決める）。
// ページが無ければ、真ん中にページを作るボタン（コマンド page-new）を出す。表に無い紙は「不明な紙」と示し、描けない紙は知らせだけを出す。
// 画面のどこを右クリックしても、ツリーのメニュー（tree-context）を開く。編集の道具の間に節を右クリックすると、その節を選んで節のメニュー（node-context）を開く。
// 編集の道具の間は、選んでいる節（無ければ根）に印を付け、ほかを少し暗くし、押した節を選ぶ。選んでいる節がいつもビューの真ん中に来るように紙をずらす
// （編集の道具では 125%、ほかの道具では 100% に。選ぶ節が替わると紙の動きをなめらかにする）。
// 選んでいる節には＋（子・前と後ろの兄弟。中央の木の根は上下左右の子。ふだんは小さな点で、ポインタを近づけると＋の丸に開く）を出し、押すと空の節を足して、その場で編集し始める。ダブルクリック（と F2 のコマンド）でも編集し始める
// （根はページの設定のダイアログを開く）。節の形が下線でも、根は箱で描く。
// その場で編集中は、書いている字で節の大きさを決め直し、装飾を見たまま書く入力Form（base の RichInput）と、そのすぐ上に装飾のボックス（base の RichBar。太字と文字の色）を出す（押しても焦点は外れない）。キャプションは普通の太さで、装飾して描く。節の形が下線なら、入力Formと選んでいる印も下線で描く。Enter か入力Formの外を押すと確定、Escape で取り消す。空のまま終えた、キャプションの空の子は消す。
// 編集の道具の間は、根でない節を押して動かすとドラッグになり、落とした所で子孫ごと付け替える（落とす先は drag.ts が決める。節の写しがポインタに付き、元の節と子孫は薄く、
// 子として入る節には点線の枠、兄弟の間に入る所には線を出す）。押している間は、選んだ節を真ん中に持ってこない（離してから）。
// ドラッグの間は倍率を 100% にし、ポインタが端に近ければ紙をずらす（遠くの節にも落とせる）。終えたら編集の倍率に戻す。
// 足す・書き換える・付け替えるのが紙に入らないので断られたら、トーストで知らせる
import { Fragment, memo, type RefObject, useEffect, useMemo, useRef, useState } from "react"
import { paperOf, placement, type Size, type StageView } from "../../../../plugin-api"
import {
  useActions,
  useAllowed,
  useCommand,
  useContextMenu,
  useCoreCatalog,
  useLatestPan,
  useMessages,
  usePerform,
  usePluginState,
  useSetPluginState,
  useShownBook,
  useShownPage,
  useStage,
  useStageArea,
} from "../../../../plugin-api/ui"
import { growOf, pageContext, refusalMessage, settingValue } from "../../../base"
import {
  PaperFrame,
  RichBar,
  RichInput,
  type RichInputHandle,
  RichText,
  useAnchorRef,
  useBookTheme,
  useFollowsSelection,
  usePaperDrag,
  useResize,
  useSwatches,
} from "../../../base/ui"
import { NODE_ADD, NODE_MOVE, NODE_REMOVE, NODE_UPDATE } from "../actions"
import { dropAt, subtreeIds } from "../drag"
import {
  ADDED_EDIT,
  addArgs,
  afterRemove,
  centerShift,
  editEnd,
  NODE_COLOR_PICK,
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
import { editorWidth, type LaidNode } from "../layout"
import { LINE_SHAPE, treePath } from "../line-shape"
import { treeRootOf } from "../node"
import { laidArea, laidOrigin, laidPage } from "../print"
import { NODE_SHAPE } from "../shape"
import { TREE_FOCUS_RELEASED_STATE } from "../states"
import { EDIT_TOOL } from "../tools"
import { NODE_CONTEXT, NODE_FILL, TREE_CONTEXT, TREE_PAGE_SETTINGS_DIALOG } from "../tree"
import { NodeColorStand } from "./NodeColorStand"
import { nodePaint } from "./paint"
import styles from "./TreeView.module.css"
import { useNodeWrite } from "./useNodeWrite"

export function TreeView() {
  const stage = useStage()
  const openMenu = useContextMenu(TREE_CONTEXT)
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
  // 紙の大きさ（変わらなければ同じ物を渡し、紙をずらしただけでは木を描き直さない）
  const size = paperOf(stage)
  const w = size?.w
  const h = size?.h
  const paperSize = useMemo(() => (w !== undefined && h !== undefined ? { w, h } : null), [w, h])
  const paper = stage.opened?.paper
  if (stage.opened?.page === null) return <NoPages stage={stage} />
  if (paper?.status === "unshowable") return <p className={styles.error}>{t("This paper cannot be shown")}</p>
  if (!paperSize) return null
  return (
    <PaperFrame stage={stage} role="img" aria-label={t("Paper")}>
      {paper?.status === "unknown" && <span className={styles.unknown}>{t("Unknown paper")}</span>}
      <Tree stage={stage} paper={paperSize} view={view} area={area} />
    </PaperFrame>
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
// area はステージの表示領域の要素（押した所を紙の座標に直すのに使う）。受け取るものが変わらなければ描き直さない（紙をずらしただけでは描き直さない）
const Tree = memo(function Tree({
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
  const book = useShownBook()
  const page = useShownPage()
  const perform = usePerform()
  const { select, setEditing, panStageBy, zoomStage, showToast, openDialog, continueStep } = useActions()
  const anchor = useAnchorRef() // 節にアンカーを付ける（そばにスタンドを立てられる）
  // 変更を始めてよいか（動かす・書き換える・足す。認可ステップが止めていれば始めない）
  const where = page ? { page: page.id } : undefined
  // 選択に従う右サイドパネル（書いている伝言など）を出している間は、押しても動かさない
  const follows = useFollowsSelection()
  const movable = useAllowed(NODE_MOVE.id, where).ok && !follows
  const editable = useAllowed(NODE_UPDATE.id, where).ok
  const addable = useAllowed(NODE_ADD.id, where).ok
  // 画面からの足す・書き換えが断られた（画面が渡すページと節はあるので、認可ステップが止めたのでなければ、断られるのは紙に入らないとき）
  const refused = (done: Parameters<typeof refusalMessage>[1]) =>
    showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message("Does not fit on the paper")) })
  const openNodeMenu = useContextMenu(NODE_CONTEXT)
  const root = treeRootOf(page)
  const grow = settingValue(catalog, book ?? null, page ?? null, GROW)
  const usingEdit = stage.tool === EDIT_TOOL.id
  const selected = root ? selectedIn(root, stage.selection) : null
  const nodeWrite = useNodeWrite(page?.id, selected !== null && selected === root?.id)
  const swatches = useSwatches(useBookTheme(book?.id), NODE_FILL) // 節の色のスタンドに並べる色
  const picking = usingEdit && stage.editing === NODE_COLOR_PICK && selected !== null // 節の色を選んでいる
  // 背景編集モードの間の文字枠の書き換え（slide のもの。stage.editing は同じ true）は、節の書き換えにしない
  const writing =
    usingEdit &&
    stage.edits === "items" &&
    (stage.editing === true || stage.editing === ADDED_EDIT) &&
    selected !== null
  // 書いている字（どの節のものか）と、入力Formを出してから終えたか（Enter のあとの blur で 2 度終えない）
  const [draft, setDraft] = useState<{ node: string; text: string } | null>(null)
  const [composing, setComposing] = useState<string | null>(null) // 変換中（確定する前）の字。枠の幅だけに使う
  const ended = useRef(false)
  const editor = useRef<RichInputHandle>(null)
  // 節のドラッグ: 動かし始めたら、ポインタの所を中心に倍率を 100% にし（遠くの節にも落とせる）、終えたら編集の道具の倍率に戻す
  const drag = usePaperDrag(stage, area, {
    begin: p => zoomStage(1, p),
    end: () => zoomStage(toolZoom(true)),
  })
  const text = writing && draft?.node === selected ? draft.text : null
  const shown = root && selected && text !== null ? withCaption(root, selected, text) : root
  const shape = settingValue(catalog, book ?? null, page ?? null, NODE_SHAPE)
  const lineShape = settingValue(catalog, book ?? null, page ?? null, LINE_SHAPE)
  // ページの増やす向き（可変ページでなければ undefined）
  const growing = book && page ? growOf(catalog, book, page) : undefined
  // 印刷と同じ並べ方（print.ts の laidPage）で、書いている字を重ねた木を並べる
  const laid =
    book && page && shown
      ? laidPage(catalog, page, { setting: pageContext(catalog, book, page).setting, grow: growing }, shown)
      : null
  // 可変ページなら、節の外枠が入るだけ並べた印刷区画に空きを足した広さと、木全体をずらした印刷区画の数を、ステージに知らせる
  useStageArea(laid && growing ? laidArea(paper, growing, laid, true).size : null, laidOrigin(laid))
  const at = laid?.nodes.find(n => n.id === selected)
  // 節のフォーカス（選んでいる節を中央に置き、そのほかを暗くする）を外している間か。背景編集モードに入ると外し（ページ全体を収める）、
  // 出てもそのまま（見え方は変えない）。節を選ぶか書き換え始めるか、ページを替えると戻る
  const focused = useFocus(stage, page?.id)
  useToolZoom(usingEdit, focused, zoomStage)
  useCentered(stage, usingEdit && focused && !drag.state ? at : undefined, view, panStageBy)
  if (!book || !page || !root || !laid || !selected) return null
  const tree = root
  const pageId = page.id

  // その場の編集を終える（commit なら書いた字を確定する。することは edit.ts の editEnd が決める）
  const end = (commit: boolean) => {
    if (ended.current) return
    ended.current = true
    setComposing(null)
    if (stage.editing === ADDED_EDIT) continueStep(book.id)
    const todo = editEnd(tree, selected, commit ? text : null)
    if (todo.kind === "remove") {
      const next = afterRemove(tree, grow, selected)
      if (perform(NODE_REMOVE.id, { page: pageId, node: selected }).ok && next) select([next])
    }
    const done =
      todo.kind === "root" || todo.kind === "child"
        ? nodeWrite.write(pageId, selected, { caption: todo.caption })
        : null
    if (done && !done.ok) refused(done) // 書けない字は書かず、元のキャプションのまま
    setDraft(null)
    setEditing(false)
  }
  // ＋: 空の節を足して選び、その場で編集し始める
  const add = (plus: Plus) => {
    const done = perform(NODE_ADD.id, addArgs(pageId, plus))
    const id = done.ok ? done.result.nodes[0]?.id : undefined
    if (!id) return refused(done.ok ? { reason: "refused" } : done)
    select([id])
    setEditing(ADDED_EDIT)
  }
  const { nodes, lines } = laid
  // ドラッグで動かしている節（押しただけでまだ動かしていなければ null）と、落とす先
  const dragging = drag.state?.moved ? drag.state : null
  const moving = dragging ? subtreeIds(nodeOf(tree, dragging.id) ?? { id: dragging.id, caption: "" }) : null
  const drop = dragging ? dropAt(tree, grow, nodes, dragging.id, dragging.at) : null
  const ghost = dragging && nodes.find(n => n.id === dragging.id)
  drag.onDrop.current = (node, at) => {
    const target = dropAt(tree, grow, nodes, node, at)
    if (!target) return
    const { mark: _mark, ...where } = target
    const moved = perform(NODE_MOVE.id, { page: pageId, node, ...where })
    if (!moved.ok) refused(moved)
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
          ref={anchor(n.id)}
          className={styles.node}
          data-node={n.id}
          data-root={n.id === tree.id}
          data-shape={n.id === tree.id ? "box" : shape}
          data-selected={usingEdit && focused && n.id === selected}
          data-dragging={moving?.has(n.id) === true}
          data-drop={drop?.mark.kind === "into" && drop.mark.node === n.id}
          style={{ left: n.x, top: n.y, width: n.w, height: n.h, ...nodePaint(n.color) }}
          onPointerDown={e => {
            if (e.button !== 0 || !usingEdit) return
            if (writing) end(true) // 入力Formが外れるより先に選びが替わるので、ここで確定する
            select([n.id])
            if (n.id !== tree.id && movable) drag.start(n, e.clientX, e.clientY)
          }}
          onContextMenu={e => {
            if (!usingEdit) return
            if (writing) end(true)
            select([n.id])
            openNodeMenu(e, {})
          }}
          onDoubleClick={() => {
            if (!usingEdit) return
            select([n.id])
            if (n.id === tree.id) openDialog(TREE_PAGE_SETTINGS_DIALOG.id, { page: pageId })
            else if (editable) setEditing(true)
          }}
        >
          {/* 編集している節の字は描かない（下線の形の入力Formは地が透けるので、字がダブって見える） */}
          {!(writing && n.id === selected) && <NodeText node={n} />}
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
      {usingEdit && focused && at && !dragging && (
        // 選んでいる節のほかを少し暗くする（節の周りに大きな影を落とす）
        <div data-spotlight className={styles.spotlight} style={{ left: at.x, top: at.y, width: at.w, height: at.h }} />
      )}
      {picking && swatches && (
        <NodeColorStand
          stage={stage.id}
          page={pageId}
          node={selected}
          isRoot={selected === tree.id}
          color={selected === tree.id ? tree.color : nodeOf(tree, selected)?.color}
          swatches={swatches}
        />
      )}
      {writing && at && <RichBar target={editor} className={styles.editorBar} style={{ left: at.x, top: at.y }} />}
      {writing && at && (
        <RichInput
          ref={editor}
          className={styles.editor}
          data={{ "data-shape": selected === tree.id ? "box" : shape }}
          label={t("Caption")}
          multiline={false}
          autoFocus
          value={text ?? at.caption}
          style={{ left: at.x, top: at.y, width: editorWidth(composing ?? text ?? at.caption, at.w), height: at.h }}
          onChange={next => setDraft({ node: selected, text: next })}
          onCompose={setComposing}
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
        focused &&
        addable &&
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
})

// 節のキャプションと、根の本文（描くときだけ）
export function NodeText({ node: n }: { node: LaidNode }) {
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

// 節のフォーカスが付いているか。背景編集モードに入ると外し、ページ全体を収める（出ても外れたまま、見え方も変えない）。
// 選びが空でなくなる（節を選ぶ）・節の書き換えを始める・ページが替わると、付いた状態に戻る
function useFocus(stage: StageView, page: string | undefined): boolean {
  const released = usePluginState(kit, TREE_FOCUS_RELEASED_STATE) === true
  const writeFocus = useSetPluginState(kit, TREE_FOCUS_RELEASED_STATE)
  const fit = useCommand("@matomezu/base:zoom-fit")
  const background = stage.edits === "slide"
  const items = stage.edits === "items"
  const selecting = stage.selection.length > 0
  const editing = stage.editing !== false
  const fitRef = useRef(fit)
  fitRef.current = fit
  const was = useRef(page)
  // biome-ignore lint/correctness/useExhaustiveDependencies: ページが替わったときだけ戻す
  useEffect(() => {
    if (was.current === page) return
    was.current = page
    writeFocus(undefined)
  }, [page])
  // ページを替えて入るとき（ページの右クリックのメニュー）は、替えたあとに外すので、この順
  // biome-ignore lint/correctness/useExhaustiveDependencies: 入ったときだけ外す
  useEffect(() => {
    if (!background) return
    writeFocus(true)
    fitRef.current.run()
  }, [background])
  useEffect(() => {
    if (items && released && (selecting || editing)) writeFocus(undefined)
  }, [items, released, selecting, editing, writeFocus])
  return !released && !background
}

// 道具が替わったら（初めて描くときも）、道具の倍率にする（edit.ts の toolZoom）
// （節のフォーカスを外している間は、見え方を変えない。付き直したら、道具の倍率にする）
function useToolZoom(usingEdit: boolean, focused: boolean, zoomStage: (zoom: number) => void) {
  useEffect(() => {
    if (focused) zoomStage(toolZoom(usingEdit))
  }, [usingEdit, focused, zoomStage])
}

// 紙の上の四角 rect（無ければ何もしない）の真ん中が、大きさ view のビューの真ん中に来るように紙をずらす（紙の端では、ずらせる所まで）。
// 節のフォーカスが付き直したとき（rect が無い所から有る所に替わったとき）は、同じ描き直しで道具の倍率にする操作が出るので、
// その倍率が反映された次の描き直しで中央に置く（倍率が替わると、見えている中心がずれるため）
function useCentered(
  stage: StageView,
  rect: { x: number; y: number; w: number; h: number } | undefined,
  view: Size | null,
  panStageBy: (dx: number, dy: number) => void,
) {
  const latest = useRef(stage)
  latest.current = stage
  const latestPan = useLatestPan()
  const { x, y, w, h } = rect ?? {}
  const [regained, setRegained] = useState(0)
  const waiting = useRef(false)
  const zoomed = useRef(stage.zoom)
  const timer = useRef(0)
  const had = useRef(false)
  const centerNow = useRef<() => void>(() => {})
  centerNow.current = () => {
    const pan = latestPan()
    const at = pan && placement({ ...latest.current, pan })
    if (x === undefined || y === undefined || w === undefined || h === undefined || !view?.w || !view.h || !at) return
    const shift = centerShift({ x, y, w, h }, view, at)
    if (shift) panStageBy(shift.dx, shift.dy)
  }
  const isNone = rect === undefined
  // 付き直したときだけ、倍率が反映された描き直しを待つ（道具の倍率が今と同じなら倍率は替わらないので、少し待って待つのをやめる）
  useEffect(() => {
    if (!isNone && !had.current) {
      waiting.current = true
      zoomed.current = latest.current.zoom
      setRegained(n => n + 1)
      timer.current = window.setTimeout(() => {
        waiting.current = false
      }, 300)
    }
    had.current = !isNone
  }, [isNone])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: 位置が替わったときだけ中央に置く（倍率の操作では置き直さない）
  useEffect(() => {
    centerNow.current()
  }, [x, y, w, h, view, panStageBy, latestPan, isNone])
  // biome-ignore lint/correctness/useExhaustiveDependencies: 付き直したあとの描き直しと、倍率が替わったときに、中央に置く
  useEffect(() => {
    if (!waiting.current) return
    centerNow.current()
    if (latest.current.zoom !== zoomed.current) waiting.current = false
  }, [regained, stage.zoom])
}

function NoPages(_props: { stage: StageView }) {
  const t = useMessages(kit)
  const newPage = useCommand("@matomezu/base:page-new")
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
