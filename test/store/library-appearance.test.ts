// 書庫アピアランスの定義（LibraryAppearanceDef）: store 台帳に並び、スクリーンの定義が libraryAppearances で名指す。無い id を名指したら、台帳アセンブルが断る
import { expect, test } from "bun:test"
import { z } from "zod"
import type { MatomezuError } from "../../web/src/core/errors"
import { HOME_ID } from "../../web/src/core/folders"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { BUILTIN } from "../../web/src/plugins"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"

const thrown = (run: () => unknown) => {
  try {
    run()
  } catch (e) {
    return e instanceof Error && e.name === "MatomezuError" ? (e as MatomezuError).details.map(p => p.code) : e
  }
  return null
}

test("書庫アピアランスは、kit が id に頭を付けて store 台帳に並ぶ。スクリーンの定義が無い id を名指したら E075、同じ id が 2 つなら E001", () => {
  const kit = pluginKit("k", defineMessages({ Shelf: { en: "Shelf", ja: "たな" } }))
  const appearance = kit.defineLibraryAppearance({ id: "shelf", shownFolders: () => [HOME_ID] })
  expect(appearance.id).toBe("k:shelf")
  const screen = (names: readonly string[]) =>
    kit.defineScreen({
      id: "shelf-screen",
      title: "Shelf",
      aiDescription: "A shelf.",
      props: z.strictObject({}),
      libraryAppearances: names as never,
    })
  const make = (appearances: readonly unknown[], names: readonly string[]) => () =>
    createMatomezu({
      plugins: [...BUILTIN, kit.plugin({ libraryAppearances: appearances as never, screens: [screen(names)] })],
      partial: true,
    })
  const instance = make([appearance], ["k:shelf"])()
  expect(instance.catalog.store.libraryAppearances.get("k:shelf")).toBe(appearance)
  expect(instance.catalog.store.libraryAppearances.has("@matomezu/base:library")).toBe(true)
  expect(thrown(make([], ["k:shelf"]))).toEqual(["E075"])
  expect(thrown(make([appearance, appearance], ["k:shelf"]))).toEqual(["E001"])
})
