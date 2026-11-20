// 追加プラグインのどれかを組めずに起動を止める窓の、組めなかった物を集め、起動エラーの画面に出す物（訳 plugins-not-added）を作る。
// 原因は組めなかった追加プラグインの id と理由の文。直す手は、まだ外していない物をホストから外す（外せたらホストクライアントが窓を読み直す）。
// 途中で断られたら、断られた物から後ろが残る（それより前の物は外れている）
import type { MatomezuError } from "../core/errors"
import type { StartupCause, StartupError, StartupFixOutcome } from "../store/store"
import type { HostClient, Loaded } from "./client"

// 組めなかった追加プラグイン: 読み込めなかった物（loadFailed）と、use（インスタンスの use で足す）が E317 で断った物（details の E318 の順）。
// どれも組めれば空。use が E317 のほかを投げたら、そのまま投げる
export function pluginsNotAdded(loadFailed: Loaded["failed"], use: () => void): StartupCause[] {
  const causes = loadFailed.map(f => ({ name: f.id, reason: reasonOf(f.error) }))
  try {
    use()
  } catch (e) {
    if ((e as Partial<MatomezuError>).code !== "E317") throw e
    for (const d of (e as MatomezuError).details)
      causes.push({ name: String(d.params.plugin), reason: String(d.params.reason) })
  }
  return causes
}

// 原因 causes の起動エラーの画面に出す物。直す手は remove でホストから外す
export function pluginsNotAddedError(
  causes: readonly StartupCause[],
  remove: HostClient["removeScreenPlugins"],
): StartupError {
  let left = causes
  const fix = async (): Promise<StartupFixOutcome> => {
    try {
      const answer = await remove(left.map(c => c.name))
      if (answer.state === "removed") return { state: "fixed" }
      if (answer.state === "unreachable") return answer
      const from = left.findIndex(c => c.name === answer.id)
      if (from > 0) left = left.slice(from)
      return { state: "refused", reason: answer.reason, causes: left }
    } catch (e) {
      return { state: "refused", reason: reasonOf(e), causes: left }
    }
  }
  return { kind: "plugins-not-added", causes, fix }
}

// error を理由の文にする
export const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))
