// 線の層（形を並べるビューに重ねる、つなぐもののビュー。ui/connector.ts）: 形の並びを包み、形より手前に線を描く。
// 線は描いている形の四角（下書き・ドラッグでずらした所も）から道筋を決めて描く（drawn.ts の drawLines）。自由な端は前に描いた辺に留まる（sticky.ts）。
// 選択の道具で線を押すと線を選び、ダブルクリックで線の編集のダイアログ（line-edit）、右クリックで線を選んで線のメニュー（line-context）を開く。
// 1 本だけ選んだ線は、端・途中の区間・キャプションの札をドラッグしてじかに直せる（useLineEdit.ts）。
// 形にポインタを乗せると四辺に〇を出し（PortOverlay）、〇から引くドラッグ（useLinkDrag.ts）の間は、引ける相手と引き始めた形のほかを薄くする
import { createContext, type ReactNode, useContext, useLayoutEffect, useRef } from "react"
import { type PlacedConnector, type PortArea, placement, portAreasOf } from "../../../plugin-api"
import {
  ShapeMarksProvider,
  type ShapeScene,
  useActions,
  useBook,
  useCommand,
  useContextMenu,
  useCoreCatalog,
} from "../../../plugin-api/ui"
import { LINE_EDIT } from "./commands"
import { PORT_OUT, portAt, SIDES, targetsFrom } from "./connect"
import { drawLines, type LineCache } from "./drawn"
import type { Rect } from "./geom"
import { LinesView } from "./LinesView"
import { elbowAt, LINE } from "./line"
import { LINE_CONTEXT } from "./menu"
import { LinkPreview, Ports } from "./PortsView"
import type { PlacedLine } from "./placed"
import type { EndMemory, Side } from "./route"
import { memoryOf, stickyMemory } from "./sticky"
import { useLineEdit } from "./useLineEdit"
import { useLinkDrag } from "./useLinkDrag"

// 層と〇が共に見る、〇から引くドラッグ
interface Linking {
  scene: ShapeScene
  areas: ReadonlyMap<string, PortArea> // 形のつながる範囲
  link: ReturnType<typeof useLinkDrag>
  portsOf(id: string): readonly Side[]
}
const LinkingContext = createContext<Linking | null>(null)

const linesIn = (scene: ShapeScene): PlacedLine[] =>
  (scene.page.items ?? []).filter((i): i is PlacedConnector & PlacedLine => i.item === LINE.id)

export function LineLayer({ scene, children }: { scene: ShapeScene; children: ReactNode }) {
  const { stage, page, localOf } = scene
  const catalog = useCoreCatalog()
  // 線は形のつながる範囲（つなぎ口で縮めた四角）につなぐ
  const rects = portAreasOf(catalog, page, scene.rects)
  // ページの線の既定が折れ線か（ページ → ブック → 設定の既定）
  const book = useBook(stage.id)
  const elbow = book ? elbowAt(catalog, book, page) : true
  const lineEdit = useCommand(stage.id, LINE_EDIT.id)
  const openLineMenu = useContextMenu(stage.id, LINE_CONTEXT)
  const { select } = useActions()
  const linkDrag = useLinkDrag(stage, catalog, localOf)
  const lineDrag = useLineEdit(stage, catalog, localOf)
  // 線の自由な端が前に描いた辺と位置（画面の中だけ。データには書かない）、線の道筋の覚え、前に描いた形の四角
  const memo = useRef(new Map<string, EndMemory>())
  const cache = useRef<LineCache>(new Map())
  const drawnRects = useRef<ReadonlyMap<string, Rect>>(new Map())
  // 離したあとに付け替えを見る線: 離したばかりの形につながる線
  const settle = new Set(
    linesIn(scene)
      .filter(l => scene.settled.has(l.from) || scene.settled.has(l.to))
      .map(l => l.id),
  )
  // ダイアログの下書きは、見せ方が渡すページ（下書きを重ねたページ）にもう入っている。じかに直しているドラッグの線は、その途中の項目で描く
  const drafted = linesIn(scene).map(l => (lineDrag.draft?.id === l.id ? { ...l, props: lineDrag.draft.props } : l))
  const memory = stickyMemory({
    lines: drafted,
    memo: memo.current,
    before: drawnRects.current,
    rects,
    dragged: scene.dragged,
    pushed: scene.pushed,
    swapped: scene.swapped,
    settle,
  })
  const lines = drawLines(drafted, rects, elbow, { memory, loose: settle, cache: cache.current })
  const { selectable } = scene
  const lineScene = { page, lines: drafted, drawn: lines, rects, elbow }
  const only = stage.selection.length === 1 ? stage.selection[0] : undefined
  const editing = selectable && only && drafted.some(l => l.id === only) ? only : null

  // 描き終えたら、次に描くときのために、線の記憶と形の四角を覚える
  useLayoutEffect(() => {
    memo.current = memoryOf(lines)
    drawnRects.current = rects
  })

  // 〇を出す形: 選択の道具で、ポインタを乗せている選んでいない形（ドラッグ・大きさを変えている間は出さない）。線を引いている間は、引き始めた形の押した〇だけ
  const portsOf = (id: string): readonly Side[] => {
    const l = linkDrag.link
    if (l) return l.from === id ? [l.side] : []
    if (
      !selectable ||
      scene.busy ||
      scene.hover !== id ||
      stage.selection.includes(id) ||
      !targetsFrom(catalog, page, id).size
    )
      return []
    return SIDES
  }
  // 線を引いている間は引ける相手と引き始めた形のほかを、端を運んでいる間はつなぎ替えられる形と今の形のほかを薄くする
  const l = linkDrag.link
  const marks = {
    keep: l ? new Set([l.from, ...l.targets]) : lineDrag.dimming,
    target: linkDrag.tip?.target ?? lineDrag.target ?? null,
  }
  const from = l && rects.get(l.from)
  const zoom = placement(stage)?.zoom ?? 1

  return (
    <ShapeMarksProvider value={marks}>
      <LinkingContext.Provider value={{ scene, areas: rects, link: linkDrag, portsOf }}>
        {children}
        <LinesView
          lines={lines}
          selection={stage.selection}
          selectable={selectable}
          onPointerDown={(e, id) => {
            if (e.button !== 0 || !selectable) return
            if (!stage.selection.includes(id)) select(stage.id, [id])
          }}
          onDoubleClick={id => {
            if (selectable) lineEdit.run({ item: id })
          }}
          onContextMenu={(e, id) => {
            if (stage.placing !== null) return
            if (!stage.selection.includes(id)) select(stage.id, [id])
            openLineMenu(e, { item: id })
          }}
          editing={editing}
          snap={lineDrag.snap}
          drag={{
            via: (e, id, index) => lineDrag.startVia(e, id, index),
            end: (e, id, end) => {
              const line = drafted.find(x => x.id === id)
              if (line) lineDrag.startEnd(e, lineScene, line, end)
            },
            caption: (e, id) => {
              if (e.button !== 0 || !selectable) return
              if (!stage.selection.includes(id)) select(stage.id, [id])
              lineDrag.startCaption(e, id)
            },
            move: e => lineDrag.move(e, lineScene),
            up: e => lineDrag.end(e, lineScene, true),
            cancel: e => lineDrag.end(e, lineScene, false),
          }}
        />
        {linkDrag.tip && from && l && <LinkPreview from={portAt(from, l.side, PORT_OUT / zoom)} to={linkDrag.tip.at} />}
      </LinkingContext.Provider>
    </ShapeMarksProvider>
  )
}

// 形 1 つの上の、線を引く〇
export function PortOverlay({ id }: { scene: ShapeScene; id: string }) {
  const linking = useContext(LinkingContext)
  if (!linking) return null
  const { scene, areas, link, portsOf } = linking
  const area = areas.get(id)
  const shape = scene.rects.get(id)
  return (
    <Ports
      sides={portsOf(id)}
      inset={area && shape ? area.x - shape.x : 0}
      active={link.link !== null}
      onStart={(e, side) => {
        if (area) link.start(e, scene.page, area, id, side)
      }}
      onPointerMove={link.move}
      onPointerUp={e => link.end(e, true)}
      onPointerCancel={e => link.end(e, false)}
    />
  )
}
