// 型が誤りにする場面（tsc -p でこのプロジェクトを確かめる。@ts-expect-error の行が誤りにならなければ、確かめが落ちる）
import { BUILTIN_UI, createMatomezu } from "matomezu/testing"
import { kit } from "../kit"
import EX1_UI from "../ui"

const instance = createMatomezu({ plugins: [...BUILTIN_UI, EX1_UI], home: "@matomezu/master:master" })
instance.actions.command("s1", "ex1:lang", "ja")
// @ts-expect-error 引数の要るコマンドに渡していない
instance.actions.command("s1", "ex1:lang")
// @ts-expect-error 引数の型が違う
instance.actions.command("s1", "ex1:lang", "de")
// @ts-expect-error 知らないコマンド
instance.actions.command("s1", "ex1:nope")
// @ts-expect-error 型を書き足した ex1 を渡し忘れた
createMatomezu({ plugins: BUILTIN_UI, home: "master" })
// @ts-expect-error 引数の型が違う既定のキー
kit.defineKey({
  id: "bad-key",
  key: "Mod+K",
  command: "ex1:lang",
  scope: "global",
  args: "de",
  title: "switchToJapanese",
})
// @ts-expect-error args を書いたキーバインドに題名が無い（設定画面で、同じコマンドのほかの行と見分けられない）
kit.defineKey({ id: "no-title-key", key: "Mod+K", command: "ex1:lang", scope: "global", args: "ja" })
kit.defineCommand({
  id: "arg",
  title: "sayHello",
  run: (_ctx, _a, _n: number) => {},
  when: () => true,
  // @ts-expect-error 引数を取るコマンドはメニューに入れられない
  place: { menus: ["@matomezu/base:stage-menu"] },
})
kit.defineCommand({
  id: "anchor-arg",
  title: "sayHello",
  run: (_ctx, _a, _anchor: string) => {},
  when: () => true,
  place: { anchorMenu: true },
})
kit.defineCommand({
  id: "anchor-bad",
  title: "sayHello",
  run: (_ctx, _a, _n: number) => {},
  when: () => true,
  // @ts-expect-error アンカーの id（文字列）を取れないコマンドは anchorMenu に入れられない
  place: { anchorMenu: true },
})
kit.defineCommand({
  id: "state-in-when",
  title: "sayHello",
  run: (_ctx, a) => a.updateStageState(now => now),
  // @ts-expect-error when・enabled・active の文脈には、画面の状態を変える操作が無い（変えるのは run が受け取る updateStageState だけ）
  when: ctx => ctx.updateStageState(() => 1) === undefined,
  // @ts-expect-error 同じく enabled にも無い
  enabled: ctx => ctx.setStageState(1) === undefined,
  active: ctx => ctx.stageState === "on",
})
