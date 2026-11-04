// 伝言: 利用者がブックの物に付けて AI に伝える文の、アノテーションの種類（core/def/annotation.ts）。付ける・変える・消すのは利用者だけ（userOnly）で、AI は読んだと知らせるだけ。
// 返事は書かない。文の無い印はマーク（mark/）。
// AI が読んだかは readAt（AI が読んだ時点）で持ち、利用者が文を変えると未読に戻る。「伝わったら消す」（removeOnRead）なら、AI が読んだと知らせた時点で消える。
// ロック中のブックにも付けられる（ロックはアノテーションを止めない）
import { z } from "zod"
import type { Annotation } from "../../../core/annotation"
import type { ConnectorData, ShapeData } from "../../../core/def/item"
import { freshId } from "../../../core/ids"
import type { ItemPage } from "../../../core/placed"
import { kit } from "../kit"

// 物の名前を返すメソッド（伝言の付ける先の名前に出す。引くのは labels.ts）（定義オブジェクトの拡張ポイントに書き足す）。名前は本文と同じ書き方でよい（装飾は引く側が外す）。
// 自分の物でなければ null、自分の物でも名前が無ければ空の文字列を返す（空なら、引く側は種類の名前を出す）
declare module "../../../core/catalog" {
  interface BookTypeExtras {
    // ページ page の中の物 id の名前（形として置いた物は、形の定義が受ける）
    labelOf?(page: ItemPage, id: string): string | null
  }
  interface ShapeItemExtras<D extends ShapeData = ShapeData> {
    // 置いた形 item そのもの（id が item.id）か、その中の物 id の名前。無ければ、形そのものはキャプション（captionProp）
    labelOf?(item: D, id: string): string | null
  }
  interface ConnectorItemExtras<D extends ConnectorData = ConnectorData> {
    // つないだ線など line の名前
    labelOf?(line: D): string | null
  }
}

const TEXT = z.string().min(1).max(2000)

const NoteSchema = z.strictObject({
  text: TEXT, // 伝える文
  bubble: z.boolean(), // 吹き出しを出すか（出さなければ、たたんだ伝言の絵だけ）
  removeOnRead: z.boolean(), // AI が読んだと知らせたら消すか
  readAt: z.string().optional(), // AI が読んだ時点（無ければ未読）
})
export type NoteProps = z.output<typeof NoteSchema>

export const NOTE = kit.defineAnnotation({
  id: "note",
  title: "Note",
  aiDescription:
    "A note the user put on things in a book (anchors) to tell AI something: text is what the user wants AI to know. There is no reply: take it in, then call note-read to tell the user it reached you (a note with removeOnRead is removed then; others stay and you keep them in mind). readAt is when AI read it (none: unread; the user changing the text makes it unread again).",
  props: NoteSchema,
  awaits: p => p.readAt === undefined,
})

// id の伝言（無いか、伝言でなければ undefined）
const findNote = (annotations: readonly Annotation[], id: string) =>
  annotations.find(a => a.id === id && a.annotation === NOTE.id)

// id の伝言の中身（無いか、伝言でなければ undefined）
const noteIn = (annotations: readonly Annotation[], id: string) =>
  findNote(annotations, id)?.props as NoteProps | undefined

// id の伝言を change で変えた並び（無いか、伝言でなければ null。change が null を返しても断る）
function changeNote(
  annotations: readonly Annotation[],
  id: string,
  change: (props: NoteProps) => NoteProps | null,
): Annotation[] | null {
  const found = findNote(annotations, id)
  if (!found) return null
  const props = change(found.props as NoteProps)
  return props ? annotations.map(a => (a === found ? { ...found, props } : a)) : null
}

// id の伝言を除いた並び（無ければ null）
function withoutNote(annotations: readonly Annotation[], id: string): Annotation[] | null {
  const next = annotations.filter(a => !(a.id === id && a.annotation === NOTE.id))
  return next.length === annotations.length ? null : next
}

const ID_ARGS = z.strictObject({ note: z.string().min(1) })

export const NOTE_ADD = kit.defineAction({
  id: "note-add",
  attach: { annotations: [NOTE.id] },
  aiDescription:
    "Add a note to things in the book (only the user adds notes): anchors are the ids of the things it is about (items, lines, list rows, tree nodes, folder rows; one or more, not pages; the bubble stands by the last). bubble (default true) shows the start of the text in a bubble. removeOnRead (default true) removes it once AI has read it. Returns the new note's id.",
  title: "Add note",
  target: "annotations",
  userOnly: true,
  args: z.strictObject({
    anchors: z.array(z.string().min(1)).min(1),
    text: TEXT,
    bubble: z.boolean().optional(),
    removeOnRead: z.boolean().optional(),
  }),
  run: ({ book, annotations }, args, ctx) => {
    const id = freshId(
      ctx.newId,
      annotations.map(a => a.id),
    )
    const props: NoteProps = { text: args.text, bubble: args.bubble ?? true, removeOnRead: args.removeOnRead ?? true }
    const note: Annotation = { id, annotation: NOTE.id, anchors: [...new Set(args.anchors)], props }
    return { next: { book, annotations: [...annotations, note] }, result: { note: id } }
  },
})

export const NOTE_UPDATE = kit.defineAction({
  id: "note-update",
  attach: { annotations: [NOTE.id] },
  aiDescription:
    "Change a note's text, the things it is on (anchors; the bubble stands by the last), whether it shows a bubble, or whether it is removed once read (only the user). Changing the text makes it unread again. Refused if nothing changes.",
  title: "Change note",
  target: "annotations",
  userOnly: true,
  args: z.strictObject({
    note: z.string().min(1),
    text: TEXT.optional(),
    anchors: z.array(z.string().min(1)).min(1).optional(),
    bubble: z.boolean().optional(),
    removeOnRead: z.boolean().optional(),
  }),
  run: ({ book, annotations }, { note, anchors, ...change }) => {
    const found = findNote(annotations, note)
    const moved = anchors ? [...new Set(anchors)] : found?.anchors
    const sameAnchors =
      !!found && !!moved && moved.length === found.anchors.length && moved.every((id, i) => found.anchors[i] === id)
    const next = changeNote(annotations, note, p => {
      const changed = { ...p, ...change }
      const same = changed.text === p.text && changed.bubble === p.bubble && changed.removeOnRead === p.removeOnRead
      if (same) return sameAnchors ? null : p
      if (changed.text === p.text) return changed
      const { readAt: _, ...unread } = changed
      return unread
    })
    const placed =
      next && moved ? next.map(a => (a.id === note && a.annotation === NOTE.id ? { ...a, anchors: moved } : a)) : next
    return placed ? { next: { book, annotations: placed }, result: {} } : null
  },
})

export const NOTE_READ = kit.defineAction({
  id: "note-read",
  attach: { annotations: [NOTE.id] },
  aiDescription:
    "Tell the user a note reached AI: it is marked read, or removed if it has removeOnRead. Refused if it is already read.",
  title: "Mark note read",
  target: "annotations",
  args: ID_ARGS,
  run: ({ book, annotations }, args, ctx) => {
    const props = noteIn(annotations, args.note)
    if (!props || props.readAt) return null
    const next = props.removeOnRead
      ? withoutNote(annotations, args.note)
      : changeNote(annotations, args.note, p => ({ ...p, readAt: ctx.now }))
    return next ? { next: { book, annotations: next }, result: {} } : null
  },
})

export const NOTE_REMOVE = kit.defineAction({
  id: "note-remove",
  attach: { annotations: [NOTE.id] },
  aiDescription: "Remove a note (only the user).",
  title: "Remove note",
  target: "annotations",
  userOnly: true,
  args: ID_ARGS,
  run: ({ book, annotations }, args) => {
    const next = withoutNote(annotations, args.note)
    return next ? { next: { book, annotations: next }, result: {} } : null
  },
})
