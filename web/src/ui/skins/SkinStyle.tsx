// スキンを効かせる: 表のスキンの CSS を置き、設定のスキンを根の要素の data-skin にする（"auto" なら付けない）
import { useEffect } from "react"
import { useApp } from "../store-context"
import { skinCss } from "./index"

const css = skinCss()

export function SkinStyle() {
  const skin = useApp(s => s.settings.skin)
  useEffect(() => {
    const root = document.documentElement
    if (skin === "auto") delete root.dataset.skin
    else root.dataset.skin = skin
  }, [skin])
  return <style>{css}</style>
}
