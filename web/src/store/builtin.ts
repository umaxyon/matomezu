// 中の部品のプラグイン。matomezu が何でできているかは、ここの並びで分かる
import { BOOK_TYPES } from "../core/book-types"
import { PAPERS } from "../core/papers"
import { ACTIONS, ITEMS, THEMES } from "../core/registry"
import { COMMANDS } from "./commands"
import { DIALOGS } from "./dialogs"
import { defineBuiltin } from "./plugin"

export const MATOMEZU = defineBuiltin({
  id: "matomezu",
  bookTypes: BOOK_TYPES,
  items: ITEMS,
  actions: ACTIONS,
  themes: THEMES,
  papers: PAPERS,
  commands: COMMANDS,
  dialogs: DIALOGS,
})

export const BUILTIN = [MATOMEZU] as const
