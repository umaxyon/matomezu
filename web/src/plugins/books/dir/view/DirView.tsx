// ディレクトリ構成図のビュー（見せ方 dir）: ステージの紙の置き場所（placement）に紙を描き、その上に開いたページの根のフォルダから下の中身を、
// 上から下へ並べて描く（行と罫線は layout.ts が決める）。行は、アイコン（フォルダは開・閉、ファイル）と、その右の名前（装飾して描く）。
// 説明は、行の右にそろえた列に 1 行で描く（列の位置・… で切るか・出さないか・前の「・・・」・紙を縦に分ける区切り線は、ページの設定の項目から layout.ts が決める）。選んでいる行の説明にも、行と同じ印を付ける。
// フォルダには開け閉めの印（▸・▾）を出し、押すとコマンド folder-toggle で開け閉めする（鉛筆でもハンドでも。アクションが止められていれば押せない形で描く）。
// ページが無ければ、真ん中にページを作るボタン（コマンド page-new）を出す。表に無い紙は「不明な紙」と示し、描けない紙は知らせだけを出す。
// 画面のどこを右クリックしても、ディレクトリ構成図のメニュー（dir-context）を開く。
// 鉛筆の間は、選んでいる行（無ければ根）に印を付け、押した行を選ぶ。行を右クリックすると、その行を選んで行のメニュー（entry-context）を開く。
// 選んでいる行の右には＋（フォルダとファイル。フォルダの行は中の末尾に、ファイルの行はすぐ下に足す。コマンド folder-add・file-add）を出す。
// ダブルクリック（と Enter・F2 のコマンド）で、名前をその場で書き始める。書いている字で行の幅を決め直し、テキストFormのすぐ上に装飾のボックス（base の RichBar）を出す。
// Enter かテキストFormの外を押すと確定、Escape で取り消す。名前の空の中身が空のまま終わったら消す。書き換えが紙に入らず断られたら、トーストで知らせる。
// 中に足す種類を選んでいる間（その場の編集の名前 KIND_PICK。Tab のコマンド）は、選んでいるフォルダの行のすぐ右に、フォルダとファイルを縦に並べた枠を出す。
// ↑・↓ で選び、Enter か押して、その種類を中の末尾に足して名前を書き始める（コマンド folder-add・file-add）。Escape か枠の外へ焦点が移ると、やめる。
// 鉛筆の間は、根でない行を押して動かすとドラッグになり、落とした所で中身ごと付け替える（落とす先は drag.ts が決める。行の写しがポインタに付き、元の行と中身は薄く、
// 中へ入るフォルダの行には点線の枠、行の間に入る所には線を出す）。ポインタが端に近ければ紙をずらす。付け替えが紙に入らず断られたら、トーストで知らせる
import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react"
import { isPaletteName, type Point, placement, type StageView, themeVar, toPaper } from "../../../../plugin-api"
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
import { edgePanner, refusalMessage, settingValue } from "../../../base"
import { RichBar, RichText, useZoomMotion } from "../../../base/ui"
import { ENTRY_MOVE, ENTRY_REMOVE, ENTRY_UPDATE } from "../actions"
import { FILE_ADD, FOLDER_ADD, FOLDER_TOGGLE, KIND_PICK } from "../commands"
import { DIR_CONTEXT, ENTRY_CONTEXT } from "../dir"
import { dropAt, subtreeIds } from "../drag"
import { afterRemove, changeEntry, editEnd, entryOf, selectedIn } from "../edit"
import { type DirFolder, DirFolderSchema } from "../entry"
import { kit } from "../kit"
import { editorWidth, ICON, type LaidRow, layoutDir, nameLeft } from "../layout"
import { noteLookOf } from "../notes"
import { PENCIL_TOOL } from "../tools"
import styles from "./DirView.module.css"

export function DirView({ stage: id }: BookViewProps) {
  const stage = useStage(id)
  const openMenu = useContextMenu(id, DIR_CONTEXT)
  const ref = useRef<HTMLDivElement>(null)
  if (!stage) return null
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
  const p = placement(stage)
  const motion = useZoomMotion(stage.zoom, "")
  const paper = stage.opened?.paper
  if (stage.opened?.page === null) return <NoPages stage={stage} />
  if (paper?.status === "unshowable") return <p className={styles.error}>{t("This paper cannot be shown")}</p>
  if (!p) return null
  return (
    <div
      className={styles.paper}
      role="img"
      aria-label={t("Paper")}
      style={{
        width: p.w,
        height: p.h,
        transform: `translate(${p.x}px, ${p.y}px) scale(${p.zoom})`,
        transition: motion,
      }}
    >
      {paper?.status === "unknown" && <span className={styles.unknown}>{t("Unknown paper")}</span>}
      <Rows stage={stage} paper={{ w: p.w, h: p.h }} area={area} />
    </div>
  )
}

// 開いたページの行と罫線（根の無いページは何も描かない）
function Rows({
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
  const book = useShownBook(stage.id)
  const page = useShownPage(stage.id)
  const perform = usePerform(stage.id)
  const { select, setEditing, showToast } = useActions()
  const toggle = useCommand(stage.id, FOLDER_TOGGLE.id)
  const addFolder = useCommand(stage.id, FOLDER_ADD.id)
  const addFile = useCommand(stage.id, FILE_ADD.id)
  const openEntryMenu = useContextMenu(stage.id, ENTRY_CONTEXT)
  // 書いている字（どの中身のものか）と、テキストFormを出してから終えたか（Enter のあとの blur で 2 度終えない）
  const [draft, setDraft] = useState<{ entry: string; text: string } | null>(null)
  const ended = useRef(false)
  const editor = useRef<HTMLInputElement>(null)
  const drag = useRowDrag(stage, area)
  const root = DirFolderSchema.safeParse((page as { root?: unknown } | null)?.root)
  if (!page || !root.success) return null
  const dir = root.data
  const usingPencil = stage.tool === PENCIL_TOOL.id
  const selected = selectedIn(dir, stage.selection)
  const writing = usingPencil && stage.editing === true
  const picking = usingPencil && stage.editing === KIND_PICK
  const text = writing && draft?.entry === selected ? draft.text : null
  const shown: DirFolder = text === null ? dir : (changeEntry(dir, selected, { name: text }) ?? dir)
  const look = noteLookOf(id => (book ? settingValue(catalog, book, page, id) : undefined))
  const { rows, lines, notes, divider } = layoutDir(shown, paper, look)
  const at = rows.find(r => r.id === selected)
  // ドラッグで動かしている行（押しただけでまだ動かしていなければ null）と、落とす先
  const dragging = drag.state?.moved ? drag.state : null
  const moving = dragging
    ? subtreeIds(entryOf(dir, dragging.entry) ?? { id: dragging.entry, kind: "file", name: "" })
    : null
  const drop = dragging ? dropAt(dir, rows, dragging.entry, dragging.at) : null
  const ghost = dragging && rows.find(r => r.id === dragging.entry)
  const pageId = page.id
  const refused = (done: Parameters<typeof refusalMessage>[1]) =>
    showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message("Does not fit on the paper")) })

  // その場の編集を終える（commit なら書いた字を確定する。することは edit.ts の editEnd が決める）
  const end = (commit: boolean) => {
    if (ended.current) return
    ended.current = true
    const todo = editEnd(dir, selected, commit ? text : null)
    if (todo.kind === "remove") {
      const next = afterRemove(dir, selected)
      if (perform(ENTRY_REMOVE.id, { page: pageId, entry: selected }).ok && next) select(stage.id, [next])
    }
    if (todo.kind === "rename") {
      const done = perform(ENTRY_UPDATE.id, { page: pageId, entry: selected, name: todo.name })
      if (!done.ok) refused(done) // 書けない字は書かず、元の名前のまま
    }
    setDraft(null)
    setEditing(stage.id, false)
  }
  drag.onDrop.current = (entry, point) => {
    const target = dropAt(dir, rows, entry, point)
    if (!target) return
    const { mark: _mark, ...where } = target
    const moved = perform(ENTRY_MOVE.id, { page: pageId, entry, ...where })
    if (!moved.ok) refused(moved)
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
          dropInto={drop?.mark.kind === "into" && drop.mark.entry === r.id}
          onPointerDown={e => {
            if (e.button !== 0 || !usingPencil) return
            if (writing) end(true) // テキストFormが外れるより先に選びが替わるので、ここで確定する
            select(stage.id, [r.id])
            if (r.id !== dir.id) drag.start(r, e.clientX, e.clientY)
          }}
          onDoubleClick={() => {
            if (!usingPencil) return
            select(stage.id, [r.id])
            setEditing(stage.id, true)
          }}
          onContextMenu={e => {
            if (!usingPencil) return
            if (writing) end(true)
            select(stage.id, [r.id])
            openEntryMenu(e, {})
          }}
        />
      ))}
      {writing && at && (
        <RichBar
          stage={stage.id}
          target={editor}
          value={text ?? at.name}
          maxLength={Number.POSITIVE_INFINITY}
          onChange={next => setDraft({ entry: selected, text: next })}
          className={styles.editorBar}
          style={{ left: nameLeft(at.x) - EDITOR_INSET, top: at.y }}
        />
      )}
      {writing && at && (
        <input
          ref={editor}
          className={styles.editor}
          aria-label={t("Name")}
          // biome-ignore lint/a11y/noAutofocus: その場で編集し始めたら、すぐに書ける
          autoFocus
          value={text ?? at.name}
          style={{
            left: nameLeft(at.x) - EDITOR_INSET,
            top: at.y,
            width: editorWidth(text ?? at.name, at.w - (nameLeft(at.x) - at.x)),
            height: at.h,
          }}
          onChange={e => setDraft({ entry: selected, text: e.target.value })}
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
      {notes &&
        rows.map(r =>
          r.note ? (
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
      {ghost && dragging && (
        <div
          className={`${styles.row} ${styles.ghost}`}
          data-kind={ghost.kind}
          style={{
            left: dragging.at.x - dragging.grab.x,
            top: dragging.at.y - dragging.grab.y,
            width: ghost.w,
            height: ghost.h,
            ...paint(ghost.color),
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
            setEditing(stage.id, false)
            ;(kind === "folder" ? addFolder : addFile).run()
          }}
          onCancel={() => setEditing(stage.id, false)}
        />
      )}
      {usingPencil && !writing && !picking && !dragging && at && (
        <div className={styles.pluses} style={{ left: at.x + at.w + PLUS_GAP, top: at.y + at.h / 2 }}>
          {[
            { command: addFolder, kind: "folder", label: "Add folder", icon: FOLDER_ICON },
            { command: addFile, kind: "file", label: "Add file", icon: FILE_ICON },
          ].map(p =>
            p.command.shown ? (
              <button
                key={p.label}
                type="button"
                className={styles.plus}
                data-kind={p.kind}
                aria-label={t(p.label as "Add folder" | "Add file")}
                title={t(p.label as "Add folder" | "Add file")}
                disabled={!p.command.enabled}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => p.command.run()}
              >
                <span className={styles.plusIcon}>{p.icon}</span>
                <svg className={styles.plusMark} viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M5 1V9M1 5H9" />
                </svg>
              </button>
            ) : null,
          )}
        </div>
      )}
    </>
  )
}

// 中に足す種類を選ぶ枠: フォルダとファイルを縦に並べ、初めはフォルダに焦点を置く。↑・↓ で焦点を動かし、Enter か押して onPick、Escape か枠の外へ焦点が移ると onCancel
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
        else if (e.key !== "Enter") return
        else all[i]?.click()
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

// テキストFormの左を、名前の左から内へ寄せる長さ（テキストFormの余白と枠の分。字が動かないように）
const EDITOR_INSET = 6
// 選んでいる行の右と＋の間
const PLUS_GAP = 2

// 中身の色（color）を塗る CSS 変数: アイコンの色（--dir-icon）を上書きする。代表色の名前は、ブックのテーマの代表色のテーマキーを指す
const paint = (color: string | undefined): CSSProperties | undefined =>
  color === undefined
    ? undefined
    : ({ "--dir-icon": isPaletteName(color) ? themeVar(`palette.${color}`) : color } as CSSProperties)

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
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 行はポインタで選び・書き始め、キーの操作はコマンドが受ける */}
      <div
        className={styles.row}
        data-entry={r.id}
        data-kind={r.kind}
        data-selected={selected}
        data-dragging={dragged}
        data-drop={dropInto}
        style={{ left: r.x, top: r.y, width: r.w, height: r.h, ...paint(r.color) }}
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
function RowFace({ row: r }: { row: LaidRow }) {
  return (
    <>
      <span className={styles.icon} style={{ width: ICON, height: ICON }}>
        {r.kind === "file" ? FILE_ICON : r.closed || !r.hasKids ? FOLDER_ICON : OPEN_FOLDER_ICON}
      </span>
      <span className={styles.name} style={{ left: nameLeft(0) }}>
        <RichText line={r.line} />
      </span>
    </>
  )
}

// アイコン（16 の四角の中）: 閉じたフォルダ・開いたフォルダ・ファイル
const FOLDER_ICON = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path className={styles.fill} d="M1.5 3.5h4.2l1.5 1.5h7.3v8.5h-13z" />
  </svg>
)
const OPEN_FOLDER_ICON = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path className={styles.fill} d="M1.5 3.5h4.2l1.5 1.5h6.3v2H4.2L1.5 13.5z" />
    <path className={styles.fill} d="M4.2 7h11l-2.7 6.5h-11z" />
  </svg>
)
const FILE_ICON = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path className={styles.page} d="M3.5 1.5h6l3 3v10h-9z" />
    <path className={styles.page} d="M9.5 1.5v3h3" />
  </svg>
)

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

// ドラッグを始めるまでに動かす長さ（画面の px）
const DRAG_START = 4

interface RowDrag {
  entry: string
  from: Point // 押した所（画面の座標）
  grab: Point // 行の左上から、押した所まで（紙の座標）
  at: Point // ポインタの所（紙の座標）
  moved: boolean // DRAG_START より動かしたか
}

// 行のドラッグ: start で押した行を覚え、動かすと紙の座標の位置を追い、離したら onDrop に渡す（動かさずに離せば何もしない）。
// 押した所は、ステージ stage の表示領域の要素 area から見た点にして、紙の座標に直す。ポインタが表示領域の端に近い間は、その向きへ紙をずらし続ける
function useRowDrag(stage: StageView, area: RefObject<HTMLDivElement | null>) {
  const { panStageBy } = useActions()
  const [state, setPress] = useState<RowDrag | null>(null)
  const latest = useRef(state)
  latest.current = state
  const onDrop = useRef<(entry: string, at: Point) => void>(() => {})
  const local = (cx: number, cy: number): Point | null => {
    const r = area.current?.getBoundingClientRect()
    return r ? { x: cx - r.left, y: cy - r.top } : null
  }
  const localRef = useRef(local)
  localRef.current = local
  const id = stage.id
  const pressed = state !== null
  const pointer = useRef<Point | null>(null) // 最後のポインタの所（画面の座標）
  // 紙がずれたら（描き直したあとのステージで）、ポインタの下の紙の所を追い直す
  const { opened, pan, zoom } = stage
  useEffect(() => {
    const d = latest.current
    const c = pointer.current
    const p = c && localRef.current(c.x, c.y)
    if (!d?.moved || !p) return
    const at = toPaper({ opened, pan, zoom }, p)
    if (at && (at.x !== d.at.x || at.y !== d.at.y)) setPress({ ...d, at })
  }, [opened, pan, zoom])
  const stageRef = useRef(stage)
  stageRef.current = stage
  useEffect(() => {
    if (!pressed) return
    const panner = edgePanner(
      () => {
        const r = area.current?.getBoundingClientRect()
        return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
      },
      (dx, dy) => panStageBy(id, dx, dy),
    )
    const move = (e: globalThis.PointerEvent) => {
      const d = latest.current
      if (!d) return
      pointer.current = { x: e.clientX, y: e.clientY }
      if (!d.moved && Math.hypot(e.clientX - d.from.x, e.clientY - d.from.y) < DRAG_START) return
      const p = localRef.current(e.clientX, e.clientY)
      const at = p && toPaper(stageRef.current, p)
      if (at) setPress({ ...d, moved: true, at })
      panner.follow(pointer.current)
    }
    const finish = (drop: boolean) => {
      const d = latest.current
      pointer.current = null
      panner.stop()
      setPress(null)
      if (d?.moved && drop) onDrop.current(d.entry, d.at)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    return () => {
      panner.stop()
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
    }
  }, [pressed, id, area, panStageBy])
  const start = (row: { id: string; x: number; y: number }, cx: number, cy: number) => {
    const p = local(cx, cy)
    const at = p && toPaper(stage, p)
    if (at)
      setPress({ entry: row.id, from: { x: cx, y: cy }, grab: { x: at.x - row.x, y: at.y - row.y }, at, moved: false })
  }
  return { state, start, onDrop }
}
