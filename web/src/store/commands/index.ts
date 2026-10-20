// コマンドの表と、呼ばれた場所の様子からコマンドを出すか・押せるかを決める操作
import type { AppState } from "../store"
import { BOOK_NEW, BOOK_OPEN, PAGE_NEW, PAGE_OPEN } from "./book"
import type { CommandContext, CommandDef } from "./def"
import { SETTINGS_LANG, SETTINGS_SKIN } from "./settings"
import { STAGE_CLOSE, STAGE_MASTER, STAGE_SPLIT, STAGE_UNSPLIT } from "./stage"

export const COMMANDS = [
  STAGE_MASTER,
  STAGE_SPLIT,
  STAGE_UNSPLIT,
  STAGE_CLOSE,
  BOOK_OPEN,
  BOOK_NEW,
  PAGE_NEW,
  PAGE_OPEN,
  SETTINGS_LANG,
  SETTINGS_SKIN,
] as const

export type CommandId = (typeof COMMANDS)[number]["id"]
type CommandOf<Id extends CommandId> = Extract<(typeof COMMANDS)[number], { id: Id }>
type ArgOf<Id extends CommandId> = CommandOf<Id> extends CommandDef<infer A> ? A : never
// コマンドを呼ぶときに渡す引数の並び（引数の無いコマンドには何も渡さない）
export type CommandArgs<Id extends CommandId> = [ArgOf<Id>] extends [undefined] ? [] : [ArgOf<Id>]

const BY_ID = Object.fromEntries(COMMANDS.map(c => [c.id, c])) as Record<CommandId, CommandDef<never>>
export const commandDef = (id: CommandId): CommandDef<never> => BY_ID[id]

// そのステージから呼んだときの様子。ステージが無ければ null
export function commandContext(state: AppState, stageId: string): CommandContext | null {
  const stage = state.workspace.stages.find(s => s.id === stageId)
  if (!stage) return null
  const book = stage.opened ? (state.books[stage.opened.book] ?? null) : null
  return { stage, book, workspace: state.workspace, settings: state.settings }
}

export function isShown(state: AppState, stageId: string, id: CommandId): boolean {
  const ctx = commandContext(state, stageId)
  return ctx !== null && commandDef(id).when(ctx)
}

export function isEnabled(state: AppState, stageId: string, id: CommandId): boolean {
  const ctx = commandContext(state, stageId)
  const def = commandDef(id)
  return ctx !== null && def.when(ctx) && (def.enabled?.(ctx) ?? true)
}
