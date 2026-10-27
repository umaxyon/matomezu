// ビルトインプラグインだけが使う名前: ビルトインの印（キーの割り当てでビルトインを先に扱う。id の決まりはほかのプラグインと同じ）と、組み立てのときの確かめ（checks）を書くための型と問題の作り方。
// plugin-entry は出さないので、追加プラグインからは使えない
export { type CatalogCheck, defineBuiltin, problem } from "../store/plugin"
