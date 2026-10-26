// 型が誤りにする場面（tsc -p でこのプロジェクトを確かめる。@ts-expect-error の行が誤りにならなければ、確かめが落ちる）
import { createBookIn } from "matomezu"
import { BUILTIN_UI, createMatomezu } from "matomezu/testing"
import EX3_UI from "../ui"

const instance = createMatomezu({ plugins: [...BUILTIN_UI, EX3_UI], home: "@matomezu/master:master" })
createBookIn(instance, "s1", { title: "ボード", type: "ex3:board" })
// @ts-expect-error 知らないブックのタイプ
createBookIn(instance, "s1", { title: "月", type: "ex3:moon" })
// @ts-expect-error 知らないコマンド
instance.actions.command("s1", "ex3:nope")
// @ts-expect-error 型を書き足した ex3 を渡し忘れた
createMatomezu({ plugins: BUILTIN_UI, home: "master" })
