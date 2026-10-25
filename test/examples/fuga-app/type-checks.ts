// hoge を使わないアプリの型（tsc -p でこのプロジェクトを確かめる）。hoge の id は、このアプリの型の表に無い
import type { BookTypeId, ItemId } from "matomezu"
import { makeApp } from "./App"

const app = makeApp()
app.actions.command("s1", "fuga/mint")
// @ts-expect-error hoge のコマンドは、hoge を渡していない app には無い
app.actions.command("s1", "hoge/open")

export const own: [BookTypeId, ItemId] = ["fuga/board", "fuga/star"]
// @ts-expect-error hoge のタイプと形も無い
export const other: [BookTypeId, ItemId] = ["hoge-flow/flow", "hoge-flow/diamond"]
