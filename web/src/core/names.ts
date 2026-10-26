// プラグインが足す物の名前: 本当の id は「プラグインの id:名前」。名前は英小文字・数字・- だけで、先頭は英小文字。
// : の無い名前は土台の言葉（スロットの root、キーの範囲の stage、土台のテーマキーの accent など）
import { fail } from "./errors"

export const NAME = /^[a-z][a-z0-9-]*$/

// プラグイン P の名前 N の本当の id
export type Owned<P extends string, N extends string> = `${P}:${N}`

export const isName = (name: string): boolean => NAME.test(name)

// 名前に頭を付ける（名前が決まりの字でなければ誤り）
export function owned<const P extends string, const N extends string>(plugin: P, name: N): Owned<P, N> {
  if (!isName(name)) fail("E305", { plugin, name })
  return `${plugin}:${name}`
}

// 本当の id を持ち主（プラグインの id）と名前に分ける。: が無ければ土台の言葉（持ち主は null）
export function splitId(id: string): { owner: string | null; name: string } {
  const at = id.indexOf(":")
  return at < 0 ? { owner: null, name: id } : { owner: id.slice(0, at), name: id.slice(at + 1) }
}

// id がプラグイン plugin の物で、名前が決まりの字か
export const isOwnedBy = (plugin: string, id: string): boolean => {
  const { owner, name } = splitId(id)
  return owner === plugin && isName(name)
}
