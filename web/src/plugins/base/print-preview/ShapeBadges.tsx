// 形のバッジの並び（印刷区画をまたいだ形・印刷区画より大きい形を知らせる右サイドパネルが使う）: 形の名前のバッジを並べ、押すとその形のページを開いて
// 形を選び、真ん中に見せる（印刷プレビューの間なら、ページを開くと印刷プレビューは閉じる）。opened は、ページを開いたあとに呼ぶ（右サイドパネルを開き直すなど）
import { useMessages } from "../../../ui/i18n"
import { useActions } from "../../../ui/store-context"
import { kit } from "../kit"
import { useAnchorName } from "../label/anchor-name"
import { clampChars } from "../text/text"
import { useRequestReveal } from "../utils/reveal-request"
import styles from "./PrintPreviewPanel.module.css"

const BADGE_CHARS = 10 // バッジに出す、名前の始めの字数

export function ShapeBadges({
  stage,
  shapes,
  label,
  opened,
}: {
  stage: string
  shapes: readonly { page: string; id: string }[]
  label: Parameters<typeof kit.message>[0]
  opened?: () => void
}) {
  const t = useMessages(kit)
  const { openPage, select } = useActions()
  const reveal = useRequestReveal()
  const go = (page: string, id: string) => {
    openPage(stage, page)
    opened?.()
    select(stage, [id])
    reveal(stage, [id])
  }
  return (
    // biome-ignore lint/a11y/useSemanticElements: バッジを束ねる並びで、入力Formのまとまり（fieldset）ではない
    <div className={styles.badges} role="group" aria-label={t(label)}>
      {shapes.map(s => (
        <Badge key={s.id} stage={stage} id={s.id} onClick={() => go(s.page, s.id)} />
      ))}
    </div>
  )
}

function Badge({ stage, id, onClick }: { stage: string; id: string; onClick: () => void }) {
  const name = useAnchorName(stage, id)
  return (
    <button type="button" className={styles.badge} title={name} onClick={onClick}>
      {clampChars(name, BADGE_CHARS)}
    </button>
  )
}
