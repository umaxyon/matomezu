// ホスト無しで組むインスタンス（matomezu/testing のテスト）の書庫を、起動したときのホストと同じく整える
// （core/unreadable.ts の settleLibrary。足りないシステムフォルダを足し、名前の重なりに番号を付ける。ホストの在る窓は使わない）
import { namingOf } from "../core/entries"
import { BROKEN } from "../core/folders"
import { settleLibrary } from "../core/unreadable"
import { createMatomezu } from "./create"
import type { MatomezuInstance } from "./state"

// 足すシステムフォルダの行の id の頭（settled1, settled2, …）
const SETTLED_ID = "settled"

// インスタンス instance の書庫を整え、整えた世界を受け取らせる（変える物が無ければ・読めない物のフォルダの行が形に合わなければ何もしない）。
// 整えた結果を返す。足す行の id は settled1, settled2, … の順
export function settleIn(instance: Pick<MatomezuInstance, "state" | "catalog" | "receive">) {
  const { pages, folders, settings, annotations } = instance.state.getState()
  let n = 0
  const done = settleLibrary(instance.catalog.core, Object.values(pages), Object.values(folders), {
    naming: namingOf(instance.catalog.core, settings),
    now: new Date(0).toISOString(),
    newId: () => `${SETTLED_ID}${++n}`,
  })
  if (done === BROKEN) return done
  const { writes } = done
  const rows = (
    now: Readonly<Record<string, unknown>>,
    put: Readonly<Record<string, unknown>>,
    gone: readonly string[],
  ) => Object.values({ ...now, ...put }).filter(r => !gone.includes((r as { id: string }).id))
  if (Object.keys(writes.pages).length + Object.keys(writes.folders).length > 0)
    instance.receive(
      {
        pages: rows(pages, writes.pages, writes.removedPages),
        folders: rows(folders, writes.folders, writes.removedFolders),
        settings,
        annotations,
      },
      [],
    )
  return done
}

// createMatomezu と同じ物を作り、書庫を 1 度整える（matomezu/testing の createMatomezu）
export const createSettledMatomezu: typeof createMatomezu = (options => {
  const instance = createMatomezu(options)
  settleIn(instance)
  return instance
}) as typeof createMatomezu
