// 切り抜くダイアログ（ScrapForm で範囲と倍率を決め、スクラップトレイに入れる）
import { useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { pageById } from "../../../core/book"
import type { ItemPage } from "../../../core/placed"
import { useMessages } from "../../../ui/i18n"
import type { DialogProps } from "../../../ui/plugin"
import { useCatalog, useMatomezuState } from "../../../ui/store-context"
import { useActions } from "../../../ui/view-hooks"
import { Dialog } from "../dialog-host/Dialog"
import { ActionButton, Form } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { useOpenLeftSidePanel } from "../left-side-panel/hooks"
import { refusalMessage } from "../utils/refusal"
import { ScrapForm } from "./ScrapForm"
import { scrapTrayEntries, useScrapFrame } from "./ScrapTray"
import { SCRAP_CUT, type Scrap, wholePage } from "./scrap"
import { SCRAP_TRAY_TAB_ID } from "./tab-id"

// 切り抜くダイアログ: 範囲は、はじめはページ全体（等倍）。決めるとスクラップトレイに入れ、スクラップトレイを開く
export function ScrapCutDialog({ args, onClose }: DialogProps<{ page: string }>) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const { perform, showToast } = useActions()
  const openPanel = useOpenLeftSidePanel()
  const placeable = useScrapFrame() !== null
  const start = useMatomezuState(
    useShallow(s => {
      const at = pageById(s.books, args.page)
      return at ? wholePage(catalog, at.page as ItemPage) : null
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
          if (placeable) openPanel(scrapTrayEntries, SCRAP_TRAY_TAB_ID)
          else showToast({ kind: "success", message: kit.message("Put in the scrap tray") })
        }}
      >
        {value && <ScrapForm value={value} onChange={setValue} />}
      </Form>
    </Dialog>
  )
}
