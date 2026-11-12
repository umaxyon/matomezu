// 担当のワークルームの鳥と名前（チケットスクリーンの左の枠）: 並びの順に横へ並べ、入らなければ折り返す

import styles from "./AssigneeBirds.module.css"
import { Face } from "./WriterBird"

export function AssigneeBirds({
  workrooms,
}: {
  workrooms: readonly { id: string; name: string; bird: string; palette?: string | undefined }[]
}) {
  return (
    <>
      {workrooms.map(w => (
        <span key={w.id} className={styles.assignee}>
          <Face bird={w.bird} palette={w.palette} size={20} />
          {w.name}
        </span>
      ))}
    </>
  )
}
