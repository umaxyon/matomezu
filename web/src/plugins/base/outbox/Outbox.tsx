// 送信トレイ（ウィジェット outbox。左サイドパネルのタブ）: 開いているブックの伝言とマークを、ページごとに、付けた時点の新しい順に並べる（並べ方は rows.ts）。
// 行の出し方は種類が答える（定義の listed。listed.ts）: 左に種類の絵（スロット annotation-icon のウィジェット）、文（無ければ付けた物の名前。吹き出しと同じ字数まで）、付けた時刻。
// AI が読んだ物は薄くして「既読」。行を押すと左サイドパネルを閉じ、ほかのページならそのページを開いてから、種類が答えた右サイドパネルの中身で開くか（伝言）、
// 倍率そのままで付けた物を真ん中に見せる（マークなど）。「取消」は確かめてから、種類が答えたアクションで消す
import { type ReactNode, useMemo } from "react"
import type { AiAnnotation, Annotation } from "../../../core/annotation"
import type { ActionId } from "../../../core/catalog"
import { useMessages } from "../../../ui/i18n"
import { useActions, useLayout, useReadState } from "../../../ui/store-context"
import { useAllowed, useBook, useCoreCatalog, useUiCatalog } from "../../../ui/view-hooks"
import { useAnnotationsIn, usePerformOrToast } from "../annotation-hooks"
import { kit } from "../kit"
import { useAnchorName } from "../label/anchor-name"
import { useSetLeftSidePanel } from "../left-side-panel/hooks"
import rows from "../left-side-panel/PanelRows.module.css"
import { shownTime } from "../left-side-panel/time"
import { Withdraw } from "../left-side-panel/Withdraw"
import { BUBBLE_CHARS } from "../note/NoteLayer"
import { useOpenRightSidePanel } from "../right-side-panel/hooks"
import { clampChars } from "../text/text"
import { useRequestReveal } from "../utils/reveal-request"
import type { StageSlotProps } from "../workspace/ui"
import { listedOf } from "./listed"
import styles from "./Outbox.module.css"
import { listedPages } from "./rows"
import { ANNOTATION_ICON, type AnnotationIconProps } from "./slots"

export function Outbox({ stage }: StageSlotProps) {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const book = useBook(stage)
  const annotations = useAnnotationsIn(stage)
  const pages = useMemo(() => (book ? listedPages(catalog, book, annotations) : []), [catalog, book, annotations])
  if (pages.length === 0) return <p className={rows.empty}>{t("No notes")}</p>
  const now = new Date()
  return (
    <div className={rows.list}>
      {pages.map(p => (
        <section key={p.page ?? ""} aria-label={p.page ? p.title : t("Elsewhere")}>
          <h3 className={styles.page}>{p.page ? p.title : t("Elsewhere")}</h3>
          <ul className={rows.rows}>
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
  const catalog = useCoreCatalog()
  const name = useAnchorName(stage, a.anchors.at(-1) ?? "")
  const listed = listedOf(catalog, a)
  const at = listed?.def.addedAt(listed.props as never) ?? null
  const text = clampChars(listed?.def.text?.(listed.props as never) ?? name, BUBBLE_CHARS)
  const withdraw = listed?.def.withdraw
  // 取消のアクションを行えなければ（認可ステップが止めたなど）、取消を押せなくする
  const withdrawable = useAllowed(stage, (withdraw?.action ?? "") as ActionId).ok
  return (
    <li className={rows.row} data-read={!a.awaits}>
      <button type="button" className={rows.open} onClick={() => go(a, listed?.def.panel)}>
        <Icon stage={stage} annotation={a} />
        <span className={rows.text}>{text}</span>
        {!a.awaits && <span className={styles.read}>{t("Read")}</span>}
        {at && <time className={rows.time}>{shownTime(at, now)}</time>}
      </button>
      {withdraw && (
        <Withdraw name={text} allowed={withdrawable} onWithdraw={() => run(withdraw.action, withdraw.args(a.id))} />
      )}
    </li>
  )
}

// 行の左の絵: 種類ごとに、スロット annotation-icon に置いたウィジェットのうち、その種類の物が描く（無ければ点）
function Icon({ stage, annotation: a }: { stage: string; annotation: Annotation }) {
  const placed: readonly string[] = useLayout().slots[ANNOTATION_ICON] ?? []
  const widgets = useUiCatalog().widgets
  const id = placed.find(w => widgets.get(w)?.annotationIcon?.annotation === a.annotation)
  const View = id ? (widgets.get(id)?.view as ((props: AnnotationIconProps) => ReactNode) | undefined) : undefined
  return (
    <span className={styles.icon}>
      {View ? <View stage={stage} annotation={a} /> : <span className={styles.dot} />}
    </span>
  )
}

// 行を押したときの動き: 左サイドパネルを閉じ、ほかのページならそのページを開いてから、種類が右サイドパネルの中身 panel を答えていればそこで開き、
// 無ければ付けた物を倍率そのままで見せる
function useGo(stage: string): (a: AiAnnotation, panel: string | undefined) => void {
  const read = useReadState()
  const actions = useActions()
  const setLeftSidePanel = useSetLeftSidePanel()
  const openPanel = useOpenRightSidePanel()
  const reveal = useRequestReveal()
  return (a, panel) => {
    setLeftSidePanel(stage, null)
    const opened = read().workspace.stages.find(s => s.id === stage)?.opened
    if (a.page && opened?.page !== a.page) actions.openPage(stage, a.page)
    if (panel) {
      openPanel(stage, { widget: panel, subject: a.id, anchors: a.anchors, current: a.anchors.at(-1) ?? "" })
      return
    }
    // 付けた物が描かれたら見せる（ほかのページを開いたあとは、描かれるのを待つ）
    reveal(stage, a.anchors)
  }
}
