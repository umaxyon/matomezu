// ex9 のカード: 自分で足したアクションの対象の種類（レコード）。カードは番号を振る（区切りは 1 つ）。名前は重ならない（reads で同じ種類を読んで確かめる）
import { nextNumber, z } from "matomezu"
import { kit } from "./kit"

export const CARD = kit.defineSubject({
  id: "card",
  title: "card",
  aiDescription: "A card: a name and a number (the numbers go up from 1 and are not reused). Names are not repeated.",
  record: z.strictObject({ id: z.string().min(1), name: z.string().min(1).max(40), no: z.number().int().min(1) }),
  numbered: true,
})

// カードを作る: 名前は重ならない。番号は常駐が決める
export const CARD_ADD = kit.defineAction({
  id: "card-add",
  title: "add card",
  aiDescription: "Add a card with the name. Refused when a card has the name. Returns the card's id and number.",
  target: CARD.id,
  reads: [CARD.id],
  args: z.strictObject({ name: z.string().trim().min(1).max(40) }),
  run: (_now, args, ctx) => {
    const taken = Object.values(ctx.records?.[CARD.id] ?? {}).some(c => (c as { name: string }).name === args.name)
    if (taken) return { declined: `a card named ${args.name} already exists` }
    const id = ctx.newId()
    const no = nextNumber(ctx, CARD_ADD.id, "all")
    return { next: { id, name: args.name, no }, result: { card: id, no } }
  },
})

// カードの名前を変える（番号は変えない）
export const CARD_RENAME = kit.defineAction({
  id: "card-rename",
  title: "rename card",
  aiDescription: "Rename the card named by on.record. Refused when another card has the name.",
  target: CARD.id,
  reads: [CARD.id],
  args: z.strictObject({ name: z.string().trim().min(1).max(40) }),
  run: (now, args, ctx) => {
    if (now === "none") return null
    const taken = Object.values(ctx.records?.[CARD.id] ?? {}).some(
      c => (c as { id: string; name: string }).name === args.name && (c as { id: string }).id !== now.id,
    )
    if (taken) return { declined: `a card named ${args.name} already exists` }
    return { next: { ...now, name: args.name }, result: {} }
  },
})

// カードを消す（番号は戻さない）
export const CARD_REMOVE = kit.defineAction({
  id: "card-remove",
  title: "remove card",
  aiDescription: "Remove the card named by on.record. Its number is not reused.",
  target: CARD.id,
  args: z.strictObject({}),
  run: now => (now === "none" ? null : { next: "removed", result: {} }),
})
