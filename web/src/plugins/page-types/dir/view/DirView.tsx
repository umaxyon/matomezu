// ディレクトリ構成図のビュー（プレゼンテーション dir）: プレゼンテーションのビューのレイヤー（book-content）が描く。紙の枠（PaperFrame。紙の面は下のレイヤーが描く）の中に、開いたページの根のフォルダから下の中身を、
// 上から下へ並べて描く（行と罫線は layout.ts が決める）。行は、アイコン（フォルダは開・閉、ファイル）と、その右の名前（装飾して描く）。
// 説明は、行の右にそろえた列に 1 行で描く（列の位置・… で切るか・出さないか・前の「・・・」・紙を縦に分ける区切り線は、ページの設定の項目から layout.ts が決める）。選んでいる行の説明にも、行と同じ印を付ける。
// フォルダには開け閉めの印（▸・▾）を出し、押すとコマンド folder-toggle で開け閉めする（鉛筆でもハンドでも。アクションが止められていれば押せない形で描く）。
// 画面のどこを右クリックしても、ディレクトリ構成図のメニュー（dir-context）を開く。
// 鉛筆の間は、選んでいる行（無ければ根）に印を付け、押した行を選ぶ。行を右クリックすると、その行を選んで行のメニュー（node-context）を開く。
// 選んでいる行の右には＋（フォルダとファイル。フォルダの行は中の末尾に、ファイルの行はすぐ下に足す。コマンド folder-add・file-add）を出す。
// ダブルクリック（と Enter・F2 のコマンド）で、名前をその場で書き始める。書いている字で行の幅を決め直し、装飾を見たまま書く入力Form（base の RichInput）と、そのすぐ上に装飾のボックス（base の RichBar）を出す。
// Enter か入力Formの外を押すと確定、Escape で取り消す（確定と取り消しは in-place.ts のコマンド。入力Formは base の useInPlaceInput で、書いている字は DIR_DRAFT・DIR_NOTE_DRAFT に置く）。名前の空の中身が空のまま終わったら消す。書き換えが紙に入らず断られたら、トーストで知らせる。
// 説明を出している間は、説明の列（説明の無い行は、その行の高さの空き）をダブルクリックすると、説明をその場で書き始める（その場の編集の名前 NOTE_EDIT）。
// 入力Formは説明の列の幅で、確定のしかたは名前と同じ。空にして確定すると説明を消す。
// 中に足す種類を選んでいる間（その場の編集の名前 KIND_PICK。Tab のコマンド）は、選んでいるフォルダの行のすぐ右に、フォルダとファイルを縦に並べた枠を出す。
// ↑・↓ で選び、Enter か押して、その種類を中の末尾に足して名前を書き始める（コマンド folder-add・file-add）。Escape か枠の外へ焦点が移ると、やめる。
// 鉛筆の間は、根でない行を押して動かすとドラッグになり、落とした所で中身ごと付け替える（落とす先は drag.ts が決める。行の写しがポインタに付き、元の行と中身は薄く、
// 中へ入るフォルダの行には点線の枠、行の間に入る所には線を出す）。ポインタが端に近ければ紙をずらす。付け替えが紙に入らず断られたら、トーストで知らせる
import { type MouseEvent, memo, type PointerEvent, type RefObject, useMemo, useRef } from "react"
import { NO_AREA, NO_PAGE, NO_PAPER, NO_STAGE, paperOf, type StageView } from "../../../../plugin-api"
import {
  useActions,
  useAllowed,
  useCommand,
  useContextMenu,
  useCoreCatalog,
  useMessages,
  usePerform,
  useShownPage,
  useStage,
  useStageArea,
} from "../../../../plugin-api/ui"
import { growOf, NO_DRAFT, NO_GROW, pageContext } from "../../../base"
import {
  FolderIcon,
  NO_WRITING,
  NOT_COMPOSING,
  NOT_PRESSED,
  PaperFrame,
  RichBar,
  RichInput,
  type RichInputHandle,
  RichText,
  Tip,
  useAnchorRef,
  useFollowsSelection,
  useInPlaceInput,
  usePaperDrag,
} from "../../../base/ui"
import { NODE_MOVE, NODE_UPDATE } from "../actions"
import { FILE_ADD, FOLDER_ADD, FOLDER_TOGGLE, fitRefusal, KIND_PICK, NAME_EDIT } from "../commands"
import { DIR_CONTEXT, NODE_CONTEXT } from "../dir"
import { dropAt, subtreeIds } from "../drag"
import { changeNode, nodeOf, selectedIn } from "../edit"
import {
  DIR_DRAFT,
  DIR_EDIT_COMMIT,
  DIR_EDIT_KEY_SCOPE,
  DIR_NOTE_DRAFT,
  NOTE_EDIT,
  writingName,
  writingNote,
} from "../in-place"
import { kit } from "../kit"
import { editorWidth, ICON, type LaidRow, nameLeft } from "../layout"
import { dirRootOf } from "../node"
import { NodeIcon } from "../node-icon"
import { FileIcon } from "../node-icons"
import { laidArea, laidPage } from "../print"
import { PENCIL_TOOL } from "../tools"
import styles from "./DirView.module.css"

export function DirView() {
  const stage = useStage()
  const openMenu = useContextMenu(DIR_CONTEXT)
  const ref = useRef<HTMLDivElement>(null)
  if (stage === NO_STAGE) return null
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 右クリックのメニューはポインタの操作で、キーの操作はメニューとコマンドが受ける
    <div ref={ref} className={styles.dir} onContextMenu={e => openMenu(e, {})}>
      <Content stage={stage} area={ref} />
    </div>
  )
}

// area はステージの表示領域の要素（押した所を紙の座標に直すのに使う）
function Content({ stage, area }: { stage: StageView; area: RefObject<HTMLDivElement | null> }) {
  const t = useMessages(kit)
  // 紙の大きさ（変わらなければ同じ物を渡し、紙をずらしただけでは行を描き直さない）
  const size = paperOf(stage)
  const w = size === NO_PAPER ? undefined : size.w
  const h = size === NO_PAPER ? undefined : size.h
  const paperSize = useMemo(() => (w !== undefined && h !== undefined ? { w, h } : null), [w, h])
  if (!paperSize) return null
  return (
    <PaperFrame stage={stage} role="img" aria-label={t("Paper")}>
      <Rows stage={stage} paper={paperSize} area={area} />
    </PaperFrame>
  )
}

// 開いたページの行と罫線（根の無いページは何も描かない）。受け取るものが変わらなければ描き直さない（紙をずらしただけでは描き直さない）
const Rows = memo(function Rows({
  stage,
  paper,
  area,
}: {
  stage: StageView
  paper: { w: number; h: number }
  area: RefObject<HTMLDivElement | null>
}) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const shownPage = useShownPage()
  const page = shownPage === NO_PAGE ? undefined : shownPage
  const perform = usePerform()
  const { select, setEditing, showToast } = useActions()
  const toggle = useCommand(FOLDER_TOGGLE.id)
  const addFolder = useCommand(FOLDER_ADD.id)
  const addFile = useCommand(FILE_ADD.id)
  const openNodeMenu = useContextMenu(NODE_CONTEXT)
  const editor = useRef<RichInputHandle>(null)
  const drag = usePaperDrag(stage, area)
  const renamable = useAllowed(NODE_UPDATE.id, page ? { page: page.id } : undefined).ok // 名前・説明を書き始められるか
  // 選択に従う右サイドパネル（書いている伝言など）を出している間は、押しても動かさない
  const follows = useFollowsSelection()
  const movable = useAllowed(NODE_MOVE.id, page ? { page: page.id } : undefined).ok && !follows // ドラッグで動かし始められるか
  const root = dirRootOf(page)
  const usingPencil = stage.tool === PENCIL_TOOL.id
  const selected = root ? selectedIn(root, stage.selection) : undefined
  const writing = writingName({ stage })
  const picking = usingPencil && stage.editing === KIND_PICK
  // 名前と説明の入力Form（書いている字は名前が DIR_DRAFT、説明が DIR_NOTE_DRAFT。名前と説明を同時には書かない）
  const edit = { target: selected ?? NO_WRITING, keyScope: DIR_EDIT_KEY_SCOPE.id, commit: DIR_EDIT_COMMIT.id } as const
  const nameInput = useInPlaceInput(kit, DIR_DRAFT, { ...edit, active: writing })
  const noteInput = useInPlaceInput(kit, DIR_NOTE_DRAFT, { ...edit, active: writingNote({ stage }) })
  const text = nameInput.text === NO_DRAFT ? null : nameInput.text
  // 書いている字を重ねた根
  const shown =
    root && text !== null && selected !== undefined ? (changeNode(root, selected, { name: text }) ?? root) : root
  const growing = page ? growOf(catalog, page) : NO_GROW // ページの増やす向き（可変ページでなければ NO_GROW）
  // 印刷と同じ並べ方（print.ts の laidPage）で、書いている字を重ねた根を 1 度だけ並べる
  const laid =
    page && shown
      ? laidPage(catalog, page, { setting: pageContext(catalog, page).setting, grow: growing }, shown)
      : null
  // 可変ページなら、行と説明が入るだけ右と下へ並べた印刷区画に空きを足した広さを、ステージに知らせる
  useStageArea(growing !== NO_GROW && laid ? laidArea(paper, growing, laid, true).size : NO_AREA)
  if (!page || !root || !shown || !laid || selected === undefined) return null
  const dir = root
  const { rows, lines, notes, divider } = laid
  const at = rows.find(r => r.id === selected)
  const noting = writingNote({ stage }) && notes !== null
  const noteText = noting && noteInput.text !== NO_DRAFT ? noteInput.text : null
  const description = nodeOf(dir, selected)?.description ?? ""
  // ドラッグで動かしている行（押しただけでまだ動かしていなければ null）と、落とす先
  const dragging = drag.state !== NOT_PRESSED && drag.state.moved ? drag.state : null
  const moving = dragging ? subtreeIds(nodeOf(dir, dragging.id) ?? { id: dragging.id, kind: "file", name: "" }) : null
  const drop = dragging ? dropAt(dir, rows, dragging.id, dragging.at) : null
  const ghost = dragging && rows.find(r => r.id === dragging.id)
  const pageId = page.id

  // 書いている途中の名前か説明を確定する（入力Formが外れるより先に選びが替わるので、押したときに確定する）
  const settle = () => {
    nameInput.settle()
    noteInput.settle()
  }
  drag.onDrop.current = (node, point) => {
    const target = dropAt(dir, rows, node, point)
    if (!target) return
    const { mark: _mark, ...where } = target
    const moved = perform(NODE_MOVE.id, { node, ...where }, { page: pageId })
    if (!moved.ok) showToast(fitRefusal(catalog, moved))
  }
  return (
    <>
      <svg className={styles.lines} width={paper.w} height={paper.h} aria-hidden="true">
        {lines.map(l => (
          <path
            key={`${l.from.x},${l.from.y}-${l.to.x},${l.to.y}`}
            d={`M${l.from.x} ${l.from.y}L${l.to.x} ${l.to.y}`}
          />
        ))}
        {divider && <path data-divider d={`M${divider.from.x} ${divider.from.y}L${divider.to.x} ${divider.to.y}`} />}
      </svg>
      {rows.map(r => (
        <Row
          key={r.id}
          row={r}
          toggle={toggle}
          selected={usingPencil && r.id === selected}
          dragged={moving?.has(r.id) === true}
          dropInto={drop?.mark.kind === "into" && drop.mark.node === r.id}
          onPointerDown={e => {
            if (e.button !== 0 || !usingPencil) return
            settle()
            select([r.id])
            if (r.id !== dir.id && movable) drag.start(r, e.clientX, e.clientY)
          }}
          onDoubleClick={() => {
            if (!usingPencil || !renamable) return
            select([r.id])
            setEditing(NAME_EDIT)
          }}
          onContextMenu={e => {
            if (!usingPencil) return
            settle()
            select([r.id])
            openNodeMenu(e, {})
          }}
        />
      ))}
      {writing && at && (
        <RichBar
          target={editor}
          className={styles.editorBar}
          style={{ left: nameLeft(at.x) - EDITOR_INSET, top: at.y }}
        />
      )}
      {writing && at && (
        <RichInput
          ref={editor}
          {...nameInput.input}
          className={styles.editor}
          label={t("Name")}
          value={text ?? at.name}
          style={{
            left: nameLeft(at.x) - EDITOR_INSET,
            top: at.y,
            width: editorWidth(
              (nameInput.composing !== NOT_COMPOSING ? nameInput.composing : text) ?? at.name,
              at.w - (nameLeft(at.x) - at.x),
            ),
            height: at.h,
          }}
        />
      )}
      {notes &&
        usingPencil &&
        rows.map(r => (
          // biome-ignore lint/a11y/noStaticElementInteractions: 説明を書き始めるのはポインタの操作で、キーの操作は行のコマンドが受ける
          <div
            key={`note-cell-${r.id}`}
            className={styles.noteCell}
            data-note-cell={r.id}
            style={{ left: notes.x, top: r.y, width: notes.w, height: r.h }}
            onPointerDown={e => {
              if (e.button !== 0) return
              settle()
              select([r.id])
            }}
            onDoubleClick={() => {
              if (!renamable) return
              select([r.id])
              setEditing(NOTE_EDIT)
            }}
          />
        ))}
      {notes &&
        rows.map(r =>
          r.note && !(noting && r.id === selected) ? (
            <span
              key={`note-${r.id}`}
              className={styles.note}
              data-note={r.id}
              data-selected={usingPencil && r.id === selected}
              style={{ left: notes.x, top: r.y, maxWidth: notes.w, height: r.h }}
            >
              <RichText line={r.note} />
            </span>
          ) : null,
        )}
      {noting && notes && at && (
        <RichBar target={editor} className={styles.editorBar} style={{ left: notes.x - EDITOR_INSET, top: at.y }} />
      )}
      {noting && notes && at && (
        <RichInput
          ref={editor}
          {...noteInput.input}
          className={styles.editor}
          label={t("Description")}
          value={noteText ?? description}
          style={{ left: notes.x - EDITOR_INSET, top: at.y, width: notes.w + EDITOR_INSET, height: at.h }}
        />
      )}
      {ghost && dragging && (
        <div
          className={`${styles.row} ${styles.ghost}`}
          data-kind={ghost.kind}
          style={{
            left: dragging.at.x - dragging.grab.x,
            top: dragging.at.y - dragging.grab.y,
            width: ghost.w,
            height: ghost.h,
          }}
        >
          <RowFace row={ghost} />
        </div>
      )}
      {drop?.mark.kind === "between" && (
        <div
          data-drop-line
          className={styles.dropLine}
          style={{ left: drop.mark.from.x, top: drop.mark.from.y - 1, width: drop.mark.to.x - drop.mark.from.x }}
        />
      )}
      {picking && at && (
        <KindPicker
          at={{ x: at.x + at.w + PLUS_GAP, y: at.y }}
          onPick={kind => {
            setEditing("none")
            ;(kind === "folder" ? addFolder : addFile).run()
          }}
          onCancel={() => setEditing("none")}
        />
      )}
      {usingPencil && !writing && !picking && !dragging && at && (
        <Pluses at={at} addFolder={addFolder} addFile={addFile} />
      )}
    </>
  )
})

// 選んでいる行の右の＋（フォルダとファイル。押すとコマンド folder-add・file-add）
function Pluses({
  at,
  addFolder,
  addFile,
}: {
  at: LaidRow
  addFolder: ReturnType<typeof useCommand<typeof FOLDER_ADD.id>>
  addFile: ReturnType<typeof useCommand<typeof FILE_ADD.id>>
}) {
  const t = useMessages(kit)
  return (
    <div className={styles.pluses} style={{ left: at.x + at.w + PLUS_GAP, top: at.y + at.h / 2 }}>
      {[
        { command: addFolder, id: FOLDER_ADD.id, kind: "folder", label: "Add folder", icon: FOLDER_ICON },
        { command: addFile, id: FILE_ADD.id, kind: "file", label: "Add file", icon: FILE_ICON },
      ].map(p =>
        p.command.shown ? (
          <Tip key={p.label} text={t(p.label as "Add folder" | "Add file")} command={p.id}>
            <button
              type="button"
              className={styles.plus}
              data-kind={p.kind}
              aria-label={t(p.label as "Add folder" | "Add file")}
              disabled={!p.command.enabled}
              onPointerDown={e => e.stopPropagation()}
              onClick={() => p.command.run()}
            >
              <span className={styles.plusIcon}>{p.icon}</span>
              <svg className={styles.plusMark} viewBox="0 0 10 10" aria-hidden="true">
                <path d="M5 1V9M1 5H9" />
              </svg>
            </button>
          </Tip>
        ) : null,
      )}
    </div>
  )
}

// 中に足す種類を選ぶ枠: フォルダとファイルを縦に並べ、初めはフォルダに焦点を置く。↑・↓ で焦点を動かし、押すと（焦点のあるボタンの Enter・Space も）onPick、Escape か枠の外へ焦点が移ると onCancel
function KindPicker({
  at,
  onPick,
  onCancel,
}: {
  at: { x: number; y: number }
  onPick: (kind: "folder" | "file") => void
  onCancel: () => void
}) {
  const t = useMessages(kit)
  const ref = useRef<HTMLDivElement>(null)
  const buttons = () => [...(ref.current?.querySelectorAll("button") ?? [])]
  return (
    <div
      ref={ref}
      className={styles.picker}
      role="menu"
      aria-label={t("Add inside")}
      style={{ left: at.x, top: at.y }}
      onPointerDown={e => e.stopPropagation()}
      onBlur={e => {
        if (!ref.current?.contains(e.relatedTarget as Node | null)) onCancel()
      }}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing) return
        const all = buttons()
        const i = all.indexOf(document.activeElement as HTMLButtonElement)
        if (e.key === "ArrowDown" || e.key === "ArrowUp")
          all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus()
        else if (e.key === "Escape") onCancel()
        else return
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {(["folder", "file"] as const).map((kind, i) => (
        <button
          key={kind}
          type="button"
          role="menuitem"
          className={styles.pick}
          data-kind={kind}
          aria-label={t(kind === "folder" ? "Folder" : "File")}
          title={t(kind === "folder" ? "Folder" : "File")}
          // biome-ignore lint/a11y/noAutofocus: Tab で開いたら、すぐに ↑・↓ で選べる
          autoFocus={i === 0}
          onClick={() => onPick(kind)}
        >
          {kind === "folder" ? FOLDER_ICON : FILE_ICON}
        </button>
      ))}
    </div>
  )
}

// 入力Formの左を、名前の左から内へ寄せる長さ（入力Formの余白と枠の分。字が動かないように）
const EDITOR_INSET = 6
// 選んでいる行の右と＋の間
const PLUS_GAP = 2

function Row({
  row: r,
  toggle,
  selected,
  dragged,
  dropInto,
  onPointerDown,
  onDoubleClick,
  onContextMenu,
}: {
  row: LaidRow
  toggle: { enabled: boolean; run: (args: { folder: string }) => void }
  selected: boolean
  dragged: boolean
  dropInto: boolean
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void
  onDoubleClick: () => void
  onContextMenu: (e: MouseEvent<HTMLDivElement>) => void
}) {
  const t = useMessages(kit)
  const anchor = useAnchorRef() // 行にアンカーを付ける（そばにスタンドを立てられる）
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 行はポインタで選び・書き始め、キーの操作はコマンドが受ける */}
      <div
        ref={anchor(r.id)}
        className={styles.row}
        data-node={r.id}
        data-kind={r.kind}
        data-selected={selected}
        data-dragging={dragged}
        data-drop={dropInto}
        style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      >
        <RowFace row={r} />
      </div>
      {r.toggle && r.hasKids && (
        <button
          type="button"
          className={styles.toggle}
          data-toggle={r.id}
          aria-label={t(r.closed ? "Open" : "Close")}
          aria-expanded={!r.closed}
          disabled={!toggle.enabled}
          tabIndex={-1} // 押しても焦点を取らない（矢印のキーは行を選ぶ・開け閉めするコマンドが受ける）
          style={{ left: r.toggle.x, top: r.toggle.y }}
          onMouseDown={e => e.preventDefault()} // 押しても焦点を取らない
          onPointerDown={e => e.stopPropagation()}
          onClick={() => toggle.run({ folder: r.id })}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d={r.closed ? "M3 1.5L7 5L3 8.5" : "M1.5 3L5 7L8.5 3"} />
          </svg>
        </button>
      )}
    </>
  )
}

// 行の中身: アイコンと、その右の名前
export function RowFace({ row: r }: { row: LaidRow }) {
  return (
    <>
      <span className={styles.icon} style={{ width: ICON, height: ICON }} data-icon={r.icon}>
        <NodeIcon kind={r.kind} {...(r.icon ? { icon: r.icon } : {})} open={!r.closed && r.hasKids} size={ICON} />
      </span>
      <span className={styles.name} style={{ left: nameLeft(0) }}>
        <RichText line={r.line} />
      </span>
    </>
  )
}

// 足す種類を選ぶボタンの絵（フォルダとファイルの既定の絵）
const FOLDER_ICON = <FolderIcon size={ICON} />
const FILE_ICON = <FileIcon size={ICON} />
