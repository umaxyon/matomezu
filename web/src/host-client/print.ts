// 印刷: 画面が印刷を頼んだら（インスタンスの printRequests が増えたら）、ブラウザの印刷ダイアログを開く（PDF もそこから保存する）。
// 刷る物は画面が決める（印刷のときだけ出す物を描いておく）。テストでは刷る口を差し替える
import type { MatomezuInstance } from "../store/store"

export interface Printer {
  print(): void
}

export const browserPrinter: Printer = { print: () => window.print() }

// 印刷を頼まれるたびに刷る。やめる関数を返す
export function followPrint(instance: Pick<MatomezuInstance, "state">, printer: Printer = browserPrinter): () => void {
  let seen = instance.state.getState().printRequests
  return instance.state.subscribe(state => {
    if (state.printRequests === seen) return
    seen = state.printRequests
    printer.print()
  })
}
