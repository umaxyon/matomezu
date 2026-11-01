// 紙の枠: ステージの紙の置き場所（core/stage.ts の placement）に紙の大きさの箱を置き、中を紙の座標で描く。
// レイヤー（スロット book-layers）のうち紙の座標で描くレイヤーは、どれもこの枠の中に描くので、パンと倍率が同じに効く。
// 倍率と、開いたブックのビューが決める移り変わりの値（BookViewDef の motion）が変わったときだけ、なめらかに移す（どのレイヤーの枠も同じ値で動く）。
// 中には、紙の倍率を --paper-zoom で渡す（画面の上で同じ大きさに出す物が打ち消すのに使う）。紙が無ければ何も描かない
import type { CSSProperties, HTMLAttributes, ReactNode } from "react"
import { bookType } from "../../../core/core-catalog"
import { placement } from "../../../core/stage"
import type { StageView } from "../../../core/workspace"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"
import { useStagePan } from "../../../ui/view-hooks"
import { useZoomMotion } from "./useZoomMotion"

type Props = Omit<HTMLAttributes<HTMLDivElement>, "style" | "children"> & {
  stage: StageView
  style?: CSSProperties
  children?: ReactNode
}

export function PaperFrame({ stage, style, children, ...rest }: Props) {
  const pan = useStagePan(stage.id)
  const p = pan && placement({ ...stage, pan })
  const motion = useZoomMotion(stage.zoom, usePaperMotionKey(stage))
  if (!p) return null
  return (
    <div
      {...rest}
      style={
        {
          position: "absolute",
          left: 0,
          top: 0,
          transformOrigin: "0 0",
          width: p.w,
          height: p.h,
          transform: `translate(${p.x}px, ${p.y}px) scale(${p.zoom})`,
          transition: motion,
          "--paper-zoom": p.zoom,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </div>
  )
}

declare module "../../../core/catalog" {
  interface BookViewExtras {
    // 倍率のほかに、紙をなめらかに移したい値（変わるたびに、紙の枠がどれもそろってなめらかに動く。無ければ倍率だけ）
    motion?: (stage: StageView) => string
  }
}

// 開いたブックのビューが決める、紙をなめらかに移す値（決めなければ空）
function usePaperMotionKey(stage: StageView): string {
  const catalog = useCatalog().core
  const views = useUiCatalog().presentationViews
  const type = stage.opened?.type
  const motion = type ? views.get(bookType(catalog, type).presentation)?.motion : undefined
  return motion ? motion(stage) : ""
}
