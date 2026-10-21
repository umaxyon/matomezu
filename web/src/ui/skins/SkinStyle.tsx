// スキンを効かせる: app のスキンの CSS を置き、設定のスキンを根の要素の data-skin にする（"auto" と app に無いスキンは付けず、自動のスキンで描く）
import { useEffect, useMemo } from "react"
import { useApp, useDefs } from "../store-context"
import { skinCss } from "./css"

export function SkinStyle() {
  const skin = useApp(s => s.settings.skin)
  const { registry, autoSkin } = useDefs()
  const css = useMemo(() => skinCss(registry.skins, autoSkin), [registry, autoSkin])
  useEffect(() => {
    const root = document.documentElement
    if (!registry.skins.has(skin)) delete root.dataset.skin
    else root.dataset.skin = skin
  }, [skin, registry])
  return <style>{css}</style>
}
