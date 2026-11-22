// 印刷プレビューの右サイドパネルの中身（ウィジェット print-preview-panel）: 見出し、印刷のボタン（測っている途中と、並べる物が無い間は押せない）、拡大縮小の帯（フッタを隠すので、ここに出す。幅か高さに合わせるボタンを足す）、
// 印刷プレビューで開いているステージエントリのロックの掛け外し（ブックはブックのロック、ブックの外のページ 1 枚はそのページのロック。ブックの外のバインダはロックを持たないので出さない）、印刷プレビューの設定の項目（ページのタイプが選んだ物。
// 紙に入れる名前の無い物（ブックの外のページ 1 枚）には、ブック名を入れる項目を出さない）、印刷区画より大きくて紙の境目で切れる形のバッジ（押すとその形のページの編集へ）。
// 項目を変えるとすぐに print-preview-update で変える。ロック中なら先に書き換えてよいかを確かめ、よければロックを外して変え、掛け直す。
// 右サイドパネルの閉じるボタン（と Esc）で閉じると、印刷プレビューも閉じる（PrintPreviewView）。ステージが印刷プレビューでなくなったら、右サイドパネルを閉じる
import { useEffect, useState } from "react"
import { previewing as isPreviewing } from "../../../core/stage"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useStageHere } from "../../../ui/scope"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"
import { useActions, useAllowed, useAllowedOn, usePerform } from "../../../ui/view-hooks"
import { outermostSettingDefs, ownSettings } from "../book-settings"
import { Confirm } from "../dialog-host/Confirm"
import { kit } from "../kit"
import { BOOK_LOCK, BOOK_UNLOCK, LOCK, PAGE_LOCK, PAGE_UNLOCK } from "../lock"
import { LockToggle } from "../lock/LockToggle"
import { useCloseRightSidePanel, useRightSidePanel } from "../right-side-panel/hooks"
import { ZoomBar, ZoomButton } from "../zoom/ZoomBar"
import { fitSide, PRINT, PRINT_PREVIEW_BOOK_NAME, PRINT_PREVIEW_FIT, PRINT_PREVIEW_UPDATE } from "."
import { entryCrossings } from "./entry-sheets"
import styles from "./PrintPreviewPanel.module.css"
import { PRINT_PREVIEW_PANEL_ID } from "./panel-id"
import { NO_LOCK, NO_NAME, type PreviewedEntry, type PreviewedLock } from "./previewed"
import { ShapeBadges } from "./ShapeBadges"
import { usePreviewed } from "./usePreviewed"

type Patch = Readonly<Record<string, string | null>>
type Lock = Exclude<PreviewedLock, typeof NO_LOCK>
type Perform = ReturnType<typeof usePerform>

export function PrintPreviewPanel() {
  const previewed = usePreviewed()
  const open = useRightSidePanel()
  const close = useCloseRightSidePanel()
  const previewing = useStageHere(st => !!st && isPreviewing(st))
  const mine = open?.widget === PRINT_PREVIEW_PANEL_ID
  useEffect(() => {
    if (mine && !previewing) close()
  }, [mine, previewing, close])
  if (!previewed || !mine) return null
  return <PrintPreviewPanelBody previewed={previewed} />
}

function PrintPreviewPanelBody({ previewed }: { previewed: PreviewedEntry }) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const ui = useUiCatalog()
  const perform = usePerform()
  const { perform: performOther } = useActions()
  const [confirming, setConfirming] = useState<Patch | null>(null)
  // 変えられるか（ロックで止められるなら、確かめてから外して変えるので変えられる。ほかの認可ステップに止められるなら変えられない）
  const changing = useAllowedOn(PRINT_PREVIEW_UPDATE.id, { entry: previewed.id, settings: {} })
  const blocked = !changing.ok && changing.permission !== null && changing.permission !== LOCK.id
  const lock = previewed.lock
  const locked = lock !== NO_LOCK && lock.locked
  const update = (patch: Patch) => performOther(PRINT_PREVIEW_UPDATE.id, { entry: previewed.id, settings: patch })
  const change = (patch: Patch) => (locked ? setConfirming(patch) : update(patch))
  const own = ownSettings(previewed.holder)
  // 紙に入れる名前の無い物には、ブック名を入れる項目を出さない
  const defs = outermostSettingDefs(catalog, "print-preview").filter(
    def => previewed.name !== NO_NAME || def.id !== PRINT_PREVIEW_BOOK_NAME.id,
  )
  // 印刷区画より大きく、紙の境目で切れる形（押すとその形のページの編集へ）
  const oversized = entryCrossings(catalog, previewed).flatMap(f => f.oversized.map(id => ({ page: f.page, id })))
  return (
    <div className={styles.panel}>
      <div className={styles.head}>{t("Print preview")}</div>
      <PrintButton />
      <ZoomBar fits={<FitButton previewed={previewed} />} />
      {lock !== NO_LOCK && <LockSwitch lock={lock} />}
      <fieldset className={styles.settings} disabled={blocked}>
        {defs.map(def => {
          const id = def.id
          const Control = ui.settingViews.get(id)?.control
          if (!Control) return null
          return (
            <Control
              key={id}
              of="outermost"
              label={t(def.title)}
              value={own[id]}
              inherited={def.default}
              page={null}
              onChange={(v: string | undefined) => change({ [id]: v ?? null })}
            />
          )
        })}
      </fieldset>
      {oversized.length > 0 && (
        <>
          <p className={styles.note}>{t("Larger than a print area, so cut at the sheet edges")}</p>
          <ShapeBadges shapes={oversized} label="Boxes larger than a print area" />
        </>
      )}
      {confirming && lock !== NO_LOCK && (
        <Confirm
          message={t("It is locked. Change it anyway?")}
          ok={t("OK")}
          cancel={t("Cancel")}
          onOk={() => {
            switchLock(perform, lock, false)
            update(confirming)
            switchLock(perform, lock, true)
            setConfirming(null)
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}

// ロック lock を、on なら掛け、でなければ外す（ブックは book-lock・book-unlock、ページは page-lock・page-unlock）
function switchLock(perform: Perform, lock: Lock, on: boolean) {
  if (lock.of === "book") perform(on ? BOOK_LOCK.id : BOOK_UNLOCK.id, {})
  else perform(on ? PAGE_LOCK.id : PAGE_UNLOCK.id, {}, { page: lock.page })
}

// ロックの掛け外しのボタン（ブックのロックか、ページのロック）
function LockSwitch({ lock }: { lock: Lock }) {
  const t = useMessages(kit)
  const perform = usePerform()
  const book = lock.of === "book"
  const action = book ? (lock.locked ? BOOK_UNLOCK.id : BOOK_LOCK.id) : lock.locked ? PAGE_UNLOCK.id : PAGE_LOCK.id
  const lockable = useAllowed(action, lock.of === "page" ? { page: lock.page } : undefined).ok
  const label = book ? (lock.locked ? "Unlock book" : "Lock book") : lock.locked ? "Unlock page" : "Lock page"
  return (
    <fieldset className={styles.tools} disabled={!lockable}>
      <LockToggle locked={lock.locked} label={t(label)} onChange={on => switchLock(perform, lock, on)} />
    </fieldset>
  )
}

// 並べる向きと交わる辺を合わせるボタン（縦に並べるなら幅に合わせる ⟷、横なら高さに合わせる ↕）
function FitButton({ previewed }: { previewed: PreviewedEntry }) {
  const catalog = useCatalog().core
  const fit = useCommand(PRINT_PREVIEW_FIT.id)
  const width = fitSide(catalog, previewed) === "width"
  const icon = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={width ? "M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3" : "M12 4v16M9 7l3-3 3 3M9 17l3 3 3-3"} />
    </svg>
  )
  return <ZoomButton command={{ ...fit, title: kit.message(width ? "Fit to width" : "Fit to height") }} icon={icon} />
}

// 印刷のボタン（見出しの下に、横いっぱいの幅で）
function PrintButton() {
  const t = useMessages(kit)
  const print = useCommand(PRINT.id)
  if (!print.shown) return null
  return (
    <button type="button" className={styles.print} disabled={!print.enabled} onClick={() => print.run()}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M7 9V3h10v6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="9" width="18" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect x="7" y="14" width="10" height="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {t("Print")}
    </button>
  )
}
