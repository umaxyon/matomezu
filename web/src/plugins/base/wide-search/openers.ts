// 横断検索の当たりの開き方を引く: 置いた開き方のうち、種類 kind を forKind に持つ最初の物（並びの先）。
// 種類の持ち主かどうかは台帳アセンブルが forKind で確かめる（E312）ので、引くのも forKind だけにする（wideSearchOpener だけ書いて forKind を書かない物は、引かれない）

// 引く物から読むのは、種類 forKind と、開き方の印 wideSearchOpener だけ
interface OpenerWidget<O> {
  forKind?: string
  wideSearchOpener?: O
}

export function openerOf<O>(
  placed: readonly string[],
  widgets: ReadonlyMap<string, OpenerWidget<O>>,
  kind: string,
): O | undefined {
  for (const id of placed) {
    const w = widgets.get(id)
    if (w?.forKind === kind && w.wideSearchOpener) return w.wideSearchOpener
  }
  return undefined
}
