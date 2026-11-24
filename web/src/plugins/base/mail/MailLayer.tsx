// 郵便の行き先の物のレイヤー（ウィジェット mail-layer。ブックのレイヤーに置く）: 郵便箱の画面から行き先を開いたら（bird-visit.tsx）、行き先の物をまとめた範囲の上の辺へ
// 鳥（でたらめに 1 羽）を連れてくる。鳥が降りたら行き先の物それぞれの枠を光らせ、鳥はその鳥の仕草を 1 回してから飛び去り、飛び去ったら枠も消して終える。
// ステージが行き先（ブック・ページ）から離れたら、そこで終える。動きを減らす設定では、枠は光らせずに出すだけにする

import { useEffect, useState } from "react"
import { NOTHING_OPENED, openedEntry, shownPageId } from "../../../core/stage"
import { useMessages } from "../../../ui/i18n"
import { useStageHere } from "../../../ui/scope"
import { BIRD_IDS, type Bird } from "../birds"
import { pickBird } from "../birds/assign"
import { BirdWalk, birdClass } from "../birds/BirdWalk"
import { kit } from "../kit"
import { AnchorFrame, StandAt } from "../stand/anchors"
import { type BirdVisit, useBirdVisit, useClearBirdVisit } from "./bird-visit"
import styles from "./MailLayer.module.css"

export function MailLayer() {
  const visit = useBirdVisit()
  const clear = useClearBirdVisit()
  const opened = useStageHere(st => st?.opened ?? NOTHING_OPENED)
  const here =
    !!visit && openedEntry(opened)?.id === visit.book && (visit.page === null || shownPageId(opened) === visit.page)
  useEffect(() => {
    if (visit && !here) clear()
  }, [visit, here, clear])
  if (!visit || !here) return null
  return <Visit key={visit.seq} visit={visit} onDone={clear} />
}

function Visit({ visit, onDone }: { visit: BirdVisit; onDone: () => void }) {
  const t = useMessages(kit)
  const [bird] = useState<Bird>(() => pickBird(BIRD_IDS, Math.random))
  const [arrived, setArrived] = useState(false)
  return (
    <>
      {arrived && visit.ids.map(id => <AnchorFrame key={id} anchor={id} className={styles.place} />)}
      <StandAt anchor={visit.ids} side="edge" span through>
        <BirdWalk bird={bird} visit onArrived={() => setArrived(true)} onGone={onDone} awayLabel={t("Mail")}>
          {style => <span className={birdClass} style={style} data-mail-bird />}
        </BirdWalk>
      </StandAt>
    </>
  )
}
