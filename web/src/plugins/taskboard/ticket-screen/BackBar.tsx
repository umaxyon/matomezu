// チケットスクリーンの帯の左端: 「← 戻る」（ブラウザの履歴を 1 つ戻す。このタブのアプリの中に戻る先が無いときは薄くして押せない）、縦棒、
// 巣箱（コントロールセンターへ一発で戻る: このスクリーンを閉じて、コントロールセンターのスクリーンをカレントにする）
import { useBrowserBack, useMessages, useScreens, useUiCatalog } from "../../../plugin-api/ui"
import { IconButton } from "../../base/ui"
import { BIRDHOUSE_COMMAND, CONTROL_CENTER_SCREEN } from "../control-center-ids"
import { BackIcon } from "../icons"
import { kit } from "../kit"
import styles from "./BackBar.module.css"

export function BackBar({ screen }: { screen: string }) {
  const t = useMessages(kit)
  const { canGoBack, goBack } = useBrowserBack()
  const { screens, close, makeCurrent } = useScreens()
  const icon = useUiCatalog().commandIcons.get(BIRDHOUSE_COMMAND)
  const toCenter = () => {
    const center = screens.find(s => s.def === CONTROL_CENTER_SCREEN)
    close(screen)
    if (center) makeCurrent(center.id)
  }
  return (
    <>
      <button type="button" className={styles.back} disabled={!canGoBack} onClick={goBack}>
        <BackIcon />
        {t("Back")}
      </button>
      <span className={styles.divider} aria-hidden="true" />
      <IconButton label={t("Control center")} onClick={toCenter}>
        {icon}
      </IconButton>
    </>
  )
}
