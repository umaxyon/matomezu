// 自動のスキン（設定が "auto"）で使う、明と暗のスキン。台帳アセンブルで決め、決めなければ表で最初に出てくる明のスキンと暗のスキン。
// 片方の明暗のスキンが無ければ、もう片方を使う（スキンが 1 つも無ければ null）

import { type CodeColor, isLight, type PaletteName } from "./color"
import type { CoreCatalog } from "./core-catalog"
import type { Scheme, SkinDef } from "./def/skin"
import { fail } from "./errors"

export type AutoSkin = Readonly<Record<Scheme, string>>

export function autoSkin(catalog: CoreCatalog, given: Partial<Record<Scheme, string>> = {}): AutoSkin | null {
  const pick = (scheme: Scheme) => {
    const id = given[scheme]
    if (id === undefined) return [...catalog.skins.values()].find(s => s.scheme === scheme)?.id
    if (catalog.skins.get(id)?.scheme !== scheme) return fail("E111", { id, scheme })
    return id
  }
  const light = pick("light")
  const dark = pick("dark")
  const either = light ?? dark
  return either === undefined ? null : { light: light ?? either, dark: dark ?? either }
}

// 外観枠の代表色（スキンにもテーマにも属さないシステムの情報の色）の、スキンの明暗ごとの既定。役割はテーマの代表色と同じ。
// 暗い組は、明るい組を暗い面の上で読めるよう明るくした値。スキンは SkinDef の palette で役割ごとに上書きできる
const PALETTE_DEFAULTS: Readonly<Record<Scheme, Readonly<Record<PaletteName, string>>>> = {
  light: {
    primary: "#3b82f6",
    secondary: "#a855f7",
    success: "#22c55e",
    warn: "#eab308",
    danger: "#ef4444",
    muted: "#64748b",
  },
  dark: {
    primary: "#60a5fa",
    secondary: "#c084fc",
    success: "#4ade80",
    warn: "#facc15",
    danger: "#f87171",
    muted: "#94a3b8",
  },
}

// 外観枠の代表色の上に置く字の色: 明るい色には濃い字、暗い色には白（スキンの字の色には従わない。暗いスキンの字は明るいため）
const INK_ON_LIGHT = "#1b1b1f"
const INK_ON_DARK = "#ffffff"
export const paletteInk = (hex: string): string => (isLight(hex) ? INK_ON_LIGHT : INK_ON_DARK)

// スキン skin の外観枠の代表色（役割ごとの #rrggbb。上書きがあればそれ、なければスキンの明暗の既定）
export function skinPalette(skin: SkinDef): Readonly<Record<PaletteName, string>> {
  return { ...PALETTE_DEFAULTS[skin.scheme], ...skin.palette }
}

// ブックの外で描くコードの塊の色（種類ごとの #rrggbb）の、スキンの明暗ごとの既定。明るい組は明るい面用の値、暗い組は暗い面用の値
export const SKIN_CODE_COLORS: Readonly<Record<Scheme, Readonly<Record<CodeColor, string>>>> = {
  light: {
    comment: "#59636e",
    keyword: "#cf222e",
    string: "#0a3069",
    constant: "#0550ae",
    entity: "#6639ba",
    type: "#953800",
    variable: "#0550ae",
    tag: "#116329",
    meta: "#cf222e",
    added: "#116329",
    removed: "#82071e",
  },
  dark: {
    comment: "#8b949e",
    keyword: "#ff7b72",
    string: "#a5d6ff",
    constant: "#79c0ff",
    entity: "#d2a8ff",
    type: "#ffa657",
    variable: "#79c0ff",
    tag: "#7ee787",
    meta: "#ff7b72",
    added: "#7ee787",
    removed: "#ffa198",
  },
}
