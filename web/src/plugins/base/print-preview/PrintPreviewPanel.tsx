// 印刷プレビューの右サイドパネルの中身（ウィジェット print-preview-panel）: 見出し、拡大縮小の帯（フッタを隠すので、ここに出す。幅か高さに合わせるボタンを足す）、ブックのロックの掛け外し、印刷プレビューの設定の項目（ブックのタイプが選んだ物）。
// 項目を変えるとすぐに print-preview-update で変える。ブックがロック中なら先に書き換えてよいかを確かめ、よければロックを外して変え、掛け直す。
// 右サイドパネルの閉じるボタン（と Esc）で閉じると、印刷プレビューも閉じる（PrintPreviewView）。ステージが印刷プレビューでなくなったら、右サイドパネルを閉じる
import { useEffect, useState } from "react"
import { previewing as isPreviewing } from "../../../core/stage"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import { useAllowed, useBook, usePerform } from "../../../ui/view-hooks"
import { ownSettings, settingDefs } from "../book-settings"
import { Confirm } from "../dialog-host/Confirm"
import { kit } from "../kit"
import { BOOK_LOCK, BOOK_UNLOCK, LOCK } from "../lock"
import { useCloseRightSidePanel, useRightSidePanel } from "../right-side-panel/hooks"
import { LockToggle } from "../utils/LockToggle"
import type { StageSlotProps } from "../workspace/ui"
import { ZoomBar, ZoomButton } from "../zoom/ZoomBar"
import { fitSide, PRINT_PREVIEW_FIT, PRINT_PREVIEW_UPDATE } from "."
import styles from "./PrintPreviewPanel.module.css"
import { PRINT_PREVIEW_PANEL_ID } from "./panel-id"

type Patch = Readonly<Record<string, string | null>>

export function PrintPreviewPanel({ stage }: StageSlotProps) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const ui = useUiCatalog()
  const book = useBook(stage)
  const open = useRightSidePanel(stage)
  const close = useCloseRightSidePanel()
  const perform = usePerform(stage)
  const previewing = useMatomezuState(s => {
    const st = s.workspace.stages.find(st => st.id === stage)
    return !!st && isPreviewing(st)
  })
  const [confirming, setConfirming] = useState<Patch | null>(null)
  // 変えられるか（ロックで止められるなら、確かめてから外して変えるので変えられる。ほかの認可ステップに止められるなら変えられない）
  const changing = useAllowed(stage, PRINT_PREVIEW_UPDATE.id)
  const blocked = !changing.ok && changing.permission !== null && changing.permission !== LOCK.id
  const lockable = useAllowed(stage, book?.locked ? BOOK_UNLOCK.id : BOOK_LOCK.id).ok
  const mine = open?.widget === PRINT_PREVIEW_PANEL_ID
  useEffect(() => {
    if (mine && !previewing) close(stage)
  }, [mine, previewing, close, stage])
  if (!book || !mine) return null
  const locked = book.locked === true
  const update = (patch: Patch) => perform(PRINT_PREVIEW_UPDATE.id, { settings: patch })
  const change = (patch: Patch) => (locked ? setConfirming(patch) : update(patch))
  const own = ownSettings(book)
  return (
    <div className={styles.panel}>
      <div className={styles.head}>{t("Print preview")}</div>
      <ZoomBar stage={stage} fits={<FitButton stage={stage} />} />
      <fieldset className={styles.tools} disabled={!lockable}>
        <LockToggle
          locked={locked}
          label={t(locked ? "Unlock book" : "Lock book")}
          onChange={on => perform(on ? BOOK_LOCK.id : BOOK_UNLOCK.id, {})}
        />
      </fieldset>
      <fieldset className={styles.settings} disabled={blocked}>
        {settingDefs(catalog, book.type, "book", "print-preview").map(def => {
          const id = def.id
          const Control = ui.settingViews.get(id)?.control
          if (!Control) return null
          return (
            <Control
              key={id}
              of="book"
              label={t(def.title)}
              value={own[id]}
              inherited={def.default}
              book={book}
              onChange={(v: string | undefined) => change({ [id]: v ?? null })}
            />
          )
        })}
      </fieldset>
      {confirming && (
        <Confirm
          message={t("This book is locked. Change it anyway?")}
          ok={t("OK")}
          cancel={t("Cancel")}
          onOk={() => {
            perform(BOOK_UNLOCK.id, {})
            update(confirming)
            perform(BOOK_LOCK.id, {})
            setConfirming(null)
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}

// 並べる向きと交わる辺を合わせるボタン（縦に並べるなら幅に合わせる ⟷、横なら高さに合わせる ↕）
function FitButton({ stage }: { stage: string }) {
  const catalog = useCatalog().core
  const book = useBook(stage)
  const fit = useCommand(stage, PRINT_PREVIEW_FIT.id)
  const width = fitSide(catalog, book ?? null) === "width"
  const icon = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={width ? "M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3" : "M12 4v16M9 7l3-3 3 3M9 17l3 3 3-3"} />
    </svg>
  )
  return <ZoomButton command={{ ...fit, title: kit.message(width ? "Fit to width" : "Fit to height") }} icon={icon} />
}
