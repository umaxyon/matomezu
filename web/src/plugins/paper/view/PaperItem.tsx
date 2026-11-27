// 紙のビューに置いたアイテム 1 つ: 結んだビューで描き（ビューの無いアイテムは枠だけ）、ドラッグ中の見た目・子の形・つなぐもののビューが重ねる物・大きさを変えるつかむ所を添える。
// ポインタの操作は、押した所の一番内側の形だけが受ける
import type { MouseEvent, PointerEvent, ReactNode } from "react"
import type { CoreCatalog, PlacedShape, Point } from "../../../plugin-api"
import {
  type ItemViewProps,
  KEEP_ALL,
  useCoreCatalog,
  useShapeMarks,
  useTokenScope,
  useUiCatalog,
} from "../../../plugin-api/ui"
import { type Edges, NO_SHAPE_DEF, NO_SIZE, placedSize, shapeDefOf, stretchOf } from "../../base"
import { useAnchorRef } from "../../base/ui"
import styles from "./PaperView.module.css"

// 形のビューに渡す中身: 形の定義の content に宣言したフィールドの名前 → その値
function contentOf(catalog: CoreCatalog, item: PlacedShape): Readonly<Record<string, unknown>> {
  const def = shapeDefOf(catalog, item.item)
  const fields = Object.keys((def !== NO_SHAPE_DEF && def.content) || {})
  return Object.fromEntries(fields.map(k => [k, (item as Record<string, unknown>)[k]]))
}

interface ItemProps {
  zoom: number // ステージの今の倍率（形のビューに渡す）
  item: PlacedShape
  onHover(on: boolean): void
  overlays: ReactNode // つなぐもののビューが形の上に重ねるコンポーネント
  nested: ReactNode // 子の形（形の中に描く）
  stretchable: boolean // 四辺と四隅をつかんで大きさを変えられるか
  onStretch: {
    down(e: PointerEvent<HTMLDivElement>, edges: Edges): void
    move(e: PointerEvent<HTMLDivElement>): void
    up(e: PointerEvent<HTMLDivElement>): void
    cancel(e: PointerEvent<HTMLDivElement>): void
  }
  selected: boolean
  dropTarget: boolean // 付け替えの道具のドラッグで離すと入る先か、置こうとしている間に押すと入る先か
  shift: Point | null // ドラッグ中にずらして描く量（紙の上）
  dragged: readonly string[] // ドラッグで動かしているアイテム
  resizing: string | null // 大きさを変えているアイテム
  onPointerDown(e: PointerEvent<HTMLDivElement>): void
  onPointerMove(e: PointerEvent<HTMLDivElement>): void
  onPointerUp(e: PointerEvent<HTMLDivElement>): void
  onPointerCancel(e: PointerEvent<HTMLDivElement>): void
  onDoubleClick(e: MouseEvent<HTMLDivElement>): void
  onContextMenu(e: MouseEvent<HTMLDivElement>): void
}

// ポインタの操作を受けるのは、押した所の一番内側の形だけ（子の形の上の操作は、親の形に渡さない）
const innermost = (e: { target: EventTarget; currentTarget: Element }) =>
  (e.target as Element).closest("[data-item]") === e.currentTarget
function ownHandlers(
  handlers: Pick<
    ItemProps,
    "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onDoubleClick" | "onContextMenu"
  >,
) {
  return Object.fromEntries(
    Object.entries(handlers).map(([k, f]) => [
      k,
      (e: PointerEvent<HTMLDivElement> & MouseEvent<HTMLDivElement>) => {
        if (innermost(e)) (f as (e: unknown) => void)(e)
      },
    ]),
  ) as typeof handlers
}

// 大きさを変えるためにつかめる所: 四辺と四隅（角は 2 つの辺を動かす。幅だけを変えられる形は左右の辺だけ）
const GRIPS: readonly { at: string; edges: Edges }[] = [
  { at: "left", edges: { x: "left" } },
  { at: "right", edges: { x: "right" } },
  { at: "top", edges: { y: "top" } },
  { at: "bottom", edges: { y: "bottom" } },
  { at: "top-left", edges: { x: "left", y: "top" } },
  { at: "top-right", edges: { x: "right", y: "top" } },
  { at: "bottom-left", edges: { x: "left", y: "bottom" } },
  { at: "bottom-right", edges: { x: "right", y: "bottom" } },
]

// 置いたアイテム 1 つ。結んだビューで描き、ビューの無いアイテムは枠だけを描く
export function Item({
  zoom,
  item,
  onHover,
  overlays,
  nested,
  stretchable,
  onStretch,
  selected,
  dropTarget,
  shift,
  dragged,
  resizing,
  ...handlers
}: ItemProps) {
  const catalog = useCoreCatalog()
  const marks = useShapeMarks()
  const anchor = useAnchorRef() // アイテムにアンカーを付ける（そばにスタンドを立てられる）
  // ドラッグ中の見た目: つなぐもののビューが薄くするよう求めた形は薄く。動かすアイテムは透かし、大きさを変えているアイテムはそのまま、ほかは薄く
  const look =
    marks.keep !== KEEP_ALL
      ? marks.keep.has(item.id)
        ? undefined
        : "faded"
      : dragged.length > 0
        ? dragged.includes(item.id)
          ? "lifted"
          : "faded"
        : resizing && item.id !== resizing
          ? "faded"
          : undefined
  const ui = useUiCatalog().items.get(item.item)
  const size = placedSize(catalog, item)
  const View = ui?.view as ((p: ItemViewProps<PlacedShape["props"]>) => ReactNode) | undefined
  const tokens = useTokenScope(item.item) // そのアイテムのプラグインのテーマキー（--<名前>）
  // 幅だけを変えられる形（base の stretch）は左右の辺だけ、比を保つ形は角だけをつかめる
  const stretch = stretchOf(catalog, item.item)
  const grips =
    stretch === "width"
      ? GRIPS.filter(g => !g.edges.y)
      : stretch === "ratio"
        ? GRIPS.filter(g => g.edges.x && g.edges.y)
        : GRIPS
  return (
    <div
      ref={anchor(item.id)}
      data-item={item.id}
      data-shape
      data-target={marks.target === item.id}
      className={styles.item}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      data-selected={selected}
      data-drop-target={dropTarget}
      data-look={look}
      style={{
        left: item.x,
        top: item.y,
        width: size !== NO_SIZE ? size.w : undefined,
        height: size !== NO_SIZE ? size.h : undefined,
        transform: shift ? `translate(${shift.x}px, ${shift.y}px)` : undefined,
        ...tokens,
      }}
      {...ownHandlers(handlers)}
    >
      {View && size !== NO_SIZE ? (
        <View
          props={item.props}
          size={size}
          id={item.id}
          content={contentOf(catalog, item)}
          zoom={zoom}
          hasChildren={(item.shapes?.length ?? 0) > 0}
        />
      ) : (
        <div className={styles.unknownItem} />
      )}
      {nested}
      {overlays}
      {stretchable &&
        grips.map(g => (
          <div
            key={g.at}
            className={styles.grip}
            data-grip={g.at}
            onPointerDown={e => onStretch.down(e, g.edges)}
            onPointerMove={onStretch.move}
            onPointerUp={onStretch.up}
            onPointerCancel={onStretch.cancel}
          />
        ))}
    </div>
  )
}
