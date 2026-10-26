// ビルトインプラグインだけが使う名前: ビルトインの印（キーの割り当てでビルトインを先に扱う。id の決まりはほかのプラグインと同じ）。plugin-entry は出さないので、追加プラグインからは使えない
export { defineBuiltin } from "../store/plugin"
