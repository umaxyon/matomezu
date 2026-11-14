// スクラップの見た目の、base の側: 切り抜くダイアログ（ScrapForm で範囲と倍率を決め、トレイに入れる）と、スクラップトレイ（左サイドパネルのタブ）。
// トレイは切り抜いた新しい順に並べ、押すと、今のステージで置ける「スクラップを置く枠」（scrapFrameIn）で、その値のまま置こうとする。× で消す（確かめない）
import { useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { pagedOf } from "../../../core/book"
import type { ItemPage } from "../../../core/placed"
import { sameData } from "../../../core/same"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useActions, useCatalog, useMatomezuState } from "../../../ui/store-context"
import { useAllowedOn, useBook, useRecords, useStage } from "../../../ui/view-hooks"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton, Form } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { useOpenLeftSidePanel } from "../left-side-panel/hooks"
import { defineLeftSidePanelTab } from "../left-side-panel/ui"
import { mailboxEntries } from "../mail/entries"
import { refusalMessage } from "../utils/refusal"
import { SHEET_LAYERS } from "../workspace/slots"
import { SCRAP_CUT_DIALOG, scrapFrameIn } from "."
import { ScrapForm } from "./ScrapForm"
import styles from "./ScrapTray.module.css"
import { ScrapView } from "./ScrapView"
import { pageById, SCRAP, SCRAP_CUT, SCRAP_REMOVE, type Scrap, scrapSize, wholePage } from "./scrap"
import { SCRAP_TRAY_TAB_ID } from "./tab-id"

// 切り抜くダイアログ: 範囲は、はじめはページ全体（等倍）。決めるとトレイに入れ、トレイを開く
export function ScrapCutDialog({ stage, args, onClose }: DialogProps<{ page: string }>) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const { perform, showToast } = useActions()
  const openPanel = useOpenLeftSidePanel()
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
      width={640}
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
        ready={value !== null}
        onSubmit={() => {
          if (!value) return
          const done = perform(SCRAP_CUT.id, value)
          if (!done.ok) {
            showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message("Cut out a scrap")) })
            return
          }
          onClose()
          openPanel(mailboxEntries(stage), SCRAP_TRAY_TAB_ID)
        }}
      >
        {value && <ScrapForm value={value} onChange={setValue} />}
      </Form>
    </Dialog>
  )
}

// スクラップトレイ（開く側が、置くステージ stage を渡す）
function ScrapTrayView({ stage }: { stage: string }) {
  const t = useMessages(kit)
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
  const book = pagedOf(useBook(stage))
  const view = useStage(stage)
  const frame = book && view ? scrapFrameIn(catalog, book, view.edits) : null
  const placing = view?.placing
  const pressed = frame !== null && placing?.item === frame && sameData(placing.props, scrap)
  const removable = useAllowedOn(SCRAP_REMOVE.id, {}, { record: id }).ok
  const label = useMatomezuState(s => {
    const at = pageById(s.books, scrap.page)
    return at ? `${at.book.title} › ${at.page.title}` : t("No Data")
  })
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
        onClick={() => {
          const done = perform(SCRAP_REMOVE.id, {}, { record: id })
          if (!done.ok)
            showToast({ kind: "warn", message: refusalMessage(catalog, done, kit.message("Remove a scrap")) })
        }}
      >
        ×
      </button>
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
