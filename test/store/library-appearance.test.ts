// 書庫アピアランスの定義（LibraryAppearanceDef）: store 台帳に並び、スクリーンの定義が libraryAppearances で名指す。無い id を名指したら、台帳アセンブルが断る
import { expect, test } from "bun:test"
import { z } from "zod"
import type { MatomezuError } from "../../web/src/core/errors"
import { HOME_ID } from "../../web/src/core/folders"
import { defineMessages } from "../../web/src/core/i18n/messages"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../../web/src/plugins"
import { createMatomezu } from "../../web/src/store/create"
import { pluginKit } from "../../web/src/store/kit"
import { createMatomezuInstance } from "../../web/src/store/store"

// run が投げた error の番号（投げなければ null）
const codeThrown = (run: () => unknown) => {
  try {
    run()
  } catch (e) {
    return (e as MatomezuError).code
  }
  return null
}

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

test("書庫アピアランスとスクリーンの定義のメソッドが受け取る read は、自分のプラグイン状態だけを読める（ほかのプラグインの宣言は E125）", () => {
  const kit = pluginKit("k", defineMessages({ Shelf: { en: "Shelf", ja: "たな" } }))
  const other = pluginKit("o", defineMessages({}))
  const theirs = other.definePluginStateOf<string>()({ id: "theirs", scope: "screen", default: HOME_ID })
  const appearance = kit.defineLibraryAppearance({ id: "shelf", shownFolders: (_, read) => [read(theirs)] })
  const screen = kit.defineScreen({
    id: "shelf-screen",
    title: "Shelf",
    aiDescription: "A shelf.",
    props: z.strictObject({}),
    libraryAppearances: [appearance.id] as never,
  })
  const m = createMatomezuInstance({
    plugins: [
      ...BUILTIN,
      other.plugin({ pluginStates: [theirs] }),
      kit.plugin({ libraryAppearances: [appearance], screens: [screen] }),
    ],
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "ja",
  })
  // 見えたかを確かめるのは、まだ見ていない書庫の変更が在るときだけ。フォルダを作り、その名前を AI が変えたと知らせて、read の断りを見る
  const made = m.actions.perform("@matomezu/base:folder-create", { title: "箱", into: HOME_ID })
  const box = (made as { result: { folder: string } }).result.folder
  const rows = (folders: readonly unknown[]) => ({
    pages: Object.values(m.state.getState().pages),
    folders,
    settings: {},
  })
  const before = m.state.getState().folders[box]
  const after = { ...before, title: "別の名前" }
  m.receive(rows(Object.values(m.state.getState().folders)), [])
  m.actions.openScreen("k:shelf-screen" as never, {} as never)
  expect(
    codeThrown(() =>
      m.receive(rows(Object.values(m.state.getState().folders).map(f => (f === before ? after : f))), [], {
        by: "ai",
        act: "1",
        actions: ["@matomezu/base:entry-rename"],
        library: { pages: {}, folders: { [box]: { before, after } } },
      }),
    ),
  ).toBe("E125")
})
