// ex14: ほかのプラグイン（ex9）の種類のレコードを、自分のアクションが 1 トランザクションで変える追加プラグイン。
// ex9 の棚は writableBy に ex14 を書いて許している。棚のレコードのうち、書き換える stamps と、閉じたかの closed だけを知っている。
// 棚が閉じられたら、その棚のスタンプに封をする（フォローステップ。ex9 のアクションと同じ 1 回で、ex9 は ex14 を知らない）
import { definePlugin, type FollowStepDef, z } from "matomezu"
import { kit } from "./kit"

// ex9 の棚の種類（ほかのプラグインの種類は、型でなく id で指す）
const SHELF = "ex9:shelf" as never

export const STAMP = kit.defineSubject({
  id: "stamp",
  title: "stamp",
  aiDescription: "A stamp on a shelf of ex9: the shelf's id and a mark.",
  record: z.strictObject({
    id: z.string().min(1),
    shelf: z.string().min(1),
    mark: z.string().min(1).max(20),
    sealed: z.literal(true).optional(), // 棚が閉じられた
  }),
  keys: { shelf: { type: "text", of: s => s.shelf } },
})

// 棚にスタンプを押す: スタンプを 1 件作り、同じ 1 回で、ex9 の棚の stamps を 1 増やす（どちらかだけ変わることは無い）
export const STAMP_ADD = kit.defineAction({
  id: "stamp-add",
  title: "add stamp",
  aiDescription:
    "Put a stamp (the mark) on the shelf of ex9 (its id): the shelf's stamps go up by one. Returns the stamp's id.",
  target: STAMP.id,
  writes: [SHELF],
  reads: args => [{ subject: SHELF, id: args.shelf }],
  args: z.strictObject({ shelf: z.string().min(1), mark: z.string().trim().min(1).max(20) }),
  run: (now, args, ctx) => {
    if (now !== "none") return null
    const shelf = ctx.records?.[SHELF]?.[args.shelf] as { id: string; stamps?: number } | undefined
    if (!shelf) return { declined: "the shelf is not there" }
    const id = ctx.newId()
    return {
      next: { id, shelf: shelf.id, mark: args.mark },
      // ex9 の棚の型は ex14 の型に無いので、変えるレコードに型は付けない
      others: [{ subject: SHELF, id: shelf.id, record: { ...shelf, stamps: (shelf.stamps ?? 0) + 1 } }] as never,
      result: { stamp: id },
    }
  },
})

// 棚が閉じられたか（ex9 の棚の型は ex14 の型に無いので、閉じたかだけを読む）
const closedNow = (before: unknown, after: unknown): boolean =>
  (after as { closed?: boolean }).closed === true && (before as { closed?: boolean }).closed !== true

// 棚が閉じられたら、その棚のスタンプに封をする
export const SEAL_ON_CLOSE: FollowStepDef = {
  watches: SHELF,
  writes: [STAMP.id],
  reads: c => (closedNow(c.before, c.after) ? [{ subject: STAMP.id, where: [{ key: "shelf", eq: c.id }] }] : []),
  follow: (c, ctx) => ({
    records: closedNow(c.before, c.after)
      ? Object.values(ctx.records[STAMP.id] ?? {}).flatMap(r => {
          const stamp = r as z.output<typeof STAMP.record>
          return stamp.sealed ? [] : [{ subject: STAMP.id, id: stamp.id, record: { ...stamp, sealed: true as const } }]
        })
      : [],
  }),
}

export const EX14 = definePlugin(kit.plugin({ subjects: [STAMP], actions: [STAMP_ADD], followSteps: [SEAL_ON_CLOSE] }))

export default EX14

declare module "matomezu/catalog" {
  interface SubjectTable {
    "ex14:stamp": typeof STAMP
  }
  interface ActionTable {
    "ex14:stamp-add": typeof STAMP_ADD
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
