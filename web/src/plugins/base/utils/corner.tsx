// 物の右上の角に出す物（たたんだ伝言・既読の伝言・びっくりマークなど。追加プラグインの物も）: 種類をまたいで、物ごとに 1 つの角のスタンドにまとめる。
// 角に出す物は AtCorner で、物・並べる順・まとめた絵に使う絵・縁の印（マークポインタ）を登録し、押す物（children）は角のスタンドの中の場所へ描く。
// 1 つだけなら、その押す物をそのまま角に出す。2 つ以上なら、並びの先頭の 2 つの絵を重ねたまとめた絵を出し、ポインタを乗せる（押す・キーでも）と、
// 角から上へ（入らなければ下へ）、右端を角にそろえて左へ小さな吹き出しが広がり、押す物を横 1 列に並べて 1 つずつ選ばせる。ポインタが離れて少し経つか、Esc か、ほかを押すと閉じる。
// 並べる順は、order の小さい物が先、同じ order なら at（ISO 8601 の時点）の新しい物が先、同じなら後に登録した物が先。
// 物が見える所の外にある間は、並びの先頭の、縁の印を持つ物の印だけを出す（無ければ何も出さない）。
// 登録の表はステージごとに 1 つで、ステージのビューが CornersProvider で渡す。描いている間だけ持つ
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { createPortal } from "react-dom"
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import { Stand, useStandAway } from "./anchors"
import styles from "./corner.module.css"
import { cornersByAnchor, type CornerEntry as Entry, type PlacedCorner as Placed } from "./corner-order"

type CornerEntry = Entry<ReactNode>
type PlacedCorner = Placed<ReactNode>

const LEAVE_GRACE = 400 // ポインタが離れてから吹き出しを閉じるまでの ms（吹き出しへ移る間に閉じないように）

// ステージの角に出す物の表: 登録と、押す物を描く場所（角のスタンドの中の要素）
interface Corners {
  set(id: string, entry: Omit<CornerEntry, "seq">): void
  remove(id: string): void
  entries(): ReadonlyMap<string, CornerEntry>
  slotRef(id: string): (el: HTMLElement | null) => void // id ごとに同じ関数なので、付け直しで描き直さない
  slot(id: string): HTMLElement | null
  subscribe(listener: () => void): () => void
}

function newCorners(): Corners {
  let entries = new Map<string, CornerEntry>()
  const slots = new Map<string, HTMLElement>()
  const refs = new Map<string, (el: HTMLElement | null) => void>()
  const listeners = new Set<() => void>()
  let seq = 0
  const changed = () => {
    for (const l of listeners) l()
  }
  return {
    set: (id, entry) => {
      const before = entries.get(id)
      entries = new Map(entries).set(id, { ...entry, seq: before?.seq ?? seq++ })
      changed()
    },
    remove: id => {
      if (!entries.has(id)) return
      entries = new Map(entries)
      entries.delete(id)
      changed()
    },
    entries: () => entries,
    slotRef: id => {
      let r = refs.get(id)
      if (!r) {
        r = el => {
          if ((slots.get(id) ?? null) === el) return
          if (el) slots.set(id, el)
          else slots.delete(id)
          changed()
        }
        refs.set(id, r)
      }
      return r
    },
    slot: id => slots.get(id) ?? null,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

const Context = createContext<Corners | null>(null)

// ステージのビューが、開いたブックのレイヤーを包む（アンカーの表の内側）。角のスタンドも、ここが描く
export function CornersProvider({ children }: { children: ReactNode }) {
  const corners = useMemo(newCorners, [])
  return (
    <Context.Provider value={corners}>
      {children}
      <CornerStands corners={corners} />
    </Context.Provider>
  )
}

// 押す物を描いている所: 角に 1 つだけ（"none"）か、物の上へ広げた吹き出しの中（"above"）か、下へ広げた吹き出しの中（"below"）か（AtCorner の children の中で読む）
export type AtCornerBubble = "none" | "above" | "below"
const BubbleContext = createContext<AtCornerBubble>("none")
export const useAtCornerBubble = (): AtCornerBubble => useContext(BubbleContext)
const isBubble = (v: string | undefined): v is AtCornerBubble => v === "above" || v === "below"

// 物 anchor の右上の角に出す物: order と at で並べ、まとめた絵には look を重ね、物が見える所の外にある間は pointer を縁に出す。
// children は押す物で、角のスタンドの中（1 つだけなら角、2 つ以上なら広げた吹き出しの中）に描く（描く場所が無い間は描かない）。
// look と pointer は角のスタンドの木で描くので、スタンドの useStandAway が効き（pointer に StandPointer が使える）、呼んだ側のコンテキストは見えない。
// children は呼んだ側の木からポータルで描くので、呼んだ側のコンテキストが見え、useStandAway・useStandFacing は null。吹き出しの中か（上か下か）は useAtCornerBubble
export function AtCorner({
  anchor,
  order,
  at,
  look,
  pointer = null,
  children,
}: {
  anchor: string
  order: number
  at: string
  look: ReactNode
  pointer?: ReactNode | null
  children: ReactNode
}) {
  const corners = useContext(Context)
  const id = useId()
  // 絵は描くたびに作り直されるので、描くたびに登録し直す（角のスタンドだけが描き直る）
  useLayoutEffect(() => {
    corners?.set(id, { anchor, order, at, look, pointer })
  })
  useEffect(() => () => corners?.remove(id), [corners, id])
  const slot = useSyncExternalStore(
    corners?.subscribe ?? noSubscribe,
    () => corners?.slot(id) ?? null,
    () => null,
  )
  if (!slot) return null
  return createPortal(
    // 押した物の知らせを、描いたレイヤーの外（ステージなど）へ渡さない（スタンドと同じ。React の知らせは、描いたレイヤーの木を上るため）
    // biome-ignore lint/a11y/useSemanticElements: 押す物を包む箱で、入力Formのまとまり（fieldset）ではない
    <div
      className={styles.item}
      role="group"
      onPointerDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      onContextMenu={stop}
      onWheel={stop}
      onKeyDown={stop}
    >
      <BubbleContext.Provider value={isBubble(slot.dataset.cornerSlot) ? slot.dataset.cornerSlot : "none"}>
        {children}
      </BubbleContext.Provider>
    </div>,
    slot,
  )
}

const noSubscribe = () => () => {}
const stop = (e: { stopPropagation(): void }) => e.stopPropagation()

// 物ごとの角のスタンド
function CornerStands({ corners }: { corners: Corners }) {
  const t = useMessages(kit)
  const entries = useSyncExternalStore(corners.subscribe, corners.entries, corners.entries)
  const groups = useMemo(() => cornersByAnchor(entries), [entries])
  return (
    <>
      {[...groups].map(([anchor, group]) => (
        <Stand key={anchor} anchor={anchor} side="corner" edgePinned label={t("Corner")}>
          <Corner corners={corners} group={group} />
        </Stand>
      ))}
    </>
  )
}

// 1 つの物の角: 物が見える所の外なら先頭の縁の印、1 つなら押す物の場所、2 つ以上ならまとめた絵と、開いている間の吹き出し。
// 吹き出しは上に出し、上に入らなければ（その上に重ねる「外す？」などの分も見て、吹き出しの高さをもう 1 つ分）下に出す
function Corner({ corners, group }: { corners: Corners; group: readonly PlacedCorner[] }) {
  const t = useMessages(kit)
  const away = useStandAway()
  const [open, setOpen] = useState(false)
  const [below, setBelow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined)
  const many = group.length > 1
  const show = useCallback(() => {
    clearTimeout(leaving.current)
    setOpen(true)
  }, [])
  const hide = useCallback(() => {
    clearTimeout(leaving.current)
    setOpen(false)
    setBelow(false)
  }, [])
  // 縁の印に替わったときと、1 つに減ったときは閉じる
  useEffect(() => {
    if (away || !many) hide()
  }, [away, many, hide])
  useLayoutEffect(() => {
    const el = bubble.current
    const layer = el?.closest("[data-stand-layer]")
    if (!open || below || !el || !layer) return
    const box = el.getBoundingClientRect()
    if (box.top - layer.getBoundingClientRect().top < box.height) setBelow(true)
  }, [open, below])
  // ポインタの出入りは要素の並びで見る（吹き出しの中の押す物は、別のレイヤーの React の木から描かれるため）。
  // 乗せて開くのはマウスとペンだけ（タッチは押して開く）
  useEffect(() => {
    const el = ref.current
    if (!el || !many || away) return
    const enter = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || e.pointerType === "pen") show()
      else clearTimeout(leaving.current)
    }
    const leave = () => {
      clearTimeout(leaving.current)
      leaving.current = setTimeout(hide, LEAVE_GRACE)
    }
    el.addEventListener("pointerenter", enter)
    el.addEventListener("pointerleave", leave)
    return () => {
      el.removeEventListener("pointerenter", enter)
      el.removeEventListener("pointerleave", leave)
      clearTimeout(leaving.current)
    }
  }, [many, away, show, hide])
  // 開いている間に、ほかを押すか Esc なら閉じる（Esc は吹き出しを閉じるだけにし、右サイドパネルなどへは渡さない）
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) hide()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      e.preventDefault()
      hide()
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("keydown", onKeyDown, true)
    }
  }, [open, hide])
  if (away) return <>{group.find(g => g.entry.pointer)?.entry.pointer ?? null}</>
  if (!many) {
    const only = group[0] as PlacedCorner
    return <div ref={corners.slotRef(only.id)} className={styles.single} data-corner-slot="single" />
  }
  const [front, back] = group as [PlacedCorner, PlacedCorner]
  return (
    <div ref={ref} className={styles.corner} data-corner-count={group.length}>
      <button
        type="button"
        className={styles.stack}
        aria-label={t("Show the {n} things at the corner", { n: group.length })}
        aria-expanded={open}
        onClick={show}
      >
        <span className={styles.back}>{back.entry.look}</span>
        <span className={styles.front}>{front.entry.look}</span>
      </button>
      {open && (
        // biome-ignore lint/a11y/useSemanticElements: 吹き出しは押す物を並べる箱で、入力Formのまとまり（fieldset）ではない
        <div
          ref={bubble}
          className={below ? `${styles.bubble} ${styles.below}` : styles.bubble}
          role="group"
          aria-label={t("Things at the corner")}
        >
          {/* 上か下かが替わったら場所を作り直し、押す物が描き直されて読み直す */}
          {group.map(g => (
            <div
              key={`${g.id}-${below ? "below" : "above"}`}
              ref={corners.slotRef(g.id)}
              className={styles.slot}
              data-corner-slot={below ? "below" : "above"}
            />
          ))}
        </div>
      )}
    </div>
  )
}
