// 型が誤りにする場面（tsc -p でこのプロジェクトを確かめる。@ts-expect-error の行が誤りにならなければ、確かめが落ちる）

import { BUILTIN_UI, createMatomezu } from "matomezu/testing"
import { definePluginUi } from "matomezu/ui"
import { EX2 } from ".."
import EX2_UI from "../ui"

const instance = createMatomezu({ plugins: [...BUILTIN_UI, EX2_UI], home: "master" })
// @ts-expect-error 自分のアクションの引数の形が違う
instance.actions.perform("ex2/diamond.answer", { page: "p", item: "i", answer: "maybe" }, { book: "b" })
// @ts-expect-error 型を書き足した ex2 を渡し忘れた
createMatomezu({ plugins: BUILTIN_UI, home: "master" })
// @ts-expect-error 判断のひし形のビューを結び忘れた
definePluginUi(EX2, {
  settingViews: { "ex2/flow.direction": { control: () => null } },
  dialogViews: { "ex2/diamond.add": () => null, "ex2/diamond.edit": () => null },
})
