// ex13 の型だけの確かめ（実行しない。typecheck が見る）: 索引キーは、宣言した名前と、その値の型だけを書ける
import { z } from "matomezu"
import { MEMO } from ".."
import { kit } from "../kit"

export const TYPE_CHECKS = [
  kit.defineAction({
    id: "t1",
    title: "memo",
    aiDescription: "",
    target: MEMO.id,
    args: z.strictObject({}),
    // @ts-expect-error text は索引キーでない
    reads: () => [{ subject: MEMO.id, where: [{ key: "text", eq: "a" }] }],
    run: () => null,
  }),
  kit.defineAction({
    id: "t2",
    title: "memo",
    aiDescription: "",
    target: MEMO.id,
    args: z.strictObject({}),
    // @ts-expect-error board は字の索引キー
    reads: () => [{ subject: MEMO.id, where: [{ key: "board", eq: 1 }] }],
    run: () => null,
  }),
  kit.defineSubject({
    id: "t3",
    title: "memo",
    aiDescription: "",
    record: z.strictObject({ id: z.string(), board: z.string() }),
    // @ts-expect-error 数の索引キーは数を返す
    keys: { board: { type: "number", of: m => m.board } },
  }),
  kit.defineSubject({
    id: "t4",
    title: "memo",
    aiDescription: "",
    record: z.strictObject({ id: z.string(), board: z.string() }),
    keys: { board: { type: "text", of: m => m.board } },
    // @ts-expect-error 並びに書けるのは宣言した索引キーだけ
    aiList: { order: { key: "text", dir: "asc" }, limit: 20 },
  }),
]
