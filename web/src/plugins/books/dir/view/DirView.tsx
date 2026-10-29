// ディレクトリ構成図のビュー（見せ方 dir）: ステージの紙の置き場所（placement）に紙を描き、その上に開いたページの根のフォルダから下の中身を、
// 上から下へ並べて描く（行と罫線は layout.ts が決める）。行は、アイコン（フォルダは開・閉、ファイル）と、その右の名前（装飾して描く）。
// フォルダには開け閉めの印（▸・▾）を出し、押すとコマンド folder-toggle で開け閉めする（鉛筆でもハンドでも。アクションが止められていれば押せない形で描く）。
// ページが無ければ、真ん中にページを作るボタン（コマンド page-new）を出す。表に無い紙は「不明な紙」と示し、描けない紙は知らせだけを出す。
// 画面のどこを右クリックしても、ディレクトリ構成図のメニュー（dir-context）を開く。
// 鉛筆の間は、選んでいる行（無ければ根）に印を付け、押した行を選ぶ。行を右クリックすると、その行を選んで行のメニュー（entry-context）を開く。
// 選んでいる行の右には＋（フォルダとファイル。フォルダの行は中の末尾に、ファイルの行はすぐ下に足す。コマンド folder-add・file-add）を出す。
// ダブルクリック（と Enter・F2 のコマンド）で、名前をその場で書き始める。書いている字で行の幅を決め直し、テキストFormのすぐ上に装飾のボックス（base の RichBar）を出す。
// Enter かテキストFormの外を押すと確定、Escape で取り消す。名前の空の中身が空のまま終わったら消す。書き換えが紙に入らず断られたら、トーストで知らせる
import { type CSSProperties, type MouseEvent, type PointerEvent, useRef, useState } from "react"
import { isPaletteName, placement, type StageView, themeVar } from "../../../../plugin-api"
import {
  type BookViewProps,
  useActions,
  useCommand,
  useContextMenu,
  useCoreCatalog,
  useMessages,
  usePerform,
  useShownPage,
  useStage,
} from "../../../../plugin-api/ui"
import { refusalMessage } from "../../../base"
import { RichBar, RichText, useZoomMotion } from "../../../base/ui"
import { ENTRY_REMOVE, ENTRY_UPDATE } from "../actions"
import { FILE_ADD, FOLDER_ADD, FOLDER_TOGGLE } from "../commands"
import { DIR_CONTEXT, ENTRY_CONTEXT } from "../dir"
import { afterRemove, changeEntry, editEnd, selectedIn } from "../edit"
import { type DirFolder, DirFolderSchema } from "../entry"
import { kit } from "../kit"
import { editorWidth, ICON, type LaidRow, layoutDir, nameLeft } from "../layout"
import { PENCIL_TOOL } from "../tools"
import styles from "./DirView.module.css"

export function DirView({ stage: id }: BookViewProps) {
  const stage = useStage(id)
  const openMenu = useContextMenu(id, DIR_CONTEXT)
  if (!stage) return null
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 右クリックのメニューはポインタの操作で、キーの操作はメニューとコマンドが受ける
    <div className={styles.dir} onContextMenu={e => openMenu(e, {})}>
      <Content stage={stage} />
    </div>
  )
}

function Content({ stage }: { stage: StageView }) {
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
      <Rows stage={stage} paper={{ w: p.w, h: p.h }} />
    </div>
  )
}

// 開いたページの行と罫線（根の無いページは何も描かない）
function Rows({ stage, paper }: { stage: StageView; paper: { w: number; h: number } }) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
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
  const root = DirFolderSchema.safeParse((page as { root?: unknown } | null)?.root)
  if (!page || !root.success) return null
  const dir = root.data
  const usingPencil = stage.tool === PENCIL_TOOL.id
  const selected = selectedIn(dir, stage.selection)
  const writing = usingPencil && stage.editing
  const text = writing && draft?.entry === selected ? draft.text : null
  const shown: DirFolder = text === null ? dir : (changeEntry(dir, selected, { name: text }) ?? dir)
  const { rows, lines } = layoutDir(shown, paper)
  const at = rows.find(r => r.id === selected)
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
  return (
    <>
      <svg className={styles.lines} width={paper.w} height={paper.h} aria-hidden="true">
        {lines.map(l => (
          <path
            key={`${l.from.x},${l.from.y}-${l.to.x},${l.to.y}`}
            d={`M${l.from.x} ${l.from.y}L${l.to.x} ${l.to.y}`}
          />
        ))}
      </svg>
      {rows.map(r => (
        <Row
          key={r.id}
          row={r}
          toggle={toggle}
          selected={usingPencil && r.id === selected}
          onPointerDown={e => {
            if (e.button !== 0 || !usingPencil) return
            if (writing) end(true) // テキストFormが外れるより先に選びが替わるので、ここで確定する
            select(stage.id, [r.id])
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
      {usingPencil && !writing && at && (
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

// テキストFormの左を、名前の左から内へ寄せる長さ（テキストFormの余白と枠の分。字が動かないように）
const EDITOR_INSET = 6
// 選んでいる行の右と＋の間
const PLUS_GAP = 10

// 中身の色（color）を塗る CSS 変数: アイコンの色（--dir-icon）を上書きする。代表色の名前は、ブックのテーマの代表色のテーマキーを指す
const paint = (color: string | undefined): CSSProperties | undefined =>
  color === undefined
    ? undefined
    : ({ "--dir-icon": isPaletteName(color) ? themeVar(`palette.${color}`) : color } as CSSProperties)

function Row({
  row: r,
  toggle,
  selected,
  onPointerDown,
  onDoubleClick,
  onContextMenu,
}: {
  row: LaidRow
  toggle: { enabled: boolean; run: (args: { folder: string }) => void }
  selected: boolean
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
        style={{ left: r.x, top: r.y, width: r.w, height: r.h, ...paint(r.color) }}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      >
        <span className={styles.icon} style={{ width: ICON, height: ICON }}>
          {r.kind === "file" ? FILE_ICON : r.closed || !r.hasKids ? FOLDER_ICON : OPEN_FOLDER_ICON}
        </span>
        <span className={styles.name} style={{ left: nameLeft(0) }}>
          <RichText line={r.line} />
        </span>
      </div>
      {r.toggle && r.hasKids && (
        <button
          type="button"
          className={styles.toggle}
          data-toggle={r.id}
          aria-label={t(r.closed ? "Open" : "Close")}
          aria-expanded={!r.closed}
          disabled={!toggle.enabled}
          style={{ left: r.toggle.x, top: r.toggle.y }}
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
