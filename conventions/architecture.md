# 構造と層

## 層

`web/src` の下を、役割ごとの層に分ける。

| 層 | 役割 | 読んでよいもの |
|---|---|---|
| `core` | データの形・定義の型・core 台帳・純粋な関数。React も状態も持たない | `core`・zod |
| `store` | 状態（Zustand）・コマンド・ダイアログの表・プラグインの組み立て | `core`・`store`・zustand |
| `ui` | 画面の根と、プラグインが使う画面の口。画面に出る物は置かない | `core`・`store`・`ui`・React・zustand |
| `host-client` | ホストクライアント: 画面がホスト（常駐サーバー）と外の世界（通信・保存・URL・クリップボード）に頼む口 | `core`・`store`・`host-client`・zod |
| `engine` | ホストのエンジン: ホストの goja で、画面と同じアクションを行う入口 | `core`・`store`・`plugins`・`plugin-modules`・zod |
| `plugins` | 画面に出る物と、足していく定義の全部（ビルトインプラグイン） | 下の「プラグインの読み込み」 |
| `plugin-api` | プラグイン API: 追加プラグインとビルトインプラグインが使ってよい名前を、土台から出し直すだけの層（`index.ts` は React なし、`ui.ts` は見た目、`builtin.ts` はビルトインだけが使うビルトインの印 `defineBuiltin`（キーの割り当てでビルトインを先に扱う）と、組み立てのときの確かめ（`checks`）を書く `CatalogCheck`・`problem`） | `index.ts` は `core`・`store`、`ui.ts` は `ui`、`builtin.ts` は `store` |
| `plugin-entry` | プラグイン API の入口（`index.ts` が `matomezu`、`ui.ts` が `matomezu/ui`） | `index.ts` は `plugin-api`・zod（`z` を出し直す）・`plugins/base`（置く計算・文字と、base が拡張ポイントに書き足した物の型を出し直す）・`plugins/base/utils`（丸ごと出し直す）、`ui.ts` は `plugin-api/ui`・`plugins/base/ui`・`plugins/base/utils/ui`（丸ごと出し直す）。どちらもビルトインプラグインの一覧（`plugins`・`plugins/ui`）を型だけ読み、ビルトインが `core/catalog.ts` に書き足した物をいつも含める |
| `testing` | テストで組む入口（`matomezu/testing`） | `store`・`ui`・`plugins`（ビルトインプラグインの一覧） |
| `plugin-modules` | 追加プラグインが借りる、名前から実物を引く表（`index.ts` はホストのエンジン用、`ui.ts` は画面用） | `plugin-entry`・React |

- 土台（`core`・`store`・`ui`）は、プラグインを受け取って組み立て・動かす枠と、その枠が決める言葉（ステージ・ページ・置いたアイテムの外枠など）を持ち、具体的な機能は持たない。プラグインを読まない
- 土台の中に、プラグインしか使わない処理を置かない。置く計算（`plugins/base/place`）・文字の幅（`plugins/base/text`）・ツールボックスの並び（`plugins/base/toolbox`）は base が持つ。core のモジュールで、プラグインしか読んでいない物が無いことを `test/rules.test.ts` が見張る
- ステージの見え方の状態（道具のアイコン・ミニマップを開いているか）と、その開閉の決まり（紙が表示領域に収まるとミニマップを閉じるなど）は、ステージの言葉として土台に置く。土台自身も読む状態で、上の行の「プラグインしか使わない処理」には当たらない
- 土台のファイルの定義オブジェクトの型に書くのは、土台が読むフィールド・メソッドだけ（definitions の「拡張ポイント」）
- 入口（`plugin-entry`・`testing`）は外に名前を出すだけで、中のコードは入口を読まない
- 例外は `plugin-modules`。`plugin-entry` を読んでよいのは `plugin-modules` だけで、`plugin-modules` を読んでよいのはホストのエンジン（`engine/engine.ts`）と画面の入口（`main.tsx`）だけ
- 向きは 土台 → `plugin-api` → ビルトインプラグインと `plugin-entry` → `plugin-modules` の一方向。`plugin-api` はプラグインを読まない（base の部品を出し直すのは `plugin-entry`）
- プラグインのファイルは役割で見る。見た目（`.tsx` と `ui.ts`）は `ui` と同じものを読んでよく、ほかは `core`・`store`・zod だけ
- 上の行は base だけ。base 以外のビルトインプラグインは、`plugin-api` と base の入口だけを読み、土台を直に読まない。見た目は `plugin-api/ui`・`plugins/base/ui`・React も読み、見た目でないファイルは `plugin-api`・`plugins/base/index`・zod だけ。状態は `plugin-api/ui` のフック（plugins の「プラグインどうしの関係」）で読む。base はプラグイン API を読まない
- 見た目でないファイルは、見た目を読まない
- これらは `test/rules.test.ts` が見張る

## Go の側の層

`internal/` の下を、役割ごとのパッケージに分ける。読み込みの向きは一方向で、輪を作らない。

| パッケージ | 役割 | 読んでよいもの |
|---|---|---|
| `storage` | ブックと設定の保存（SQLite）。ブックの中身は解釈しない | なし |
| `plugin` | 追加プラグインのフォルダ（`matomezu.json`）を読み、Go に組み込んだ esbuild で変換する | なし |
| `engine` | ホストのエンジン: `engine.js` を goja で動かし、アクション・組み直し・ブックの確かめを行う | `plugin` |
| `server` | ホスト: HTTP の口・知らせ（SSE）・窓・ブックと設定をまとめる Hub | `engine`・`plugin`・`storage` |
| `mcp` | AI に matomezu を MCP 公開ツールとして渡すサーバー。ホストの AI の口（`/api/ai/...`）にだけ話す | なし |
| `home` | アプリのフォルダ（利用者ごとに 1 つ）。常駐が 1 つだけ立つための鍵と、立っている常駐のつなぎ方を置く | なし |
| `browser` | URL を既定のブラウザで開く | なし |
| `cmd/matomezu` | 実行ファイルの入口。上のパッケージを組み合わせる | 全部 |

- `mcp` は `server` を読まない。AI からの頼みは、人の画面と同じくホストの HTTP の口を通す
- これらは `test/rules.test.ts` が見張る

## 状態と外の世界

- 状態を変えるのは `store` の中だけ（ほかで `setState` を使わない）
- データを変える入口はアクションだけ（画面の操作も AI の操作も同じアクションを通る）
- 土台（core・store・ui）は、プラグインのアクションの id を名指さない。アクションを行ってからステージで開く、のような組み合わせは、そのアクションを持つプラグインが関数で出す（base の `addPageIn`・`createBookIn`）。行うだけなら `perform`
- 外の世界に触るのは `host-client` だけ。ホストが知らせた世界に入れ替える `receive` と、画面の場所（`core/address.ts`。開いているブックとページ・分割・倍率とずらす量）を当てはめる `locate` はインスタンスにあり、ホストクライアントだけが使う（`useActions` の操作には入れない）
- 画面の場所は、ホストクライアントが外（ブラウザの URL）と行き来させる（`host-client/location.ts`）。ブック・ページの移動と分割する・やめるは履歴に積み、ほかは書き換えるだけ。選択と道具は入れない
- ホスト（常駐サーバー。Go）は、アクションを `web/src/engine/engine.ts` から作った `internal/engine/engine.js` で行う（ホストのエンジン）
- ホストは、つながっている窓ごとに、見ているものとフォーカスの順を覚える。AI の `view` と `show` は、見ているものを知らせた窓のうち最後にフォーカスされた窓に向ける。最後にフォーカスされた窓（開いた直後の窓など）がまだ知らせていなければ、知らせが来るまで待つ（知らせが来たら起きる待ち方。上限 3 秒）。窓は見ているものを知らせるたびに番号を増やして付け、ホストは受けたものより古い番号の知らせを捨てる（届く順が入れ替わるため）

## error

- 投げる error は `core/errors.ts` の表に番号（E と 3 桁）と文を書き、`problem`・`fail` で作る。ほかで `new Error` を作らない
- 番号は一度付けたら変えず、消した番号も使い回さない。範囲は E0xx 定義の組の食い違い、E1xx 表に無いものを引いた・前提の状態が無い、E2xx 画面の組み立て、E3xx プラグイン
- 文は開発者向けの英語で、画面には出さない
- アクションが断る理由（`unknown`・`not-allowed` など）は結果であって error ではないので、表に入れない

## warning

- warning は、その組み合わせ（プラグイン・ブック・配置）である間ずっと成り立つ問題に使う。画面で見つかっても常駐で見つかっても、そうした問題は warning に落とす。一度きりの出来事（アクションを断られた・通信が切れた・描くときの例外）は warning にしない（断りはトーストかダイアログ、error は E、調べるための記録はログ）
- 止めるほどではない間違い（その行だけ効かない物）は、error にせず warning にする。warning は `core/warnings.ts` の表に番号（W と 3 桁）と文を書き、組み立てが機能台帳の `warnings` に集める（`{ code, plugin, params }`。plugin はどのプラグインの warning か）
- 番号の決まりと文は error と同じ（変えない・使い回さない・開発者向けの英語で画面には出さない）
- 追加プラグインの既定のキーが、ビルトインプラグインのキー（同じ範囲の同じキー）に負けたら W008、ほかの追加プラグインのキーとぶつかって両方使わなかったら W009 にする
- 常駐は読み込んだときに warning をログに書く。ビルトインプラグインは warning を出さない（テストが見張る）
- 読めないブック（タイプが無い W004・形に合わない W005・アイテムどうしの決まりを守らない W006）も warning にする。warning の `params` に `book`（id）と `title` を入れ、`plugin` はタイプの持ち主（タイプの id の頭）。確かめるのは core の `checkBooks` 1 つで、画面もホストも使う
- ホストは問題の一覧（定義の warning と読めないブック）をメモリに持つ。起動したときとプラグインが変わったときに全部のブックを、ブックが保存されたときにその 1 冊を確かめ直す（読めるかは今のプラグインで決まる値なので、DB には残さない）。ログに書き、AI の `list_books` は読めないブックに理由を添える。AI が読めないブックにアクションを行うと、「無い」（`no-book`）でなく `unreadable` とその理由で断る。ブックを丸ごと書く口（`PUT /api/books/{id}`）は、今の機能台帳で読めないブック（W004〜W006）を書かず、400 と理由を返す（一部のプラグインが無いだけの W007 は書く）
- ホストは warning を 1 か所に集める: 定義の warning・warning のあるブック・画面が見つけて知らせた warning（窓ごと。窓が離れたら消す）。ログには変わったときに書き、AI には `actions` の `warnings`（warning の 1 行ずつ）として見せる
- 画面だけで見つかる warning（配置で飛ばした物 W010・画面が組めずに外した追加プラグイン W011）は、ホストクライアントの `reportWarnings` でホストに知らせる（`POST /api/warnings`。前に知らせたものと入れ替え、つなぎ直すたびに知らせ直す）。ホストは番号と値だけを受け取り、文はエンジンが表から作る（表に無い番号は捨てる）
- 画面は読めないブックを捨てず、ブックを開くダイアログの一覧に、押せない行として理由を添えて出す。データには手を付けない
- 読めるが、機能台帳に無いアイテムや設定の項目を持つブックは、warning W007 にする（`plugin` は無い物の持ち主）。ホストはログと AI の `list_books` の `warning` に、画面はブックを開くダイアログの一覧の名前の横に印を出す
