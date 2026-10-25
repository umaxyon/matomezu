# 言葉

コード・コメント・規約・会話で使う言葉。ここに無い言い方で、ここにある物を呼ばない。

## matomezu の形

| 言葉 | 意味 |
|---|---|
| matomezu | 製品全体 |
| 土台 | 層の `core`・`store`・`ui`。プラグインを受け取って組み立て・動かす枠と、その枠が決める言葉（ステージ・ページ・置いたアイテムの外枠など）。具体的な機能は持たない。base は含めない |
| core | フォルダ `web/src/core`。土台の層の 1 つ（データの形・定義の型・機能台帳の core の段・純粋な関数） |
| base | プラグイン `plugins/base`（`@matomezu/base`）。ビルトインプラグインの 1 つで、ほかのプラグインが読んでよい例外。「土台」と呼ばない |
| インスタンス | `createMatomezu` が生成した `AppStore` のインスタンス。機能台帳（core と store の段）・組み立てで決まる値（`home`・`autoSkin`）・状態・操作を持つ、動いている matomezu 1 つ分。画面に 1 つ、テストごとに 1 つ |
| ホスト | 常駐サーバーそのもの（Go。`internal/`）。「常駐」はホストと同じ意味 |
| ホストクライアント | 画面の中で、ホストと外の世界に頼む口（`web/src/host-client`。`HostClient`・`serverClient`・`memoryClient`・`openClient`） |
| ホストのエンジン | `web/src/engine`。ホストの goja で、画面と同じアクションを行う入口（`internal/engine/engine.js` にまとめて埋め込む） |

## プラグイン

| 言葉 | 意味 |
|---|---|
| プラグイン | 定義の束。登録の単位。「部品」は別名 |
| ビルトインプラグイン | matomezu に同梱され、`BUILTIN` に並ぶプラグイン（base・master・paper・box・list・line・drawing） |
| 追加プラグイン | インストールされたプラグイン。開発中に開発者プロジェクトを結んだ物も、完成品も同じ。作り手の属性は持たない。プラグイン API だけを読み、定義の id の頭に自分の id を付ける |
| 開発者プロジェクト | 追加プラグインを作るプロジェクト。matomezu の中（このリポジトリ）は含まない。利用者のローカルの Claude が作るときの作業の場所も同じ |
| プラグイン API | 追加プラグインが使ってよい名前と型の約束。`web/src/plugin-api` に集め、実装は動いている matomezu が渡す。入口は `matomezu`・`matomezu/ui`・`matomezu/catalog` |
| `plugin-modules` | 追加プラグインが借りる、名前から実物を引く表（`web/src/plugin-modules`）。キーは import の名前（`matomezu`・`matomezu/ui`・`react` など）、値は動いている matomezu が持つ実物。ホストのエンジンと画面が、追加プラグインを動かす前に渡す |
| `matomezu/testing` | 開発者プロジェクトのテストで、ビルトインプラグインと自分のプラグインで matomezu を丸ごと組む入口（`web/src/testing`）。テストのプロセスの中で組み、ホストは使わない。プラグイン API に含めない |

## 機能台帳

| 言葉 | 意味 |
|---|---|
| 機能台帳（catalog） | 部品が足せる定義の種類ごとに、足された定義を並べた全体。利用者に価値を届ける最小の単位の全部 |
| 機能台帳の型の側 | `core/catalog.ts`（外からは `matomezu/catalog`）。種類ごとの表に、プラグインが id と定義の型を書き足す |
| core の段 | `CoreCatalog`（`core/core-catalog.ts`）。画面とホストが共に使う定義（ブックのタイプ・アイテム・アクション・設定の項目・見せ方・テーマ・紙・スキン・文言・言語） |
| store の段 | `StoreCatalog`。画面だけが使う、React の無い定義（コマンド・ダイアログ・キーの既定の割り当て） |
| ui の段 | `UiCatalog`。画面だけが使う、React の定義（ビュー・ウィジェット・コマンドのアイコン・差し替え）。実体は `MatomezuProvider` が持つ |
| AI 向けの機能台帳（AI catalog） | 機能台帳から AI に見せる種類を絞って書き出した物（ホストのエンジンの `aiCatalog()`・`/api/ai/catalog`・MCP の道具の元） |

## 画面

| 言葉 | 意味 |
|---|---|
| コンポーネント | 画面の React のコンポーネント。部品（プラグイン）とは別の物 |
| ビュー | コンポーネントのうち、定義に結んで描く物（`XView`・`presentationViews`・`dialogViews`・`settingViews` など） |
| スロット | ウィジェットを差し込む場所の id。ウィジェットの中にも作れ、描くプラグインが自分の名前で足す（例: `stage.top`）。いちばん外の 1 つだけが `root` |
| キーの範囲 | キーの割り当てが効く場面の名前（`KeyScopeTable`）。土台の `stage`・`dialog`・`menu`・`global` と、プラグインが自分の id を頭に付けて足す範囲。`global` は、ダイアログもメニューも開いていないとき、`stage` の次に探す |

## 使わない言葉

アプリ・ユーザーアプリ・ユーザープラグイン・SDK・実行エンジン・核・コア・中の部品・外のプラグイン・型の表・登録表・目録・画面パーツ・画面コンポーネント・ビルトイン部品
