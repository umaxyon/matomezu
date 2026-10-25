// 型が誤りにする場面（tsc -p でこのプロジェクトを確かめる。@ts-expect-error の行が誤りにならなければ、確かめが落ちる）
import { defineCommand, defineKeys } from "matomezu"
import { BUILTIN_UI, createMatomezu } from "matomezu/testing"
import EX1_UI from "../ui"

const instance = createMatomezu({ plugins: [...BUILTIN_UI, EX1_UI], home: "master" })
instance.actions.command("s1", "ex1/lang", "ja")
// @ts-expect-error 引数の要るコマンドに渡していない
instance.actions.command("s1", "ex1/lang")
// @ts-expect-error 引数の型が違う
instance.actions.command("s1", "ex1/lang", "de")
// @ts-expect-error 知らないコマンド
instance.actions.command("s1", "ex1/nope")
// @ts-expect-error 型を書き足した ex1 を渡し忘れた
createMatomezu({ plugins: BUILTIN_UI, home: "master" })
// @ts-expect-error 引数の型が違う既定のキー
defineKeys([{ key: "Mod+K", command: "ex1/lang", scope: "global", args: "de" }])
defineCommand({
  id: "ex1/arg",
  title: "ex1/sayHello",
  run: (_ctx, _a, _n: number) => {},
  when: () => true,
  // @ts-expect-error 引数を取るコマンドはメニューに入れられない
  place: { menus: ["stage.menu"] },
})
