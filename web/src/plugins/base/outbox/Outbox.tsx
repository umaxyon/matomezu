// 送信トレイ（ウィジェット outbox。左サイドパネルのタブ。開く側が渡したステージで開いているブック）: 伝言とマークを、ページごとに、付けた時点の新しい順に並べる（並べ方は rows.ts）。
// 行の出し方は種類が答える（定義の listed。listed.ts）: 左に種類の絵（スロット annotation-icon のウィジェット）、文（無ければ付けた物の名前。吹き出しと同じ字数まで）、付けた時刻。
// AI が読んだ物は薄くして「既読」。行を押すと（左サイドパネルは閉じず）、ほかのページならそのページを開いてから、種類が答えた右サイドパネルの中身で開くか（伝言）、
// 倍率そのままで付けた物を真ん中に見せる（マークなど）。「取消」は確かめてから、種類が答えたアクションで消す

import { type ReactNode, useMemo } from "react"
import type { AiAnnotation, Annotation } from "../../../core/annotation"
import type { ActionId } from "../../../core/catalog"
import { shownPageId } from "../../../core/stage"
import { useMessages } from "../../../ui/i18n"
import { useLayout } from "../../../ui/store-context"
import { useActions, useAllowed, useBook, useCoreCatalog, useStage, useUiCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { useAnchorName } from "../label/anchor-name"
import { useOpenRightSidePanel } from "../right-side-panel/hooks"
import { useRevealHere } from "../stand/reveal-request"
import { clampChars } from "../text/text"
import { useBookAnnotations, usePerformOrToast } from "../utils/annotation-hooks"
import rows from "../utils/PanelRows.module.css"
import { shownTime } from "../utils/shown-time"
import { Withdraw } from "../utils/Withdraw"
import { listedOf } from "./listed"
import styles from "./Outbox.module.css"
import { listedPages } from "./rows"
import { ANNOTATION_ICON, type AnnotationIconProps } from "./slots"

const ROW_CHARS = 20 // 行に出す、文の始めの字数

export function Outbox() {
  const t = useMessages(kit)
  const catalog = useCoreCatalog()
  const book = useBook()
  const annotations = useBookAnnotations()
  const pages = useMemo(() => (book ? listedPages(catalog, book, annotations) : []), [catalog, book, annotations])
  if (pages.length === 0) return <p className={rows.empty}>{t("No notes")}</p>
  const now = new Date()
  return (
    <div className={rows.list}>
      {pages.map(p => (
        <section key={p.page} aria-label={p.title}>
          <h3 className={styles.page}>{p.title}</h3>
          <ul className={rows.rows}>
            {p.rows.map(a => (
              <Row key={a.id} annotation={a} now={now} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Row({ annotation: a, now }: { annotation: AiAnnotation; now: Date }) {
  const t = useMessages(kit)
  const go = useGo()
  const run = usePerformOrToast(kit.message("Could not withdraw"))
  const catalog = useCoreCatalog()
  const name = useAnchorName(a.anchors.at(-1) ?? "")
  const listed = listedOf(catalog, a)
  const at = listed?.def.addedAt(listed.props as never) ?? null
  const text = clampChars(listed?.def.text?.(listed.props as never) ?? name, ROW_CHARS)
  const withdraw = listed?.def.withdraw
  // 取消のアクションを、その物の付いているページで行えなければ（認可ステップが止めたなど）、取消を押せなくする
  const withdrawable = useAllowed((withdraw?.action ?? "") as ActionId, { page: a.page }).ok
  return (
    <li className={rows.row} data-read={!a.awaits}>
      <button type="button" className={rows.open} onClick={() => go(a, listed?.def.panel)}>
        <Icon annotation={a} />
        <span className={rows.text}>{text}</span>
        {!a.awaits && <span className={styles.read}>{t("Read")}</span>}
        {at && <time className={rows.time}>{shownTime(at, now)}</time>}
      </button>
      {withdraw && (
        <Withdraw
          name={text}
          allowed={withdrawable}
          onWithdraw={() => run(withdraw.action, withdraw.args(a.id), a.page)}
        />
      )}
    </li>
  )
}

// 行の左の絵: 種類ごとに、スロット annotation-icon に置いたウィジェットのうち、その種類の物が描く（無ければ点）
function Icon({ annotation: a }: { annotation: Annotation }) {
  const placed: readonly string[] = useLayout().slots[ANNOTATION_ICON] ?? []
  const widgets = useUiCatalog().widgets
  const id = placed.find(w => widgets.get(w)?.forKind === a.annotation)
  const View = id ? (widgets.get(id)?.view as ((props: AnnotationIconProps) => ReactNode) | undefined) : undefined
  return <span className={styles.icon}>{View ? <View annotation={a} /> : <span className={styles.dot} />}</span>
}

// 行を押したときの動き: ほかのページならそのページを開いてから、種類が右サイドパネルの中身 panel を答えていればそこで開き、
// 無ければ付けた物を倍率そのままで見せる
function useGo(): (a: AiAnnotation, panel: string | undefined) => void {
  const opened = useStage()?.opened
  const { openPage } = useActions()
  const openPanel = useOpenRightSidePanel()
  const reveal = useRevealHere()
  return (a, panel) => {
    if (a.page && shownPageId(opened ?? null) !== a.page) openPage(a.page)
    if (panel) {
      openPanel({ widget: panel, subject: a.id, anchors: a.anchors, current: a.anchors.at(-1) ?? "" })
      return
    }
    // 付けた物が描かれたら見せる（ほかのページを開いたあとは、描かれるのを待つ）
    reveal(a.anchors)
  }
}
