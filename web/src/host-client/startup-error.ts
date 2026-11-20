// 追加プラグインのどれかを組めずに起動を止める窓の、組めなかった物を集め、起動エラーの画面に出す物（種類 plugins-not-added）を作る。
// 原因は組めなかった追加プラグインの id と理由の文。直す手は、出している物をホストから外す（もう外れている物はホストが飛ばす。外せたらホストクライアントが窓を読み直す）。
// 途中で断られたら、断られた物から後ろが残る（それより前の物は外れている）
import type { MatomezuError } from "../core/errors"
import type { StartupCause, StartupError, StartupFixOutcome } from "../store/state"
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
  const fix = async (shown: readonly StartupCause[]): Promise<StartupFixOutcome> => {
    try {
      const answer = await remove(shown.map(c => c.name))
      if (answer.state !== "refused") return answer.state === "removed" ? { state: "fixed" } : answer
      const from = shown.findIndex(c => c.name === answer.id)
      return { state: "refused", reason: answer.reason, causes: from < 0 ? shown : shown.slice(from) }
    } catch (e) {
      return { state: "refused", reason: reasonOf(e), causes: shown }
    }
  }
  return { kind: "plugins-not-added", causes, fix }
}

// error を理由の文にする
export const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))
