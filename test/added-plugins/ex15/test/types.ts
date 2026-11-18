// ex15 の型だけの確かめ（実行しない。typecheck が見る）: スクリーンの定義が名指せる書庫アピアランスは、定義して書き足した id だけ
import { z } from "matomezu"
import { kit } from "../kit"

export const TYPE_CHECKS = [
  kit.defineScreen({
    id: "t1",
    title: "shelf",
    aiDescription: "",
    props: z.strictObject({}),
    // @ts-expect-error 定義の無い書庫アピアランス
    libraryAppearances: ["ex15:no-such-appearance"],
  }),
]
