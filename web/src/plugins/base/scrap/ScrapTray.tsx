// スクラップトレイ（左サイドパネルのタブ）と、それを開くボタン。
// スクラップトレイを開けるのは、スクラップフレームを置けるブックを開いているステージだけ（ボタンは、そのときだけ出る。置けないブックに替わったら、開いているスクラップトレイを閉じる）。
// スクラップトレイは切り抜いた新しい順に並べ、押すと、今のステージで置けるスクラップフレーム（scrapFrameIn）で、その値のまま置こうとする。× は確かめてから消す
import { useEffect, useState } from "react"
import { pageById } from "../../../core/book"
import { sameData } from "../../../core/same"
import { shownType } from "../../../core/stage"
import { useMessages } from "../../../ui/i18n"
import { useRecords } from "../../../ui/record-hooks"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { useActions, useAllowedOn, usePage, useStage } from "../../../ui/view-hooks"
import { Confirm } from "../dialog-host/Confirm"
import { kit } from "../kit"
import { useCloseLeftSidePanel, useLeftSidePanelShows, useToggleLeftSidePanel } from "../left-side-panel/hooks"
import type { LeftSidePanelEntry } from "../left-side-panel/state"
import { paperSize } from "../place/grow"
import footer from "../utils/FooterButtons.module.css"
import { refusalMessage } from "../utils/refusal"
import { scrapFrameIn } from "."
import styles from "./ScrapTray.module.css"
import { ScrapView } from "./ScrapView"
import { SCRAP, SCRAP_REMOVE, type Scrap, scrapSize, scrapToPlace } from "./scrap"
import { SCRAP_TRAY_TAB_ID } from "./tab-id"

// 描いている場所のステージで、スクラップトレイから置くスクラップフレームのアイテム（開いているページに置けなければ null）
export function useScrapFrame() {
  const catalog = useCatalog().core
  const view = useStage()
  const type = shownType(view?.opened ?? null)
  return view && type ? scrapFrameIn(catalog, type, view.edits) : null
}

// スクラップトレイを開く側が、左サイドパネルに渡すタブの組（スクラップトレイだけ）
export const scrapTrayEntries: readonly LeftSidePanelEntry[] = [{ tab: SCRAP_TRAY_TAB_ID, props: {} }]

// スクラップトレイ（描いている場所は、開いた所のステージ。そこに置く）。そのステージで置けないブックに替わったら閉じる
export function ScrapTrayView() {
  const t = useMessages(kit)
  const placeable = useScrapFrame() !== null
  const close = useCloseLeftSidePanel()
  useEffect(() => {
    if (!placeable) close()
  }, [placeable, close])
  const scraps = useRecords(SCRAP.id, { where: [], order: { key: "cutAt", dir: "desc" } })
  if (scraps.length === 0) return <p className={styles.empty}>{t("No scraps")}</p>
  return (
    <ul className={styles.list}>
      {scraps.map(s => (
        <Row key={s.id} id={s.id} scrap={{ page: s.page, area: s.area, scale: s.scale }} />
      ))}
    </ul>
  )
}

// 一覧の絵の幅（px）
const THUMB_W = 220

function Row({ id, scrap }: { id: string; scrap: Scrap }) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const { perform, togglePlacing, showToast } = useActions()
  const view = useStage()
  const frame = useScrapFrame()
  const placing = view?.placing
  // 置くときの値: 開いているページの紙の半分に収める
  const opened = usePage()
  const paper = opened ? paperSize(catalog, opened) : null
  const toPlace = paper ? scrapToPlace(scrap, paper) : scrap
  const pressed = frame !== null && placing?.item === frame && sameData(placing.props, toPlace)
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
        onClick={() => frame && togglePlacing(frame, toPlace)}
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

// スクラップトレイを開くボタン（フッタメニューのツールボックスの並びに置く）: 置けるブックを開いているときだけ出し、押すとスクラップトレイだけを開く（もう一度押すと閉じる）
export function ScrapTrayButton() {
  const t = useMessages(kit)
  const placeable = useScrapFrame() !== null
  const pressed = useLeftSidePanelShows(scrapTrayEntries)
  const toggle = useToggleLeftSidePanel()
  if (!placeable) return null
  return (
    <button
      type="button"
      className={footer.item}
      aria-label={t("Open the scrap tray")}
      title={t("Open the scrap tray")}
      aria-pressed={pressed}
      data-scrap-tray-opener
      onClick={() => toggle(scrapTrayEntries)}
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
