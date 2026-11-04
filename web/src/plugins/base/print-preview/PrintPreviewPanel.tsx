// 印刷プレビューの右サイドパネルの中身（ウィジェット print-preview-panel）: 見出し、ブックのロックの掛け外し、印刷プレビューの設定の項目。
// 項目を変えるとすぐに print-preview-update で変える。ブックがロック中なら先に書き換えてよいかを確かめ、よければロックを外して変え、掛け直す。
// 右サイドパネルの閉じるボタン（と Esc）で閉じると、印刷プレビューも閉じる（PrintPreviewView）。ステージが印刷プレビューでなくなったら、右サイドパネルを閉じる
import { useEffect, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { useCatalog, useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import { useBook, usePerform } from "../../../ui/view-hooks"
import { Confirm } from "../dialog-host/Confirm"
import { kit } from "../kit"
import { BOOK_LOCK, BOOK_UNLOCK } from "../lock"
import { LockIcon } from "../lock/LockIcon"
import { useCloseRightSidePanel, useRightSidePanel } from "../right-side-panel/hooks"
import type { StageSlotProps } from "../workspace/ui"
import { PRINT_PREVIEW_UPDATE } from "."
import styles from "./PrintPreviewPanel.module.css"
import { PRINT_PREVIEW_PANEL_ID } from "./panel-id"
import { PRINT_PREVIEW_SETTINGS } from "./settings"

type Patch = Readonly<Record<string, string | null>>

export function PrintPreviewPanel({ stage }: StageSlotProps) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const ui = useUiCatalog()
  const book = useBook(stage)
  const open = useRightSidePanel(stage)
  const close = useCloseRightSidePanel()
  const perform = usePerform(stage)
  const previewing = useMatomezuState(
    s => s.workspace.stages.find(st => st.id === stage)?.mode.kind === "print-preview",
  )
  const [confirming, setConfirming] = useState<Patch | null>(null)
  const mine = open?.widget === PRINT_PREVIEW_PANEL_ID
  useEffect(() => {
    if (mine && !previewing) close(stage)
  }, [mine, previewing, close, stage])
  if (!book || !mine) return null
  const locked = book.locked === true
  const update = (patch: Patch) => perform(PRINT_PREVIEW_UPDATE.id, { settings: patch })
  const change = (patch: Patch) => (locked ? setConfirming(patch) : update(patch))
  const own = (book as { settings?: Record<string, unknown> }).settings ?? {}
  return (
    <div className={styles.panel}>
      <div className={styles.head}>{t("Print preview")}</div>
      <div className={styles.tools}>
        <button
          type="button"
          className={styles.button}
          aria-label={t(locked ? "Unlock book" : "Lock book")}
          title={t(locked ? "Unlock book" : "Lock book")}
          aria-pressed={locked}
          onClick={() => perform(locked ? BOOK_UNLOCK.id : BOOK_LOCK.id, {})}
        >
          <LockIcon open={!locked} />
        </button>
      </div>
      <div className={styles.settings}>
        {PRINT_PREVIEW_SETTINGS.map(id => {
          const def = catalog.settings.get(id)
          const Control = ui.settingViews.get(id)?.control
          if (!def || !Control) return null
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
      </div>
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
