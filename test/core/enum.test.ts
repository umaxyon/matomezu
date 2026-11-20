// 列挙: 宣言した列挙に、値を足せる。値の data は宣言の形に合わなければ error、宣言が台帳に無い値は効かない warning で、引く側（enumValuesOf）には入らない

import { expect, test } from "bun:test"
import { z } from "zod"
import { buildCoreCatalog } from "../../web/src/core/core-catalog"
import { checkCoreCatalog } from "../../web/src/core/core-catalog-check"
import type { EnumDef, EnumValueDef } from "../../web/src/core/def/enum"
import { enumValuesOf } from "../../web/src/core/enum"
import { CORE_MESSAGES } from "../../web/src/core/i18n/messages"
import { warningText } from "../../web/src/core/warnings"
import { BUILTIN_PARTS } from "../support"

const TITLE = Object.keys(CORE_MESSAGES.messages)[0] as never

const kind = {
  id: "@x/y:kind",
  title: TITLE,
  aiDescription: "kinds",
  value: z.strictObject({ n: z.number() }),
} as EnumDef
const value = (id: string, data: unknown, of = kind.id): EnumValueDef =>
  ({ id, enum: of, title: TITLE, aiDescription: "v", data }) as EnumValueDef
const parts = (enums: EnumDef[], values: EnumValueDef[]) => ({ ...BUILTIN_PARTS, enums, enumValues: values })

test("値の data が宣言の value の形に合わなければ error（E053）、合えば通る。同じ id の値は E001", () => {
  expect(checkCoreCatalog(parts([kind], [value("@x/z:a", { n: 1 })]))).toEqual([])
  expect(checkCoreCatalog(parts([kind], [value("@x/z:a", { n: "1" })])).map(p => p.code)).toEqual(["E053"])
  expect(
    checkCoreCatalog(parts([kind], [value("@x/z:a", { n: 1 }), value("@x/z:a", { n: 2 })])).map(p => p.code),
  ).toEqual(["E001"])
})

test("宣言が台帳に無い値は error にせず、効かない warning。enumValuesOf には入らず、足された順に並ぶ", () => {
  const catalog = buildCoreCatalog(
    parts([kind], [value("@x/z:b", { n: 2 }), value("@x/z:a", { n: 1 }), value("@x/z:c", { n: 3 }, "@x/y:gone")]),
  )
  expect(enumValuesOf(catalog, kind.id).map(v => v.id)).toEqual(["@x/z:b", "@x/z:a"])
  expect(enumValuesOf(catalog, "@x/y:gone")).toEqual([])
  expect(catalog.warnings.map(warningText)).toEqual([
    "W026 @x/z: enum value @x/z:c: its enum @x/y:gone is not in the catalog (not used)",
  ])
})
