// base のステージの画面の状態の 1 項目の持ち方: base の機能はステージの画面の状態を 1 つの物に分け合い、それぞれ自分の項目名 key の値だけを読み書きする。
// read は項目の値（無ければ fallback）、write は項目を value に差し替えた状態（gone(value) なら項目を消す。ほかの項目はそのまま）
export interface StageItem<T> {
  read(state: unknown): T
  write(state: unknown, value: T): Record<string, unknown>
}

export function stageItem<T>(key: string, fallback: T, gone: (value: T) => boolean): StageItem<T> {
  return {
    read: state => ((state as Record<string, unknown> | undefined)?.[key] as T | undefined) ?? fallback,
    write: (state, value) => {
      const { [key]: _, ...rest } = (state as Record<string, unknown> | undefined) ?? {}
      return gone(value) ? rest : { ...rest, [key]: value }
    },
  }
}

// 無ければ null の項目（null で消す）
export const nullableItem = <T>(key: string): StageItem<T | null> => stageItem<T | null>(key, null, v => v === null)
