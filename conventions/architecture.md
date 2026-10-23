# 構造と層

## 層

`web/src` の下を、役割ごとの層に分ける。

| 層 | 役割 | 読んでよいもの |
|---|---|---|
| `core` | データの形・定義の型・登録表・純粋な関数。React も状態も持たない | `core`・zod |
| `store` | 状態（Zustand）・コマンド・ダイアログの表・プラグインの組み立て | `core`・`store`・zustand |
| `ui` | 画面の根と、プラグインが使う画面の口。画面に出る物は置かない | `core`・`store`・`ui`・React・zustand |
| `host` | 外の世界（通信・保存・URL・クリップボード）に触る口 | `core`・`store`・`host`・zod |
| `engine` | 常駐（Go の goja）で動くアクションの入口 | `core`・`store`・`plugins`・zod |
| `plugins` | 画面に出る物と、足していく定義の全部 | 下の「プラグインの読み込み」 |

- 土台（`core`・`store`・`ui`）はプラグインを読まない
- プラグインのファイルは役割で見る。見た目（`.tsx` と `ui.ts`）は `ui` と同じものを読んでよく、ほかは `core`・`store`・zod だけ
- 見た目でないファイルは、見た目を読まない
- これらは `test/rules.test.ts` が見張る

## 状態と外の世界

- 状態を変えるのは `store` の中だけ（ほかで `setState` を使わない）
- データを変える入口はアクションだけ（画面の操作も AI の操作も同じアクションを通る）
- 外の世界に触るのは `host` だけ
- 常駐の Go は、アクションを `web/src/engine/engine.ts` から作った `internal/engine/engine.js` で行う

## 誤り

- 投げる誤りは `core/errors.ts` の表に番号（E と 3 桁）と文を書き、`problem`・`fail` で作る。ほかで `new Error` を作らない
- 番号は一度付けたら変えず、消した番号も使い回さない。範囲は E0xx 定義の組の食い違い、E1xx 表に無いものを引いた・前提の状態が無い、E2xx 画面の組み立て、E3xx プラグイン
- 文は開発者向けの英語で、画面には出さない
- アクションが断る理由（`unknown`・`not-allowed` など）は結果であって誤りではないので、表に入れない
