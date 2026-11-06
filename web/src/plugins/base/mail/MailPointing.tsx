// 郵便が指す物のレイヤー（ウィジェット mail-pointing。ブックのレイヤーに置く）: 郵便のダイアログから行き先を開いたら（pointing.tsx）、指す物をまとめた範囲の上の辺へ
// 鳥（でたらめに 1 羽）を連れてくる。鳥が降りたら指す物それぞれの枠を光らせ、鳥はその鳥の仕草を 1 回してから飛び去り、飛び去ったら枠も消して終える。
// ステージが行き先（ブック・ページ）から離れたら、そこで終える。動きを減らす設定では、枠は光らせずに出すだけにする
import { useEffect, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { useMatomezuState } from "../../../ui/store-context"
import { BIRD_IDS, type Bird } from "../birds"
import { pickBird } from "../birds/assign"
import { BirdWalk, birdClass } from "../birds/BirdWalk"
import { kit } from "../kit"
import { AnchorFrame, Stand } from "../utils/anchors"
import type { StageSlotProps } from "../workspace/ui"
import styles from "./MailPointing.module.css"
import { type Pointing, usePointing, useSetPointing } from "./pointing"

export function MailPointing({ stage }: StageSlotProps) {
  const pointing = usePointing(stage)
  const set = useSetPointing()
  const opened = useMatomezuState(s => s.workspace.stages.find(x => x.id === stage)?.opened ?? null)
  const here = !!pointing && opened?.book === pointing.book && (pointing.page === null || opened.page === pointing.page)
  useEffect(() => {
    if (pointing && !here) set(stage, null)
  }, [pointing, here, stage, set])
  if (!pointing || !here) return null
  return <Visit key={pointing.visit} pointing={pointing} onDone={() => set(stage, null)} />
}

function Visit({ pointing, onDone }: { pointing: Pointing; onDone: () => void }) {
  const t = useMessages(kit)
  const [bird] = useState<Bird>(() => pickBird(BIRD_IDS, Math.random))
  const [arrived, setArrived] = useState(false)
  return (
    <>
      {arrived && pointing.ids.map(id => <AnchorFrame key={id} anchor={id} className={styles.pointed} />)}
      <Stand anchor={pointing.ids} side="edge" span>
        <BirdWalk bird={bird} visit onArrived={() => setArrived(true)} onGone={onDone} awayLabel={t("Mail")}>
          {style => <span className={birdClass} style={style} data-mail-bird />}
        </BirdWalk>
      </Stand>
    </>
  )
}
