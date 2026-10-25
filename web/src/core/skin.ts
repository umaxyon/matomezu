// 自動のスキン（設定が "auto"）で使う、明と暗のスキン。インスタンスの組み立てで決め、決めなければ表で最初に出てくる明のスキンと暗のスキン。
// 片方の明暗のスキンが無ければ、もう片方を使う（スキンが 1 つも無ければ null）

import type { CoreCatalog } from "./core-catalog"
import type { Scheme } from "./def/skin"
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
