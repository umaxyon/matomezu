// タイルのビュー: 中身の欄 tiles（content.tiles）の札を色の四角で並べる
import type { z } from "matomezu"
import type { ItemViewProps } from "matomezu/ui"
import type { TILES } from "./tiles"

type TilesProps = z.output<(typeof TILES)["props"]>
type TilesContent = { readonly tiles?: readonly { id: string; color: string }[] }

export function TilesView({ props, size, content, zoom }: ItemViewProps<TilesProps, TilesContent>) {
  const tiles = content.tiles ?? []
  return (
    <div
      data-ex5-tiles={tiles.length}
      data-ex5-theme={props.theme}
      data-ex5-zoom={zoom}
      style={{ width: size.w, height: size.h, background: "var(--tiles-fill)", display: "flex", gap: 4 }}
    >
      {tiles.map(t => (
        <span key={t.id} style={{ width: 16, height: 16, background: t.color }} />
      ))}
    </div>
  )
}

export const TILES_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="8" width="6" height="8" />
    <rect x="14" y="8" width="6" height="8" />
  </svg>
)

export const SORT_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16M7 12h10M10 17h4" />
  </svg>
)
