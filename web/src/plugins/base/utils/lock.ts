// ロックを切り替えながら change を行う（設定のダイアログの確定）: 外すなら先に外し、change が断られたら掛け直す。掛けるなら change の後に掛ける。
// lock・unlock はロックを掛ける・外す、was は今ロック中か、want はロックしたいか。change が通ったかを返す
export function changeWithLock(
  was: boolean,
  want: boolean,
  lock: () => boolean,
  unlock: () => boolean,
  change: () => boolean,
): boolean {
  if (was && !want && !unlock()) return false
  if (!change()) {
    if (was && !want) lock()
    return false
  }
  if (!was && want) lock()
  return true
}
