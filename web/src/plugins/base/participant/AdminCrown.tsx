// 管理者の王冠（塗りは currentColor、縁は使う側が stroke で決める）と、鳥の顔の頭に金の王冠を重ねる枠
import type { ReactNode } from "react"
import styles from "./Participant.module.css"

const CROWN_RATIO = 0.7

export const CrownIcon = ({ width = 18 }: { width?: number }) => (
  <svg
    viewBox="0 0 24 14"
    width={width}
    height={(width * 14) / 24}
    aria-hidden="true"
    fill="currentColor"
    strokeWidth={1}
  >
    <path d="M2 12L1 3l5.5 4.5L12 1l5.5 6.5L23 3l-1 9z" strokeLinejoin="round" />
  </svg>
)

// children は鳥の顔（size の大きさ）。admin のときだけ王冠を重ねる
export function AdminCrown({ admin, size, children }: { admin: boolean; size: number; children: ReactNode }) {
  return (
    <span className={styles.crowned} style={{ width: size, height: size }}>
      {children}
      {admin ? (
        <span className={styles.crownBox} style={{ width: size * CROWN_RATIO }}>
          <CrownIcon width={size * CROWN_RATIO} />
        </span>
      ) : null}
    </span>
  )
}
