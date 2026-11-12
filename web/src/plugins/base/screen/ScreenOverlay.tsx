// スクリーンの重ね場所: 開いているスクリーンを、置かれた枠（位置を持つ親）の全面に重ね、右から滑り込ませる。閉じるときは右へ滑り出る間も、最後に開いていた物で描き続ける。
// 開いているスクリーンの定義が無い・渡された物が定義の props に合わなければ、何も重ねない。枠（コントロールセンターの画面）は、最後の子としてこれを置く
import { type ReactNode, useEffect, useState } from "react"
import { sameData } from "../../../core/same"
import { useUiCatalog } from "../../../ui/view-hooks"
import { SLIDE_MS } from "../window/slide"
import { useOpenedScreen } from "./hooks"
import styles from "./ScreenOverlay.module.css"
import type { OpenedScreen } from "./state"

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

export function ScreenOverlay() {
  const widgets = useUiCatalog().widgets
  const opened = useOpenedScreen()
  const def = opened === "none" ? undefined : widgets.get(opened.screen)?.screen
  const now = opened !== "none" && def?.props.safeParse(opened.props).success ? opened : null
  // 滑り出る間も描くため、最後に開いていた物を覚える（開いている物が変わったら、描いている間に置き換える）
  const [last, setLast] = useState<OpenedScreen | null>(null)
  if (now && (last?.screen !== now.screen || !sameData(last.props, now.props))) setLast(now)
  const open = now !== null
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => setEntered(true))
      return () => cancelAnimationFrame(frame)
    }
    setEntered(false)
    const timer = setTimeout(() => setLast(null), reduced() ? 0 : SLIDE_MS)
    return () => clearTimeout(timer)
  }, [open])
  const shown = now ?? last
  if (!shown) return null
  const View = widgets.get(shown.screen)?.view as ((props: unknown) => ReactNode) | undefined
  return (
    <div className={styles.overlay} data-open={open && entered} inert={!open} data-screen-overlay>
      {View ? <View {...(shown.props as object)} /> : null}
    </div>
  )
}
