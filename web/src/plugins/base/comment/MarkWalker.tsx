// 指すだけのマークの絵: 物の上の辺を、鳥（ツナギドリ）が歩いて往復し、ときどき立ち止まってつつく。押すと吹き出しを開く。
// 絵は 4 列 2 行のコマの並び（上の行が歩き、下の行が立ち止まってつつく）で、左向きに描いてある。右へ歩くときは左右を返す。
// 動きを減らす設定（prefers-reduced-motion）では、立ち止まった絵のまま動かない
import { useEffect, useRef, useState } from "react"
import sprite from "../images/tsunagidori-walk-peck.png"
import styles from "./CommentLayer.module.css"

const SIZE = 32 // 1 コマの大きさ（画面の px）
const TICK = 120 // コマを送る間（ms）
const STEP = 3 // 1 コマで進む幅（px）
const PECK = [4, 5, 6, 5, 6, 7] as const // つつくときに出す下の行のコマ（番号は左上から 0〜7）

interface Walk {
  x: number // 歩く所の左からの位置
  dir: -1 | 1 // 進む向き（-1 は左）
  frame: number // 出しているコマ
  pecking: number // つついている間の、PECK の何番目か（つついていなければ -1）
  steps: number // 次に立ち止まるまでの歩数
}

const nextStop = () => 20 + Math.floor(Math.random() * 30)

export function MarkWalker({ label, onOpen }: { label: string; onOpen: () => void }) {
  const area = useRef<HTMLDivElement>(null)
  const [walk, setWalk] = useState<Walk>({ x: 0, dir: 1, frame: 4, pecking: -1, steps: nextStop() })
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const timer = setInterval(() => {
      const width = area.current?.clientWidth ?? 0
      setWalk(w => step(w, Math.max(0, width - SIZE)))
    }, TICK)
    return () => clearInterval(timer)
  }, [])
  const col = walk.frame % 4
  const row = Math.floor(walk.frame / 4)
  return (
    <div ref={area} className={styles.walk}>
      <button
        type="button"
        className={styles.mark}
        aria-label={label}
        onClick={onOpen}
        style={{
          left: walk.x,
          backgroundImage: `url(${sprite})`,
          backgroundPosition: `${(-col * SIZE).toString()}px ${(-row * SIZE).toString()}px`,
          transform: walk.dir === 1 ? "scaleX(-1)" : undefined,
        }}
      />
    </div>
  )
}

// 1 コマ進める（max は歩ける右端）。端に着いたら向きを変え、決めた歩数ごとに立ち止まってつつく
function step(w: Walk, max: number): Walk {
  if (w.pecking >= 0) {
    const next = w.pecking + 1
    const frame = PECK[next]
    return frame === undefined ? { ...w, pecking: -1, frame: 0, steps: nextStop() } : { ...w, pecking: next, frame }
  }
  if (w.steps <= 0) return { ...w, pecking: 0, frame: PECK[0] }
  const x = w.x + w.dir * STEP
  const dir = x <= 0 ? 1 : x >= max ? -1 : w.dir
  return { x: Math.min(Math.max(x, 0), max), dir, frame: (w.frame + 1) % 4, pecking: -1, steps: w.steps - 1 }
}
