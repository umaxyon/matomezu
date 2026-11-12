// ex9 のカードと棚: 自分で足したアクションの対象の種類（レコード）。カードは番号を振る（区切りは 1 つ）。名前は重ならない（reads で同じ種類を読んで確かめる）。
// カードは棚を指し（refers）、閉じた棚にカードを足すのは、認可ステップ（CLOSED_SHELF）が、行った後の実際の参照で止める
import { z } from "matomezu"
import { kit } from "./kit"

export const SHELF = kit.defineSubject({
  id: "shelf",
  title: "shelf",
  aiDescription: "A shelf of cards: a name, and closed (no card can be added to a closed shelf).",
  record: z.strictObject({ id: z.string().min(1), name: z.string().min(1).max(40), closed: z.boolean() }),
})

export const CARD = kit.defineSubject({
  id: "card",
  title: "card",
  aiDescription:
    "A card: a name, a number (the numbers go up from 1 and are not reused) and the shelf it is on (optional). Names are not repeated.",
  record: z.strictObject({
    id: z.string().min(1),
    name: z.string().min(1).max(40),
    no: z.number().int().min(1),
    shelf: z.string().min(1).optional(),
    locked: z.literal(true).optional(), // ロックの印（base の lockable）
  }),
  refers: card => (card.shelf === undefined ? [] : [{ subject: SHELF.id, id: card.shelf }]),
  numbered: true,
  lockable: true,
})

// 棚を作る・閉じる
export const SHELF_ADD = kit.defineAction({
  id: "shelf-add",
  title: "add shelf",
  aiDescription: "Add an open shelf with the name. Returns the shelf's id.",
  target: SHELF.id,
  args: z.strictObject({ name: z.string().trim().min(1).max(40) }),
  run: (_now, args, ctx) => {
    const id = ctx.newId()
    return { next: { id, name: args.name, closed: false }, result: { shelf: id } }
  },
})
export const SHELF_CLOSE = kit.defineAction({
  id: "shelf-close",
  title: "close shelf",
  aiDescription: "Close the shelf named by on.record: no card can be added to it after that.",
  target: SHELF.id,
  args: z.strictObject({}),
  run: now => (now === "none" ? null : { next: { ...now, closed: true }, result: {} }),
})

// カードのロックを掛ける・外す（ロック中のカードは、この 2 つのほかのアクションを断る。外せるのは利用者だけ）
export const CARD_LOCK = kit.defineAction({
  id: "card-lock",
  title: "lock card",
  aiDescription:
    "Lock the card named by on.record: while locked it cannot be changed or removed (only the user can unlock it).",
  lockSwitch: true,
  target: CARD.id,
  reads: [SHELF.id],
  args: z.strictObject({}),
  run: now => (now === "none" || now.locked ? null : { next: { ...now, locked: true as const }, result: {} }),
})
export const CARD_UNLOCK = kit.defineAction({
  id: "card-unlock",
  title: "unlock card",
  aiDescription: "Unlock the card named by on.record (only the user).",
  lockSwitch: true,
  userOnly: true,
  target: CARD.id,
  reads: [SHELF.id],
  args: z.strictObject({}),
  run: now => {
    if (now === "none" || !now.locked) return null
    const { locked: _, ...rest } = now
    return { next: rest, result: {} }
  },
})

// 閉じた棚にカードを足させない。守るのは、行った後の実際の参照（アクションが引数と違う棚に書いても守れる）
export const CLOSED_SHELF = kit.definePermission({
  id: "closed-shelf",
  title: "closedShelf",
  aiDescription: "the shelf is closed; no card can be added to it",
  denies: () => false,
  keeps: c =>
    c.kind !== "record" ||
    c.subject !== CARD.id ||
    c.before !== "none" ||
    !c.refs.some(r => r.subject === SHELF.id && r.record !== "none" && (r.record as { closed: boolean }).closed),
})

// カードを作る: 名前は重ならない。番号は常駐が決める
export const CARD_ADD = kit.defineAction({
  id: "card-add",
  title: "add card",
  aiDescription: "Add a card with the name. Refused when a card has the name. Returns the card's id and number.",
  target: CARD.id,
  reads: [CARD.id, SHELF.id],
  args: z.strictObject({ name: z.string().trim().min(1).max(40), shelf: z.string().min(1).optional() }),
  run: (_now, args, ctx) => {
    const taken = Object.values(ctx.records?.[CARD.id] ?? {}).some(c => (c as { name: string }).name === args.name)
    if (taken) return { declined: `a card named ${args.name} already exists` }
    const id = ctx.newId()
    if (!ctx.number) return null // 番号を振る種類のアクションだけが受け取る
    const no = ctx.number("all")
    return { next: { id, name: args.name, no, ...(args.shelf ? { shelf: args.shelf } : {}) }, result: { card: id, no } }
  },
})

// カードの名前を変える（番号は変えない）
export const CARD_RENAME = kit.defineAction({
  id: "card-rename",
  title: "rename card",
  aiDescription: "Rename the card named by on.record. Refused when another card has the name.",
  target: CARD.id,
  reads: [CARD.id, SHELF.id],
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
  reads: [SHELF.id],
  args: z.strictObject({}),
  run: now => (now === "none" ? null : { next: "removed", result: {} }),
})
