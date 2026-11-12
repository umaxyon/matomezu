// 列挙の値を引く: 宣言した列挙 id の値（効く物だけ。宣言が台帳に無い値は台帳アセンブルが warning にして、ここには入らない）を、足された順に返す。値の中（data）は宣言した側が読む
import type { CoreCatalog } from "./core-catalog"
import type { EnumValueDef } from "./def/enum"

export const enumValuesOf = <E extends string>(
  catalog: Pick<CoreCatalog, "enumValues" | "enums">,
  id: E,
): readonly EnumValueDef<E>[] =>
  catalog.enums.has(id) ? ([...catalog.enumValues.values()].filter(v => v.enum === id) as EnumValueDef<E>[]) : []
