// ビジター（ワークルームも鳥も持たない、読むだけの参加者）の印: 目の線画を丸に入れた物（鳥の顔の丸と同じ大きさで並ぶ）
import styles from "./Participant.module.css"

export function VisitorIcon({ size }: { size: number }) {
  return (
    <span className={`${styles.face} ${styles.visitor}`} style={{ width: size, height: size }} aria-hidden>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width={size * 0.6}
        height={size * 0.6}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
        <circle cx="12" cy="12" r="2.8" />
      </svg>
    </span>
  )
}
