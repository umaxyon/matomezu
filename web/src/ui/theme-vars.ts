// テーマの値（core/theme.ts）を CSS 変数にする。変数の名前は tokenVarName（core/def/theme.ts）。
// 明暗で違う色は light-dark() にし、ブックの中身の明暗は見る人の OS の明暗に合わせる（color-scheme: light dark。スキンの明暗には従わない）
import { type CSSProperties, createElement, type ReactNode, useMemo } from "react"
import { ownTokenVarName, tokenVarName } from "../core/def/theme"
import { splitId } from "../core/names"
import type { Shades } from "../core/theme"
import { useCatalog } from "./store-context"

// own を渡すと、そのプラグインの欄は --<名前> にも置く（アイテムが自分のテーマを持つとき、そのアイテムの要素に置く）
export function themeVars(tokens: Readonly<Record<string, Shades>>, own?: string): CSSProperties {
  const vars = Object.entries(tokens).flatMap(([id, { light, dark }]) => {
    const value = light === dark ? light : `light-dark(${light}, ${dark})`
    return own !== undefined && splitId(id).owner === own
      ? [
          [tokenVarName(id), value],
          [ownTokenVarName(id), value],
        ]
      : [[tokenVarName(id), value]]
  })
  return { colorScheme: "light dark", ...Object.fromEntries(vars) } as CSSProperties
}

// プラグイン owner の欄を、そのプラグインの見た目で --<名前> で読めるようにする値（描く要素の style に置く。ほかのプラグインの欄は置かない）
export function ownTokenVars(tokens: Iterable<string>, owner: string): CSSProperties {
  const own = [...tokens].filter(id => splitId(id).owner === owner)
  return Object.fromEntries(own.map(id => [ownTokenVarName(id), `var(${tokenVarName(id)})`])) as CSSProperties
}

// 定義 def（アイテム・ブックのタイプなど。本当の id）のプラグインの欄を、--<名前> で読めるようにする値。
// プラグインの見た目を描く所（紙のアイテムの枠・つなぐものの層など）が、その要素の style に置く
export function useTokenScope(def: string): CSSProperties {
  const catalog = useCatalog().core
  return useMemo(() => {
    const owner = splitId(def).owner
    if (owner === null) return {}
    const declared = [...catalog.bookTypes.values(), ...catalog.items.values()].flatMap(d => d.tokens.map(t => t.id))
    return ownTokenVars(declared, owner)
  }, [catalog, def])
}

// 定義 def のプラグインの欄を --<名前> で読める範囲（箱を作らない要素で包む）。紙が、つなぐもののビューの層と重ねるコンポーネントを包むのに使う
export function TokenScope({ def, children }: { def: string; children: ReactNode }) {
  return createElement("div", { style: { display: "contents", ...useTokenScope(def) } }, children)
}
