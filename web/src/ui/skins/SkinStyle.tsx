// スキンを効かせる: インスタンスのスキンの CSS を置き、設定のスキンを根の要素の data-skin にする（"auto" とインスタンスに無いスキンは付けず、自動のスキンで描く）
import { useEffect, useMemo } from "react"
import { skinOf } from "../../core/settings"
import { useInstance, useMatomezuState } from "../store-context"
import { skinCss } from "./css"

export function SkinStyle() {
  const {
    catalog: { core: catalog },
    autoSkin,
  } = useInstance()
  const skin = useMatomezuState(s => skinOf(catalog, s.settings))
  const css = useMemo(() => skinCss(catalog.skins, autoSkin), [catalog, autoSkin])
  useEffect(() => {
    const root = document.documentElement
    if (!catalog.skins.has(skin)) delete root.dataset.skin
    else root.dataset.skin = skin
  }, [skin, catalog])
  return <style>{css}</style>
}
