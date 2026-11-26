// 参照エントリのアイコン: 指す先のタイプのアイコン icon を、少し縮めて薄くし、右下を切り欠いて、曲がり矢印のしるしを重ねた物。
// どのタイプのアイコンにも同じ形で付ける（タイプが参照エントリ用の絵を名乗らなくてよい）。しるしの絵は 24 の四角の固定色
import type { ReactNode } from "react"
import styles from "./ReferenceIcon.module.css"

export function ReferenceIcon({ icon }: { icon: ReactNode }) {
  return (
    <span className={styles.icon} data-reference-icon>
      <span className={styles.base}>
        <span className={styles.inner}>{icon}</span>
      </span>
      <svg className={styles.badge} viewBox="0 0 24 24" aria-hidden="true">
        <g transform="translate(14 14) scale(.945)">
          <rect width="10.1" height="10.1" rx="2.1" fill="#36465C" stroke="#A8B8CC" strokeWidth=".7" />
          <path
            d="M2.5 7.1V6a1.8 1.8 0 0 1 1.8-1.8h3.25M5.75 2.4l1.8 1.8-1.8 1.8"
            fill="none"
            stroke="#FFF"
            strokeWidth="1.42"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </span>
  )
}
