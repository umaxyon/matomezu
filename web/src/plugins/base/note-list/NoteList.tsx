// 伝言一覧（ウィジェット note-list。左ドロワーのタブ）: 開いているブックの伝言とマークを、ページごとに、付けた時点の新しい順に並べる（並べ方は rows.ts）。
// 行の左に、伝言は伝言の絵、マークは鳥の顔（びっくりマークは !）を置き、伝言は吹き出しと同じ字数の文、マークは付けた物の名前を出す。AI が読んだ物は薄くして「既読」。
// 行を押すと左ドロワーを閉じ、ほかのページならそのページを開いてから、伝言は右サイドパネルで開き（吹き出しを押したのと同じ）、マークは倍率そのままで付けた物を真ん中に見せる。
// 「取消」で、その伝言かマークを消す
import { useMemo } from "react"
import type { AiAnnotation } from "../../../core/annotation"
import { useMessages } from "../../../ui/i18n"
import { useActions, useReadState } from "../../../ui/store-context"
import { useBook, useCoreCatalog } from "../../../ui/view-hooks"
import { useAnnotationsIn, usePerformOrToast } from "../annotation-hooks"
import { BIRD_FACES } from "../birds/BirdWalk"
import { kit } from "../kit"
import { useAnchorName } from "../label/anchor-name"
import { useSetLeftDrawer } from "../left-drawer/hooks"
import { MARK, MARK_REMOVE, type MarkProps } from "../mark"
import { NOTE, NOTE_REMOVE, type NoteProps } from "../note"
import { BUBBLE_CHARS, NoteIcon } from "../note/NoteLayer"
import { NOTE_PANEL_ID } from "../note/panel-id"
import { anchorsRect } from "../right-side-panel/anchors-rect"
import { useOpenRightSidePanel } from "../right-side-panel/hooks"
import { revealView } from "../right-side-panel/reveal"
import { clampChars } from "../text/text"
import type { StageSlotProps } from "../workspace/ui"
import { moveView } from "../zoom"
import styles from "./NoteList.module.css"
import { addedAtOf, listedPages, shownTime } from "./rows"

// 押した物を描くまで待つ、いちばん多いコマ数（ほかのページを開いたあと）
const WAIT_FRAMES = 30

export function NoteList({ stage }: StageSlotProps) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const book = useBook(stage)
  const annotations = useAnnotationsIn(stage)
  const pages = useMemo(() => (book ? listedPages(catalog, book, annotations) : []), [catalog, book, annotations])
  if (pages.length === 0) return <p className={styles.empty}>{t("No notes")}</p>
  const now = new Date()
  return (
    <div className={styles.list}>
      {pages.map(p => (
        <section key={p.page ?? ""} aria-label={p.page ? p.title : t("Elsewhere")}>
          <h3 className={styles.page}>{p.page ? p.title : t("Elsewhere")}</h3>
          <ul className={styles.rows}>
            {p.rows.map(a => (
              <Row key={a.id} stage={stage} annotation={a} now={now} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Row({ stage, annotation: a, now }: { stage: string; annotation: AiAnnotation; now: Date }) {
  const t = useMessages(kit)
  const go = useGo(stage)
  const run = usePerformOrToast(stage, "Could not withdraw")
  const name = useAnchorName(stage, a.anchors.at(-1) ?? "")
  const at = addedAtOf(a)
  const isNote = a.annotation === NOTE.id
  const isMark = a.annotation === MARK.id
  const text = isNote ? clampChars((a.props as NoteProps).text, BUBBLE_CHARS) : name
  const remove = isNote ? NOTE_REMOVE.id : isMark ? MARK_REMOVE.id : null
  return (
    <li className={styles.row} data-read={!a.awaits}>
      <button type="button" className={styles.open} onClick={() => go(a)}>
        <Icon annotation={a} />
        <span className={styles.text}>{text}</span>
        {!a.awaits && <span className={styles.read}>{t("Read by AI")}</span>}
        {at && <time className={styles.time}>{shownTime(at, now)}</time>}
      </button>
      {remove && (
        <button
          type="button"
          className={styles.withdraw}
          aria-label={t("Withdraw {name}", { name: text })}
          onClick={() => run(remove, isNote ? { note: a.id } : { mark: a.id })}
        >
          {t("Withdraw")}
        </button>
      )}
    </li>
  )
}

// 行の左の絵: 伝言は伝言の絵、鳥のマークは鳥の顔、びっくりマークは !、ほかの種類は点
function Icon({ annotation: a }: { annotation: AiAnnotation }) {
  if (a.annotation === NOTE.id)
    return (
      <span className={styles.note}>
        <NoteIcon />
      </span>
    )
  if (a.annotation === MARK.id) {
    const kind = (a.props as MarkProps).kind
    if (kind === "alert") return <span className={styles.alert}>!</span>
    return <span className={styles.face} style={{ backgroundImage: `url(${BIRD_FACES[kind]})` }} />
  }
  return <span className={styles.dot} />
}

// 行を押したときの動き: 左ドロワーを閉じ、ほかのページならそのページを開いてから、伝言は右サイドパネルで開き、マークなどは付けた物を倍率そのままで見せる
function useGo(stage: string): (a: AiAnnotation) => void {
  const read = useReadState()
  const actions = useActions()
  const setDrawer = useSetLeftDrawer()
  const openPanel = useOpenRightSidePanel()
  return a => {
    setDrawer(stage, null)
    const opened = read().workspace.stages.find(s => s.id === stage)?.opened
    if (a.page && opened?.page !== a.page) actions.openPage(stage, a.page)
    if (a.annotation === NOTE.id) {
      openPanel(stage, { widget: NOTE_PANEL_ID, subject: a.id, anchors: a.anchors, current: a.anchors.at(-1) ?? "" })
      return
    }
    // ほかのページを開いたら、付けた物が描かれるまで待ってから見せる
    let frames = 0
    const reveal = () => {
      const now = read().workspace.stages.find(s => s.id === stage)
      const rect = now && anchorsRect(stage, a.anchors, now)
      if (now && rect) moveView(actions, now, revealView(now, rect, "keep"))
      else if (frames++ < WAIT_FRAMES) requestAnimationFrame(reveal)
    }
    requestAnimationFrame(reveal)
  }
}
