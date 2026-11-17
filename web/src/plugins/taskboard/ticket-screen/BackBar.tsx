// チケットスクリーンの帯の左端: 「← 戻る」（ブラウザの履歴を 1 つ戻す。この窓の中に戻る先が無いときは薄くして押せない）、縦棒、
// 巣箱（コントロールセンターへ一発で戻る: このスクリーンを閉じて、コントロールセンターのスクリーンをカレントにする）。
// 上下に分けて見せている間は、「← 閉じる」（このスクリーンを閉じる）と、巣箱の所に「広げる」（このスクリーンだけを全画面にし、一緒に並べていた物は閉じる）。
// 左の枠を畳んでいる間（folded）は、細い列に収まるよう、戻るを絵だけにして、縦棒を外し、2 つを縦に並べる
import { useBrowserBack, useMessages, useScreens, useUiCatalog } from "../../../plugin-api/ui"
import { IconButton, useScreenSplit } from "../../base/ui"
import { BIRDHOUSE_COMMAND, CONTROL_CENTER_SCREEN } from "../control-center-ids"
import { BackIcon, ExpandIcon } from "../icons"
import { kit } from "../kit"
import styles from "./BackBar.module.css"

export function BackBar({ screen, folded = false }: { screen: string; folded?: boolean }) {
  const t = useMessages(kit)
  const { canGoBack, goBack } = useBrowserBack()
  const { screens, close, makeCurrent } = useScreens()
  const icon = useUiCatalog().commandIcons.get(BIRDHOUSE_COMMAND)
  const split = useScreenSplit()
  const toCenter = () => {
    const center = screens.find(s => s.def === CONTROL_CENTER_SCREEN)
    close(screen)
    if (center) makeCurrent(center.id)
  }
  const back = split.inSplit ? t("Close") : t("Back")
  return (
    <span className={styles.bar} data-folded={folded}>
      <button
        type="button"
        className={styles.back}
        aria-label={back}
        title={back}
        disabled={!split.inSplit && !canGoBack}
        onClick={split.inSplit ? split.close : goBack}
      >
        <BackIcon />
        {folded ? null : back}
      </button>
      {folded ? null : <span className={styles.divider} aria-hidden="true" />}
      {split.inSplit ? (
        <IconButton className={styles.birdhouse} label={t("Expand")} onClick={split.expand}>
          <ExpandIcon />
        </IconButton>
      ) : (
        <IconButton className={styles.birdhouse} label={t("Control center")} onClick={toCenter}>
          {icon}
        </IconButton>
      )}
    </span>
  )
}
