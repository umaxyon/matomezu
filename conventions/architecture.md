# 構造と層

## 層

`web/src` の下を、役割ごとの層に分ける。

| 層 | 役割 | 読んでよいもの |
|---|---|---|
| `core` | データの形・定義の型・機能台帳の core の段・純粋な関数。React も状態も持たない | `core`・zod |
| `store` | 状態（Zustand）・コマンド・ダイアログの表・プラグインの組み立て | `core`・`store`・zustand |
| `ui` | 画面の根と、プラグインが使う画面の口。画面に出る物は置かない | `core`・`store`・`ui`・React・zustand |
| `host-client` | ホストクライアント: 画面がホスト（常駐サーバー）と外の世界（通信・保存・URL・クリップボード）に頼む口 | `core`・`store`・`host-client`・zod |
| `engine` | ホストのエンジン: ホストの goja で、画面と同じアクションを行う入口 | `core`・`store`・`plugins`・`plugin-modules`・zod |
| `plugins` | 画面に出る物と、足していく定義の全部（ビルトインプラグイン） | 下の「プラグインの読み込み」 |
| `plugin-api` | プラグイン API: 追加プラグインとビルトインプラグインが使ってよい名前を、土台から出し直すだけの層（`index.ts` は React なし、`ui.ts` は見た目、`builtin.ts` はビルトインだけが使うビルトインの印 `defineBuiltin`） | `index.ts` は `core`・`store`、`ui.ts` は `ui`、`builtin.ts` は `store` |
| `plugin-entry` | プラグイン API の入口（`index.ts` が `matomezu`、`ui.ts` が `matomezu/ui`） | `index.ts` は `plugin-api` と zod（`z` を出し直す）、`ui.ts` は `plugin-api/ui`・`plugins/base/ui` |
| `testing` | テストで組む入口（`matomezu/testing`） | `store`・`ui`・`plugins`（ビルトインプラグインの一覧） |
| `plugin-modules` | 追加プラグインが借りる、名前から実物を引く表（`index.ts` はホストのエンジン用、`ui.ts` は画面用） | `plugin-entry`・React |

- 土台（`core`・`store`・`ui`）は、プラグインを受け取って組み立て・動かす枠と、その枠が決める言葉（ステージ・ページ・置いたアイテムの外枠など）を持ち、具体的な機能は持たない。プラグインを読まない
- 【未実装】土台の中の、プラグインしか使っていない処理（`core/place`・`core/text`・`core/toolbox`）は base へ移し、道具の中身（select・reparent・hand と組 paper）は paper が定義する。core のモジュールで、プラグインしか読んでいない物が無いことを `test/rules.test.ts` が見張る
- 入口（`plugin-entry`・`testing`）は外に名前を出すだけで、中のコードは入口を読まない
- 例外は `plugin-modules`。`plugin-entry` を読んでよいのは `plugin-modules` だけで、`plugin-modules` を読んでよいのはホストのエンジン（`engine/engine.ts`）と画面の入口（`main.tsx`）だけ
- 向きは 土台 → `plugin-api` → ビルトインプラグインと `plugin-entry` → `plugin-modules` の一方向。`plugin-api` はプラグインを読まない（base の部品を出し直すのは `plugin-entry`）
- プラグインのファイルは役割で見る。見た目（`.tsx` と `ui.ts`）は `ui` と同じものを読んでよく、ほかは `core`・`store`・zod だけ
- 上の行は base だけ。base 以外のビルトインプラグインは、`plugin-api` と base の入口だけを読み、土台を直に読まない。見た目は `plugin-api/ui`・`plugins/base/ui`・React も読み、見た目でないファイルは `plugin-api`・`plugins/base/index`・zod だけ。状態を丸ごと読む 3 つのフック（`useMatomezuState`・`useCatalog`・`useUiCatalog`）だけは、見た目が `ui/store-context` から読む。base はプラグイン API を読まない
- 見た目でないファイルは、見た目を読まない
- これらは `test/rules.test.ts` が見張る

## 状態と外の世界

- 状態を変えるのは `store` の中だけ（ほかで `setState` を使わない）
- データを変える入口はアクションだけ（画面の操作も AI の操作も同じアクションを通る）
- 外の世界に触るのは `host-client` だけ
- ホスト（常駐サーバー。Go）は、アクションを `web/src/engine/engine.ts` から作った `internal/engine/engine.js` で行う（ホストのエンジン）

## 誤り

- 投げる誤りは `core/errors.ts` の表に番号（E と 3 桁）と文を書き、`problem`・`fail` で作る。ほかで `new Error` を作らない
- 番号は一度付けたら変えず、消した番号も使い回さない。範囲は E0xx 定義の組の食い違い、E1xx 表に無いものを引いた・前提の状態が無い、E2xx 画面の組み立て、E3xx プラグイン
- 文は開発者向けの英語で、画面には出さない
- アクションが断る理由（`unknown`・`not-allowed` など）は結果であって誤りではないので、表に入れない
