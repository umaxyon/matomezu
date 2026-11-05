// 伝言の付ける先の鳥: 右サイドパネルが伝言を出している間、付ける先（右サイドパネルの anchors）のそれぞれの上の辺に鳥を出す。
// 鳥は付ける先が替わるたびに割り当て直し（birds/assign.ts。割り当ては base のステージの画面の状態に持つ。birds-state.ts）、新しい鳥は画面の外から、外れた物の鳥は足された物へ飛んで移り、余った鳥と閉じたときの鳥は飛び去る。
// 物の上の辺が見える所の外に出たら、鳥の顔の丸い絵を縁に出す（押すとその物を見せる）。
// 鳥を押すと、その物をカレントにして（右サイドパネルが真ん中へ見せる）「外す？」を出し、「はい」で付ける先から外す（カレントは一つ前の鳥の物へ）。
// 付ける先が 0 になれば閉じる（right-side-panel の useTakeOffAnchor）。
// 付ける先がいくつかあるときは、カレントの物に明るい色の枠を重ねて、どれがカレントかを示す
import { useEffect, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { useReadStageState, useSetStageState } from "../../../ui/view-hooks"
import type { Bird } from "../birds"
import { assignBirds } from "../birds/assign"
import { BirdWalk, birdClass } from "../birds/BirdWalk"
import { LEAVE } from "../birds/flight"
import { RemoveAsk } from "../birds/RemoveAsk"
import { kit } from "../kit"
import { useAnchorName } from "../label/anchor-name"
import { useRightSidePanel, useSetRightSidePanelCurrent, useTakeOffAnchor } from "../right-side-panel/hooks"
import { AnchorFrame, anchorElementIn, Stand } from "../utils/anchors"
import { birdsIn, withBirds } from "./birds-state"
import styles from "./NoteLayer.module.css"
import { NOTE_PANEL_ID } from "./panel-id"

const NONE: readonly string[] = []

// 出している鳥: 付ける先とその鳥、移ってくる前の物（飛んで移るとき）、飛び去っているか
interface Shown {
  anchor: string
  bird: Bird
  from?: string
  leaving: boolean
}

export function NoteBirds({ stage }: { stage: string }) {
  const open = useRightSidePanel(stage)
  const anchors = open?.widget === NOTE_PANEL_ID ? open.anchors : NONE
  const [shown, setShown] = useState<readonly Shown[]>([])
  const readOwn = useReadStageState(kit)
  const setOwn = useSetStageState(kit)
  const key = anchors.join(" ")
  // biome-ignore lint/correctness/useExhaustiveDependencies: 付ける先の並びが替わったときだけ割り当て直す
  useEffect(() => {
    const now = readOwn(stage)
    const next = assignBirds(birdsIn(now), anchors, Math.random)
    setOwn(stage, withBirds(now, next.birds))
    setShown(now => [
      ...now.filter(s => s.leaving && !anchors.includes(s.anchor)),
      ...next.left.map(l => ({ ...l, leaving: true })),
      ...anchors.map(anchor => {
        const bird = next.birds[anchor] as Bird
        const from = next.moved[anchor]
        return { anchor, bird, leaving: false, ...(from ? { from } : {}) }
      }),
    ])
  }, [key])
  const gone = (s: Shown) => setShown(now => now.filter(x => x !== s))
  const current = open?.widget === NOTE_PANEL_ID && anchors.length > 1 ? (open.current ?? null) : null
  return (
    <>
      {current && <AnchorFrame anchor={current} className={styles.current} />}
      {shown.map(s => (
        <Stand key={`${s.anchor}:${s.bird}`} anchor={s.anchor} side="edge" span edgePinned>
          <NoteBird stage={stage} shown={s} onGone={() => gone(s)} />
        </Stand>
      ))}
    </>
  )
}

function NoteBird({ stage, shown, onGone }: { stage: string; shown: Shown; onGone: () => void }) {
  const t = useMessages(kit)
  const setCurrent = useSetRightSidePanelCurrent()
  const takeOff = useTakeOffAnchor()
  const [origin] = useState(() => (shown.from ? (anchorElementIn(stage, shown.from)?.el ?? null) : null))
  const [asking, setAsking] = useState(false)
  // 物が消えて描かれなくなっても、飛び去りが終わる頃に消す
  useEffect(() => {
    if (!shown.leaving) return
    const timer = setTimeout(onGone, LEAVE * 1000 + 500)
    return () => clearTimeout(timer)
  }, [shown.leaving, onGone])
  const remove = () => takeOff(stage, shown.anchor)
  const name = useAnchorName(stage, shown.anchor)
  return (
    <BirdWalk
      bird={shown.bird}
      arrival="fly"
      origin={origin}
      paused={asking}
      leaving={shown.leaving}
      onGone={onGone}
      awayLabel={t("Show {name}", { name })}
    >
      {style =>
        shown.leaving ? (
          <span className={birdClass} style={style} />
        ) : (
          <RemoveAsk onRemove={remove} onAsking={setAsking} onBird>
            {toggle => (
              <button
                type="button"
                className={birdClass}
                aria-label={t("Bird of the note")}
                onClick={() => {
                  setCurrent(stage, shown.anchor)
                  toggle()
                }}
                style={style}
                data-note-bird={shown.anchor}
              />
            )}
          </RemoveAsk>
        )
      }
    </BirdWalk>
  )
}
