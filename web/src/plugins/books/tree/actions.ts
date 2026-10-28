// ツリーの節のアクション: 節を足す（id の無い入れ子で受け、全部に id を振って返す）・子のキャプションを替える・子孫ごと消す（根は消せない）。
// 根のキャプションと本文は、ページのフィールドの受け方（page-fields.ts）で base の page-update が替える。
// ページのフィールド root を書き換える。ツリーの見せ方について来る
import { z } from "zod"
import { type PagedBook, putPage } from "../../../plugin-api"
import { contentIdMaker } from "../../base"
import { addNodes, captionNode, removeNode } from "./edit"
import { kit } from "./kit"
import { giveIds, NewNodeSchema, type TreeRoot, TreeRootSchema } from "./node"

const ON_TREES = { presentations: [kit.name("tree")] }

// ページ page の根と、根を替えたブックを作る関数（ツリーのページでなければ null）
function treeOf(book: PagedBook, page: string) {
  const found = book.pages.find(p => p.id === page)
  if (!found || !("root" in found)) return null
  const root = TreeRootSchema.safeParse(found.root)
  if (!root.success) return null
  return {
    root: root.data,
    put: (next: TreeRoot) => {
      const written = { ...found, root: next }
      return putPage(book, written)
    },
  }
}

export const NODE_ADD = kit.defineAction({
  id: "node-add",
  attach: ON_TREES,
  aiDescription:
    "Add nodes to a tree page under the node parent (the root's id for its children), at index among its children (the end without it). nodes are nested (write no ids); every node gets an id, returned in nodes in the same nesting. In a center tree, side tells which way a direct child of the root grows (right without it); it is not used elsewhere. Refused if the page is not a tree page, parent is not in it, or index is past the end.",
  title: "Add nodes",
  target: "book",
  args: z.strictObject({
    page: z.string().min(1),
    parent: z.string().min(1),
    index: z.number().int().min(0).optional(),
    nodes: z.array(NewNodeSchema).min(1),
  }),
  run: (book, args, ctx) => {
    if (!("pages" in book)) return null
    const tree = treeOf(book, args.page)
    if (!tree) return null
    const given = giveIds(args.nodes, contentIdMaker(book, ctx.newId))
    const next = addNodes(tree.root, args.parent, given.nodes, args.index)
    return next && { next: tree.put(next), result: { nodes: given.ids } }
  },
})

export const NODE_UPDATE = kit.defineAction({
  id: "node-update",
  attach: ON_TREES,
  aiDescription:
    "Change the caption of a child node of a tree page. Returns nothing. Refused for the root (change it with @matomezu/base:page-update) or a node not in the page.",
  title: "Update node",
  target: "book",
  args: z.strictObject({ page: z.string().min(1), node: z.string().min(1), caption: z.string() }),
  run: (book, args) => {
    if (!("pages" in book)) return null
    const tree = treeOf(book, args.page)
    const next = tree && captionNode(tree.root, args.node, args.caption)
    return next && tree && { next: tree.put(next), result: {} }
  },
})

export const NODE_REMOVE = kit.defineAction({
  id: "node-remove",
  attach: ON_TREES,
  aiDescription:
    "Remove a child node of a tree page with all its descendants. Returns nothing. Refused for the root or a node not in the page.",
  title: "Remove node",
  target: "book",
  args: z.strictObject({ page: z.string().min(1), node: z.string().min(1) }),
  run: (book, args) => {
    if (!("pages" in book)) return null
    const tree = treeOf(book, args.page)
    const next = tree && removeNode(tree.root, args.node)
    return next && tree && { next: tree.put(next), result: {} }
  },
})
