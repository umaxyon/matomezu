// チケットスクリーンの帯の左端: 「← 戻る」（ブラウザの履歴を 1 つ戻す。この窓の中に戻る先が無いときは薄くして押せない）、縦棒、
// 巣箱（コントロールセンターへ一発で戻る: このスクリーンを閉じて、コントロールセンターのスクリーンをカレントにする）。
// 上下に分けて見せている間は、「→ 閉じる」（このスクリーンを閉じる。右へ引っ込むので右向きの矢印）と、巣箱の所に「広げる」（このスクリーンだけを全画面にし、一緒に並べていた物は閉じる）。
// チケットを 2 枚並べている（コントロールセンターが隠れている）間は、「広げる」の右に巣箱も出す（2 枚とも閉じて、コントロールセンターへ戻る）。
// 左の枠を畳んでいる間（folded）は、細い列に収まるよう、戻るを絵だけにして、縦棒を外し、2 つを縦に並べる
import { useBrowserBack, useMessages, useScreens, useUiCatalog } from "../../../plugin-api/ui"
import { IconButton, useScreenSplit, useShowControlCenter } from "../../base/ui"
import { BIRDHOUSE_COMMAND } from "../control-center-ids"
import { BackIcon, CloseRightIcon, ExpandIcon } from "../icons"
import { kit } from "../kit"
import { TICKET_SCREEN } from "."
import styles from "./BackBar.module.css"

export function BackBar({ folded = false }: { folded?: boolean }) {
  const t = useMessages(kit)
  const { canGoBack, goBack } = useBrowserBack()
  const { close } = useScreens()
  const showCenter = useShowControlCenter()
  const icon = useUiCatalog().commandIcons.get(BIRDHOUSE_COMMAND)
  const split = useScreenSplit()
  const toCenter = () => {
    close()
    showCenter()
  }
  const back = split.inSplit ? t("Close") : t("Back")
  const pair = split.inSplit && split.defs.filter(d => d === TICKET_SCREEN.id).length >= 2
  const allToCenter = () => {
    split.closeAll()
    showCenter()
  }
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
        {split.inSplit ? <CloseRightIcon /> : <BackIcon />}
        {folded ? null : back}
      </button>
      {folded ? null : <span className={styles.divider} aria-hidden="true" />}
      {split.inSplit ? (
        <>
          <IconButton className={styles.birdhouse} label={t("Expand")} onClick={split.expand}>
            <ExpandIcon />
          </IconButton>
          {pair ? (
            <IconButton className={styles.birdhouse} label={t("Control center")} onClick={allToCenter}>
              {icon}
            </IconButton>
          ) : null}
        </>
      ) : (
        <IconButton className={styles.birdhouse} label={t("Control center")} onClick={toCenter}>
          {icon}
        </IconButton>
      )}
    </span>
  )
}
