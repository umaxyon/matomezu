// チケット履歴の行の書いた者・担当の鳥: AI はそのときのワークルームの鳥の顔、利用者は利用者の印。名前は吹き出しで出す
import { useMessages } from "../../plugin-api/ui"
import { BirdFaceView, Tip } from "../base/ui"
import type { By } from "./by"
import { UserIcon } from "./icons"
import { kit } from "./kit"
import styles from "./WriterBird.module.css"

type BirdId = Parameters<typeof BirdFaceView>[0]["bird"]

export function Face({ bird, palette, size }: { bird: string; palette?: string | undefined; size: number }) {
  return <BirdFaceView bird={bird as BirdId} {...(palette ? { palette } : {})} size={size} />
}

export function WriterBird({ by, size = 16 }: { by: By; size?: number }) {
  const t = useMessages(kit)
  if (by.kind === "user")
    return (
      <Tip text={t("User")}>
        <span className={styles.user} style={{ width: size, height: size }}>
          <UserIcon />
        </span>
      </Tip>
    )
  return (
    <Tip text={by.workroom.name}>
      <span className={styles.bird}>
        <Face bird={by.workroom.bird} palette={by.workroom.palette} size={size} />
      </span>
    </Tip>
  )
}
