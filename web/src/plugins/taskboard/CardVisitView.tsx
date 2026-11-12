// ワークルームの鳥をチケットカードに立ち寄らせる（タスクボードの根の中に置く）: 状態 CARD_VISIT が seeking になったら、
// プロジェクトのタスクボードを出し（出ていなければ。利用者の設定に残る）、カードが止まるまで待ち、スクロールして見せ、また止まるまで待ってから、鳥を出す（visiting）。
// 鳥はカードの裏から顔を出し、上の辺に乗ってすぐ飛び去る。来ている間はカードに色が当たる（TicketCardView）。
// 置き場が変わったら（measure の 1 か所）鳥をすぐ消して終える。カードが見つからない・止まらないときも黙って終える
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { usePluginState, useRecord, useSetPluginState } from "../../plugin-api/ui"
import { BirdWalk } from "../base/ui"
import { orderedProjects, shownProjects } from "./board"
import { useRecords } from "../../plugin-api/ui"
import { PROJECT } from "./project"
import { TICKET } from "./ticket"
import { kit } from "./kit"
import { CARD_VISIT_ROOM, VISIT_PACE } from "./motion"
import { CARD_VISIT } from "./states"
import { useBoardSettings } from "./useBoardSettings"
import {
  nearestShift,
  type Placement,
  placementBroken,
  type Rect,
  SEEK_LIMIT_MS,
  SETTLED_FRAMES,
  samePlace,
  withProject,
} from "./visit"
import styles from "./CardVisitView.module.css"
import { WORKROOM_SUBJECT } from "./by"

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

// カードの置き場の測り（置き場が変わったかの入力は、すべてここで測る）
function measure(card: Element): Placement {
  const rect = rectOf(card)
  const at = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
  return {
    rect,
    connected: card.isConnected,
    inert: card.closest("[inert]") !== null,
    covered: at === null || !card.contains(at),
  }
}

const frame = () => new Promise<void>(done => requestAnimationFrame(() => done()))

// 見つかって止まるまで待つ（見つからない・止まらないまま limit を過ぎたら null）。cancelled が true になったら null
async function settled(find: () => Element | null, cancelled: () => boolean): Promise<Element | null> {
  const until = performance.now() + SEEK_LIMIT_MS
  let last: Rect | null = null
  let still = 0
  while (!cancelled() && performance.now() < until) {
    await frame()
    const card = find()
    const now = card ? measure(card) : null
    if (!card || !now || now.inert) {
      last = null
      still = 0
      continue
    }
    still = last && samePlace(last, now.rect) ? still + 1 : 0
    last = now.rect
    if (still >= SETTLED_FRAMES) return card
  }
  return null
}

// スクロールできる祖先（root まで）を、カードが見える所まで動かす（root には鳥の場所の余白を空ける）
function reveal(card: Element, root: HTMLElement, smooth: boolean) {
  for (let el = card.parentElement; el; el = el.parentElement) {
    const style = getComputedStyle(el)
    const x = /auto|scroll/.test(style.overflowX)
    const y = /auto|scroll/.test(style.overflowY)
    if ((x || y) && (el === root || el.contains(card))) {
      const view = el.getBoundingClientRect()
      const box = card.getBoundingClientRect()
      const dy = y ? nearestShift(box.top, box.bottom, view.top, view.bottom, el === root ? CARD_VISIT_ROOM : 0) : 0
      const dx = x ? nearestShift(box.left, box.right, view.left, view.right) : 0
      if (dx || dy) el.scrollBy({ left: dx, top: dy, behavior: smooth ? "smooth" : "auto" })
    }
    if (el === root) break
  }
}

export function CardVisitView({ root }: { root: HTMLElement | null }) {
  const visit = usePluginState(kit, CARD_VISIT)
  const setVisit = useSetPluginState(kit, CARD_VISIT)
  const settings = useBoardSettings()
  const projects = useRecords(PROJECT.id)
  const ticket = useRecord(TICKET.id, visit?.ticket ?? "-")
  const room = useRecord(WORKROOM_SUBJECT, visit?.workroom ?? "-")
  const [box, setBox] = useState<{ card: Element; at: Rect; placed: Rect } | null>(null)
  const latest = useRef({ settings, projects, ticket })
  latest.current = { settings, projects, ticket }
  const seq = visit?.seq
  const phase = visit?.phase
  const ready = ticket !== undefined && room !== undefined

  // 見に行く: タスクボードを出し、止まるのを待ち、スクロールして、また止まるのを待つ
  // biome-ignore lint/correctness/useExhaustiveDependencies: 続けて押した（seq が変わった）ときと、見に行く途中に入ったときだけやり直す
  useEffect(() => {
    if (phase !== "seeking" || !root) return
    let stop = false
    const cancelled = () => stop
    const give = () => setVisit(undefined)
    void (async () => {
      const now = latest.current
      if (!now.ticket || !ready) return give()
      const ordered = orderedProjects(now.projects, now.settings.order)
      const shownIds = shownProjects(ordered, now.settings.shown).map(p => p.id)
      if (!shownIds.includes(now.ticket.project)) {
        if (!now.settings.canChange) return give()
        now.settings.setShown(withProject(shownIds, now.ticket.project))
      }
      const find = () => root.querySelector(`[data-card="${now.ticket?.id}"]`)
      const first = await settled(find, cancelled)
      if (!first) return cancelled() ? undefined : give()
      reveal(first, root, !window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      const card = await settled(find, cancelled)
      if (!card) return cancelled() ? undefined : give()
      setBox({ card, at: rectOf(card), placed: rectOf(root) })
      setVisit(v => (v && v.seq === seq ? { ...v, phase: "visiting" } : v))
    })()
    return () => {
      stop = true
    }
  }, [seq, phase, root])

  // 鳥が来ている間、置き場が変わったらすぐ消す
  useEffect(() => {
    if (phase !== "visiting" || !box) return
    let frameId = 0
    const watch = () => {
      if (placementBroken(box.at, measure(box.card))) {
        setVisit(undefined)
        return
      }
      frameId = requestAnimationFrame(watch)
    }
    frameId = requestAnimationFrame(watch)
    return () => cancelAnimationFrame(frameId)
  }, [phase, box, setVisit])

  // 立ち寄りが終わったら、測った物を捨てる
  useLayoutEffect(() => {
    if (!visit) setBox(null)
  }, [visit])

  if (phase !== "visiting" || !box || !root || !room) return null
  const at = {
    left: box.at.left - rectOf(root).left + root.scrollLeft,
    top: box.at.top - rectOf(root).top + root.scrollTop,
    width: box.at.width,
  }
  return (
    <div key={seq} className={styles.layer} style={at} data-card-visit>
      <BirdWalk
        bird={room.bird}
        {...(room.palette ? { palette: room.palette } : {})}
        arrival="peek"
        peekVisit
        pace={VISIT_PACE}
        awayLabel={room.name}
        onGone={() => setVisit(undefined)}
      >
        {style => <span className={styles.bird} style={style} />}
      </BirdWalk>
    </div>
  )
}
