// hoge を使わないアプリの型（tsc -p でこのプロジェクトを確かめる）。hoge の id は、このアプリの機能台帳の型の側に無い
import type { BookTypeId, ItemId } from "matomezu"
import { makeInstance } from "./App"

const instance = makeInstance()
instance.actions.command("s1", "fuga/mint")
// @ts-expect-error hoge のコマンドは、hoge を渡していないインスタンスには無い
instance.actions.command("s1", "hoge/open")

export const own: [BookTypeId, ItemId] = ["fuga/board", "fuga/star"]
// @ts-expect-error hoge のタイプと形も無い
export const other: [BookTypeId, ItemId] = ["hoge-flow/flow", "hoge-flow/diamond"]
