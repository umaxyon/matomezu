// スクラップの見た目の、base の側: 切り抜くダイアログ（ScrapForm で範囲と倍率を決め、スクラップトレイに入れる）と、スクラップトレイ（左サイドパネルのタブ）と、スクラップトレイを開くボタン。
// スクラップトレイを開けるのは、スクラップフレームを置けるブックを開いているステージだけ（ボタンは、そのときだけ出る。置けないブックに替わったら、開いているスクラップトレイを閉じる）。
// スクラップトレイは切り抜いた新しい順に並べ、押すと、今のステージで置けるスクラップフレーム（scrapFrameIn）で、その値のまま置こうとする。× は確かめてから消す
import { useEffect, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { pageById, pagedOf } from "../../../core/book"
import type { ItemPage } from "../../../core/placed"
import { sameData } from "../../../core/same"
import { useMessages } from "../../../ui/i18n"
import { defineWidget } from "../../../ui/layout"
import type { DialogProps } from "../../../ui/plugin"
import { useActions, useCatalog, useMatomezuState } from "../../../ui/store-context"
import { useAllowedOn, useBook, useRecords, useStage } from "../../../ui/view-hooks"
import { Confirm } from "../dialog-host/Confirm"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton, Form } from "../dialog-host/FormParts"
import { kit } from "../kit"
import {
  useCloseLeftSidePanel,
  useLeftSidePanel,
  useOpenLeftSidePanel,
  useToggleLeftSidePanel,
} from "../left-side-panel/hooks"
import type { LeftSidePanelEntry } from "../left-side-panel/state"
import { defineLeftSidePanelTab } from "../left-side-panel/ui"
import footer from "../utils/FooterButtons.module.css"
import { refusalMessage } from "../utils/refusal"
import { SHEET_LAYERS } from "../workspace/slots"
import { STAGE_SLOTS, type StageSlotProps } from "../workspace/ui"
import { SCRAP_CUT_DIALOG, scrapFrameIn } from "."
import { ScrapForm } from "./ScrapForm"
import styles from "./ScrapTray.module.css"
import { ScrapView } from "./ScrapView"
import { SCRAP, SCRAP_CUT, SCRAP_REMOVE, type Scrap, scrapSize, wholePage } from "./scrap"
import { SCRAP_TRAY_TAB_ID } from "./tab-id"

// 切り抜くダイアログ: 範囲は、はじめはページ全体（等倍）。決めるとスクラップトレイに入れ、スクラップトレイを開く
export function ScrapCutDialog({ stage, args, onClose }: DialogProps<{ page: string }>) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const { perform, showToast } = useActions()
  const openPanel = useOpenLeftSidePanel()
  const placeable = useScrapFrame(stage) !== null
  const start = useMatomezuState(
    useShallow(s => {
      const at = pageById(s.books, args.page)
      return at ? wholePage(catalog, at.book, at.page as ItemPage) : null
    }),
  )
  const [value, setValue] = useState<Scrap | null>(start ? { page: args.page, area: start, scale: 1 } : null)
  const form = "scrap-cut-form"
  return (
    <Dialog
      title={t("Cut out a scrap")}
      large
      onClose={onClose}
      actions={
        <>
          <ActionButton onClick={onClose}>{t("Cancel")}</ActionButton>
          <ActionButton form={form} primary disabled={!value}>
            {t("Put in the tray")}
          </ActionButton>
        </>
      }
    >
      <Form
        id={form}
        fill
        ready={value !== null}
        onSubmit={() => {
          if (!value) return
          const done = perform(SCRAP_CUT.id, value)
          if (!done.ok) {
            showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message("Cut out a scrap")) })
            return
          }
          onClose()
          // 置けるブックなら、スクラップトレイを開く。置けないブックでは、入れたことだけを知らせる
          if (placeable) openPanel(scrapTrayEntries(stage), SCRAP_TRAY_TAB_ID)
          else showToast({ kind: "success", message: kit.message("Put in the scrap tray") })
        }}
      >
        {value && <ScrapForm value={value} onChange={setValue} />}
      </Form>
    </Dialog>
  )
}

// ステージ stage で、スクラップトレイから置くスクラップフレームのアイテム（開いているブックに置けなければ null）
function useScrapFrame(stage: string) {
  const catalog = useCatalog().core
  const book = pagedOf(useBook(stage))
  const view = useStage(stage)
  return book && view ? scrapFrameIn(catalog, book, view.edits) : null
}

// スクラップトレイを開く側が、左サイドパネルに渡すタブの組（スクラップトレイだけ）
const scrapTrayEntries = (stage: string): readonly LeftSidePanelEntry[] => [
  { tab: SCRAP_TRAY_TAB_ID, props: { stage } },
]

// スクラップトレイ（開く側が、置くステージ stage を渡す）。そのステージで置けないブックに替わったら閉じる
function ScrapTrayView({ stage }: { stage: string }) {
  const t = useMessages(kit)
  const placeable = useScrapFrame(stage) !== null
  const close = useCloseLeftSidePanel()
  useEffect(() => {
    if (!placeable) close()
  }, [placeable, close])
  const scraps = useRecords(SCRAP.id, { where: [], order: { key: "cutAt", dir: "desc" } })
  if (scraps.length === 0) return <p className={styles.empty}>{t("No scraps")}</p>
  return (
    <ul className={styles.list}>
      {scraps.map(s => (
        <Row key={s.id} stage={stage} id={s.id} scrap={{ page: s.page, area: s.area, scale: s.scale }} />
      ))}
    </ul>
  )
}

// 一覧の絵の幅（px）
const THUMB_W = 220

function Row({ stage, id, scrap }: { stage: string; id: string; scrap: Scrap }) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const { perform, togglePlacing, showToast } = useActions()
  const view = useStage(stage)
  const frame = useScrapFrame(stage)
  const placing = view?.placing
  const pressed = frame !== null && placing?.item === frame && sameData(placing.props, scrap)
  const removable = useAllowedOn(SCRAP_REMOVE.id, {}, { record: id }).ok
  const label = useMatomezuState(s => {
    const at = pageById(s.books, scrap.page)
    return at ? `${at.book.title} › ${at.page.title}` : t("No Data")
  })
  const [asking, setAsking] = useState(false)
  const remove = () => {
    setAsking(false)
    const done = perform(SCRAP_REMOVE.id, {}, { record: id })
    if (!done.ok) showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message("Remove a scrap")) })
  }
  const size = scrapSize(scrap)
  const fit = Math.min(1, THUMB_W / size.w)
  return (
    <li className={styles.row} data-scrap-row={id}>
      <button
        type="button"
        className={styles.pick}
        aria-pressed={pressed}
        disabled={frame === null}
        title={label}
        onClick={() => frame && togglePlacing(stage, frame, scrap)}
      >
        <span className={styles.thumb} style={{ width: size.w * fit, height: size.h * fit }}>
          <span className={styles.scaled} style={{ transform: `scale(${fit})` }}>
            <ScrapView scrap={scrap} zoom={fit} />
          </span>
        </span>
        <span className={styles.label}>{label}</span>
      </button>
      <button
        type="button"
        className={styles.remove}
        aria-label={t("Remove a scrap")}
        title={t("Remove a scrap")}
        disabled={!removable}
        onClick={() => setAsking(true)}
      >
        ×
      </button>
      {asking && (
        <Confirm
          message={t("Remove this scrap from the tray?")}
          ok={t("Remove a scrap")}
          cancel={t("Cancel")}
          onOk={remove}
          onCancel={() => setAsking(false)}
        />
      )}
    </li>
  )
}

export const SCRAP_TRAY_TAB = defineLeftSidePanelTab<typeof SCRAP_TRAY_TAB_ID, { stage: string }>({
  id: SCRAP_TRAY_TAB_ID,
  title: kit.message("Scrap tray"),
  opens: [SHEET_LAYERS], // 一覧の絵（ScrapView）が、ページの中身のレイヤーを描く
  view: ScrapTrayView,
})

export const SCRAP_DIALOG_VIEWS = { [SCRAP_CUT_DIALOG.id]: ScrapCutDialog }

// スクラップトレイを開くボタン（フッタメニューのツールボックスの並びに置く）: 置けるブックを開いているときだけ出し、押すとスクラップトレイだけを開く（もう一度押すと閉じる）
function ScrapTrayButton({ stage }: StageSlotProps) {
  const t = useMessages(kit)
  const placeable = useScrapFrame(stage) !== null
  const open = useLeftSidePanel()
  const toggle = useToggleLeftSidePanel()
  if (!placeable) return null
  const entries = scrapTrayEntries(stage)
  return (
    <button
      type="button"
      className={footer.item}
      aria-label={t("Open the scrap tray")}
      title={t("Open the scrap tray")}
      aria-pressed={!!open && sameData(open.entries, entries)}
      data-scrap-tray-opener
      onClick={() => toggle(entries)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M4 14h4l1.5 2h5l1.5-2h4v5H4z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect
          x="7"
          y="4"
          width="10"
          height="7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2.5 1.5"
        />
      </svg>
    </button>
  )
}

export const SCRAP_TRAY_BUTTON = defineWidget({
  id: kit.name("scrap-tray-button"),
  slots: STAGE_SLOTS,
  opens: SCRAP_TRAY_TAB.opens,
  view: ScrapTrayButton,
})
