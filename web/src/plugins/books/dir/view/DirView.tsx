// ディレクトリ構成図のビュー（見せ方 dir）: ステージの紙の置き場所（placement）に紙を描き、その上に開いたページの根のフォルダから下の中身を、
// 上から下へ並べて描く（行と罫線は layout.ts が決める）。行は、アイコン（フォルダは開・閉、ファイル）と、その右の名前（装飾して描く）。
// フォルダには開け閉めの印（▸・▾）を出し、押すとコマンド folder-toggle で開け閉めする（鉛筆でもハンドでも。アクションが止められていれば押せない形で描く）。
// ページが無ければ、真ん中にページを作るボタン（コマンド page-new）を出す。表に無い紙は「不明な紙」と示し、描けない紙は知らせだけを出す。
// 画面のどこを右クリックしても、ディレクトリ構成図のメニュー（dir-context）を開く
import type { CSSProperties } from "react"
import { isPaletteName, placement, type StageView, themeVar } from "../../../../plugin-api"
import {
  type BookViewProps,
  useCommand,
  useContextMenu,
  useMessages,
  useShownPage,
  useStage,
} from "../../../../plugin-api/ui"
import { RichText, useZoomMotion } from "../../../base/ui"
import { FOLDER_TOGGLE } from "../commands"
import { DIR_CONTEXT } from "../dir"
import { DirFolderSchema } from "../entry"
import { kit } from "../kit"
import { ICON, type LaidRow, layoutDir, nameLeft } from "../layout"
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
  const page = useShownPage(stage.id)
  const toggle = useCommand(stage.id, FOLDER_TOGGLE.id)
  const root = DirFolderSchema.safeParse((page as { root?: unknown } | null)?.root)
  if (!root.success) return null
  const { rows, lines } = layoutDir(root.data, paper)
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
        <Row key={r.id} row={r} toggle={toggle} />
      ))}
    </>
  )
}

// 中身の色（color）を塗る CSS 変数: アイコンの色（--dir-icon）を上書きする。代表色の名前は、ブックのテーマの代表色のテーマキーを指す
const paint = (color: string | undefined): CSSProperties | undefined =>
  color === undefined
    ? undefined
    : ({ "--dir-icon": isPaletteName(color) ? themeVar(`palette.${color}`) : color } as CSSProperties)

function Row({
  row: r,
  toggle,
}: {
  row: LaidRow
  toggle: { enabled: boolean; run: (args: { folder: string }) => void }
}) {
  const t = useMessages(kit)
  return (
    <>
      <div
        className={styles.row}
        data-entry={r.id}
        data-kind={r.kind}
        style={{ left: r.x, top: r.y, width: r.w, height: r.h, ...paint(r.color) }}
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
