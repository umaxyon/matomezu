// 型が誤りにする場面（tsc -p でこのプロジェクトを確かめる。@ts-expect-error の行が誤りにならなければ、確かめが落ちる）

import type { MessageKey } from "../../../web/src/core/tables"
import { BUILTIN_UI } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { defineKeys } from "../../../web/src/store/keys"
import { makeApp } from "./App"
import { HOGE } from "./hoge-dialog"

const translateKey = (key: MessageKey) => key

const app = makeApp()
app.actions.command("s1", "hoge/greet", "ja")
// @ts-expect-error 引数の要るコマンドに渡していない
app.actions.command("s1", "hoge/greet")
// @ts-expect-error 引数の型が違う
app.actions.command("s1", "hoge/greet", "fr")
// @ts-expect-error 知らないコマンド
app.actions.command("s1", "hoge/nope")
// @ts-expect-error hoge を渡し忘れた
createMatomezu({ plugins: BUILTIN_UI })
// @ts-expect-error 文言の表に無い鍵
app.registry.messages.get("hoge") && translateKey("hoge の言葉")
// 見た目を結ばないプラグインでも、React を使わない app なら作れる
createMatomezu({ plugins: [...BUILTIN_UI, HOGE] })
// キーの既定: 引数の型はコマンドの引数の型
defineKeys([{ key: "K", command: "hoge/greet", scope: "stage", args: "en" }])
// @ts-expect-error 引数の型が違う
defineKeys([{ key: "K", command: "hoge/greet", scope: "stage", args: "fr" }])
// @ts-expect-error 知らない範囲
defineKeys([{ key: "K", command: "hoge/open", scope: "nowhere" }])
// @ts-expect-error 知らないコマンド
defineKeys([{ key: "K", command: "hoge/nope", scope: "stage" }])
