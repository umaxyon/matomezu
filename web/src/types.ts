// データ形式の型。仕様は graph.ts 冒頭のコメントを参照。

import type { ClassAttr, ClassOp } from "./classbox";
import type { Head } from "./heads";

export type Size = "L" | "M" | "S";
// 並べ方の戦略の名前（model.ts の STRATEGIES の鍵）。パターンはページ単位（2026-10-12 ユーザー。docs/PATTERN-plan.md）:
// ページ（ワールド）に掛けるパターンは PagePattern、箱に書ける子の見せ方（内包パターンの持ち物）は BoxView
// master はマスターページ（ブックの一覧。D26 の段階 2。docs/UI-plan.md）のパターン。マスター用のファイルにだけ書け、新しいページの選択肢には出さない
// preview はリストの子が子を持つときの見せ方（子を描かず、中身の縮図を横に出す。D13）。リストが決めるのでデータには書けない
export type ChildView = "nest" | "tree" | "hidden" | "list" | "flow" | "master" | "preview";
export type PagePattern = "nest" | "tree" | "flow" | "master";
// ファイルの形式の種類（パターンごとに決まる。validate.ts の PAGE_FORMATS）。master はマスター用のファイル（窓が book でブックを指す）
export type BookFormat = "book" | "master";
// 道具箱（toolbox.ts）の道具: 形（その形を足す）、add（押した所に箱を足す追加モード）、マスターの操作（ブック追加・ブックをまたぐ追加削除・設定）
export type ToolKey = Shape | "add" | "newBook" | "crossMove" | "settings";
export type BoxView = "nest" | "list" | "hidden";
export type Overflow = "wrap" | "grow" | "clip";
export type Shape = "box" | "person" | "db" | "diamond" | "server" | "class" | "circle" | "stadium" | "hexagon"
  | "parallelogram" | "parallelogramAlt" | "trapezoid" | "trapezoidAlt"
  | "pc" | "factory" | "document" | "trash" | "robot" | "cat" | "heart" | "bulb" | "dog" | "forest" | "house" | "family";
export type TreeDirection = "down" | "up" | "left" | "right";
// リンクの箱の見せ方（link-box.ts）: 窓枠（上の帯が持ち手）/ 横に分ける（左の帯が持ち手）
export type LinkLook = "window" | "side";
// リストの子の縮図の位置（D13）: 右（既定）/ 左 / 出さない（子を持つ子は内包のまま描く。窓の行は右）
export type PreviewSide = "right" | "left" | "none";
export type Id = number | string;

export interface WorldData {
  width?: number;
  height?: number;
  overflow?: Exclude<Overflow, "grow">;
  background?: string; // 背景色。省略すると背景なし
  route?: Route;       // 線の通り方の既定（無ければ直線）
  theme?: string;      // テーマ（theme.ts）。ページの world に書けばそのページ。無ければ default（ページはブック全体の world のテーマ）
  kidSize?: Size;        // 中の箱のサイズ（一括で変えたサイズ。整列の間隔と、道具入れから足す箱のサイズに使う。フローチャートのとき）
  childView?: PagePattern; // ページのパターン（最上位の箱の並べ方。nest（既定）/ tree / flow。docs/PATTERN-plan.md）
  root?: Id;             // ツリーのページの根の箱（最上位の箱の id。childView が tree のとき必須）
  treeDirection?: TreeDirection; // ツリーのページで子を置く向き（既定は down）
  madeBy?: "user";     // 画面の「新しい図」で作ったブックの印（サーバーが書く。無ければ LLM が渡したもの。マスターで分けて並べる。D26）。ブック全体の world だけ
  paper?: string;      // 紙の型（validate.ts の PAPERS の名前。無ければ DEFAULT_PAPER。D33）。紙の制限を受けるパターン（STRATEGIES の paper）のページだけ効く
  title?: string;      // 図（ブック）の題名。タブの見出しに使う（無ければファイル名）。ブック全体の world だけ（ページの world には書かない）
  [key: string]: unknown;
}

export interface BoxData {
  id?: Id; // 省くと読み込み時に連番を振る
  caption?: string;
  body?: string;       // 本文（キャプションの下に出す長文。改行はそのまま。docs/BODY-plan.md）。普通の箱だけ（S サイズは出さない）
  bodyWidth?: number;  // 本文の幅（px。箱の幅として数える）。無ければ本文の中身に合わせる。サイズの最大幅は超えない
  bodyRule?: boolean;  // false ならキャプションと本文の間の線を引かない（無ければ引く）
  bodyLines?: number;  // 本文の最大行数（超えた分は … で切る）。無ければ制限なし
  userAdded?: boolean; // ユーザーが画面で足した（追加・移植）箱で、LLM がまだ持ち物として認識していない。消したあと完全に削除できる。
                       // LLM が会話で認識したら消す（docs/ADD-plan.md の 4 章）
  parent?: Id;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  theme?: string;      // テーマ（theme.ts）。この箱と子孫に効く。無ければ親を受け継ぐ
  size?: Size;
  shape?: Shape;
  kidSize?: Size;      // 中の箱のサイズ（一括で変えたサイズ。整列の間隔と、道具入れから足す箱のサイズに使う。フローチャートのとき）
  childView?: BoxView;  // 子の見せ方（内包パターンの持ち物: nest（既定）/ list / hidden。tree と flow はページのパターン）
  fill?: boolean;
  border?: boolean;
  overflow?: Overflow;
  page?: Id;             // 載っているページ（pages の id。最上位の箱だけに書く。無ければ最初のページ。docs/TABS-plan.md。2026-10-12 ユーザー: ページはブックの子）
  book?: string;         // マスターの窓: のぞく（押すと開く）ブックの id（サーバーの図の id）。マスター用のファイルにだけ書ける（D26）
  link?: Id;             // リンクの箱: のぞく（押すと開く）ページの id（pages の id。link-box.ts）。形・サイズ・子の見せ方は使わず、子を持てない
  linkLook?: LinkLook;   // リンクの箱の見せ方（無ければ window。リストの中では横に分ける）
  previewSide?: PreviewSide; // リストの子の縮図の位置（childView が list の箱で効く。無ければ right。D13）
  rowSize?: Size;        // リストの高さ（子の最小の高さ。S / M / L。無ければ M。D13）
  clip?: { x: number; y: number; w: number; h: number }; // リンクの箱の窓に映す範囲（のぞくページの座標の四角。無ければページ全体。収まらなければ左上から）
  abstract?: boolean;    // クラスの箱（shape: "class"）が抽象クラスか（docs/CLASS-plan.md）
  attrs?: ClassAttr[];   // クラスの箱の属性
  ops?: ClassOp[];       // クラスの箱の操作
  [key: string]: unknown; // 未知の項目は保存時にそのまま残す
}

export interface EdgeData {
  id?: Id;
  from: Id;
  to: Id;
  arrow?: Arrow; // 矢印（塗りの三角。無ければなし）
  startHead?: Head; // 始点の端の形（heads.ts。書けばその端に付く。arrow より優先。docs/HEADS-plan.md）
  endHead?: Head;   // 終点の端の形
  dash?: Dash;   // 線の模様（無ければ実線）
  route?: Route; // 線の通り方（無ければ図の既定。図にも無ければ直線）
  exit?: Axis;   // 以前の持ち方（折れ線の始点から出る向き）。読み込むと消す（2026-10-10、docs/EDGE-SPEC.md）
  enter?: Axis;  // 以前の持ち方（終点に入る向き）。読み込むと消す
  exitAt?: number;  // 始点の固定の位置（箱のふちを左上から時計回りに一周した割合。0〜1）。無ければ自由（自動）
  enterAt?: number; // 終点の固定の位置
  via?: number[]; // 手で直した折れ線の途中の区間の位置（両端が固定のときだけ使う。docs/ROUTE-plan.md）。無ければ自動
  caption?: string; // 線のキャプション（線の真ん中に出す。docs/EDGE-CAPTION-plan.md）。無ければ無し
  captionAt?: number;     // キャプションの位置: 線の長さに対する割合（0〜1）。無ければ真ん中（0.5）
  captionOffset?: number; // キャプションを線から離す px（始点から終点へ進む向きの左が正。±60 まで）。無ければ線の上
  bend?: number; // 以前の持ち方（Z 字の中棒の割合）。読み込むと消す
  fromMember?: string; // 始点がクラスの箱のとき、つなぐ属性か操作の名前（docs/CLASS-plan.md）。無ければクラスそのもの
  toMember?: string;   // 終点がクラスの箱のとき、つなぐ属性か操作の名前
  [key: string]: unknown;
}

// ブックのページ（2 枚目から。最初のページはファイルの最上位の world と、page の無い箱）。パターンはページ単位（docs/PATTERN-plan.md）
export interface PageData {
  id: Id;
  title?: string;     // ページの名前（タブの見出し。無ければ id）
  world?: WorldData;  // そのページのワールドの設定（パターン・テーマ・背景・線の通り方・ツリーの根と向き）
  [key: string]: unknown;
}

export interface Diagram {
  world?: WorldData;
  pages?: PageData[]; // 2 枚目からのページ。箱は page: id でそのページに載る
  nodes: BoxData[];
  edges?: (EdgeData | [Id, Id])[]; // [from, to] の形でも読める
  // 人が消したボックス（nodes と同じ形。parent は消す直前の親）。サイドバーの一覧から戻せる
  removed?: BoxData[];
  [key: string]: unknown;
}

// ---- 画面（サイドバー）向けの情報 ----

export interface Brief {
  id: string;
  caption: string;
}

export interface WorldInfo {
  kind: "world";
  id: null;
  caption: string;
  x: number;
  y: number;
  w: number;
  h: number;
  children: Brief[];
  links: [];
  overflow: Overflow;
  overflows: Overflow[];
  background: string | null;
  backgroundPaint: string | null; // 実際の背景の色（無ければテーマの背景、それも無ければ null）
  theme: string | null;  // このワールドに書いたテーマ（無ければ null）
  themeUnknown: string | null; // 書いてあるが知らないテーマの名前（標準として描いている）
  themeUsed: string;     // 効いているテーマ（ページなら、ブック全体のテーマを受け継ぐ）
  route: Route; // 線の通り方の既定
  title: string | null; // 図（ブック）の題名（どのページを見ていても、ブック全体の world のもの）
  childView: PagePattern;  // ページのパターン（最上位の箱の並べ方）
  views: PagePattern[];    // ページに掛けられるパターン
  viewsOff: PagePattern[]; // 掛けられないパターン（子を持つ箱が最上位にあれば、フローチャートは掛けられない）
  treeDirection: TreeDirection; // ツリーのページの向き
  canFlatten: boolean;     // 内包に変換できるか（ツリーのページ。戻せない。docs/PATTERN-plan.md）
  tools: { id: string | null; tools: ToolKey[]; size: Size } | null; // 道具箱（ワールドなら id は null。図の左端に出す）の道具と、足す箱のサイズ
  canAlign: boolean;     // 自動で整列できるか（決まった並べ方を持つ戦略で、子がある）
  kidSize: Size | null;  // 中の箱のサイズ（一括で変えたもの。無ければ null）。canAlign のときだけ選べる
}

export interface BoxInfo {
  kind: "group" | "box";
  id: string;
  caption: string;
  color: string;           // データの色（名前か色の値。書いていなければ空）。見た目の色は paint
  theme: string | null;    // この箱に書いたテーマ（無ければ null。親を受け継ぐ）
  themeUnknown: string | null; // 書いてあるが知らないテーマの名前（受け継いだテーマで描いている）
  themeUsed: string;       // 効いているテーマ
  paint: string;           // 実際に塗っている色（テーマと色の名前を解いたもの）
  palette: { name: string; label: string; color: string }[]; // 色の名前と、効いているテーマでの色
  fill: boolean;
  border: boolean;
  size: Size;
  shape: Shape;
  canShape: boolean; // 形を選べるか（内包しているグループは枠なので選べない）
  canClass: boolean; // クラスにできるか（子を持つ箱も、子を消す確認のうえでできる。リストの子とページの箱はできない。docs/CLASS-plan.md）
  body: string;      // 本文（無ければ空）。本文を持つ間は、形と S サイズを選べない（docs/BODY-plan.md）
  canBody: boolean;  // 本文を出せるか（形がボックスで、S でも切り詰めるでもなく、ページの箱でもない）
  bodyRule: boolean; // キャプションと本文の間に線を引くか
  bodyLines: number | null; // 本文の最大行数（null は制限なし）
  bodyWidth: number | null; // 本文の幅の指定（つまみで変えた幅。null は自動）
  inList: boolean;   // リストの子か（サイズ・形・子の見せ方を使わない。docs/LIST-plan.md）
  sizableChildren: number; // 大きさをそろえられる子の数（内包しているときだけ。2 以上でそろえられる）
  childView: BoxView;
  previewSide: PreviewSide; // リストの子の縮図の位置（childView が list のときに効く。D13）
  rowSize: Size;            // リストの高さ（子の最小の高さ。D13）
  framed: boolean; // 子を枠の中に入れて見せる箱か（内包・リスト。サイズは使わず、大きさは子の並びで決まる）
  tools: { id: string | null; tools: ToolKey[]; size: Size } | null; // 道具箱（ページのパターンのもの。ワールドなので id は null）と、足せる形、足す箱のサイズ
  inTree: boolean; // ツリーの中の箱か（ツリーのページの根の子孫。並びはツリーが決めるので、子の見せ方を使わない。docs/PATTERN-plan.md）
  treeRoot: boolean; // ツリーのページの根か（消せず、付け替えられない）
  link: { page: string; pageName: string; pattern: PagePattern; look: LinkLook; clip: { x: number; y: number; w: number; h: number } | null; book: string | null } | null; // リンクの箱（マスターの窓なら book にブックの id）なら、のぞくページと見せ方・窓に映す範囲（link-box.ts）。形・サイズ・子の見せ方は使わない
  parent: Brief | null;
  x: number;
  y: number;
  w: number;
  h: number;
  children: Brief[];
  links: (Brief & { edgeId: string })[];
  overflow: Overflow;
  overflows: Overflow[]; // 空なら中身の扱いを選べない
  abstract: boolean;     // クラスの箱が抽象クラスか（docs/CLASS-plan.md）
  attrs: ClassAttr[];    // クラスの箱の属性（クラスでなければ空）
  ops: ClassOp[];        // クラスの箱の操作
}

// 線の矢印。始点（from）の側、終点（to）の側、両方。無ければ矢印なし
export type Arrow = "start" | "end" | "both";
// 線の模様。無ければ実線（"solid"）。あとで点線（"dotted"）なども足せる
export type Dash = "solid" | "dashed";
// 線の通り方。直線か、90 度で折れる線（docs/EDGE-plan.md）
export type Route = "straight" | "elbow";
// 折れ線が箱のどの辺から出入りするか。左右の辺（"horizontal"）か、上下の辺（"vertical"）か。無ければ自動（箱の位置関係で決める）
export type Axis = "horizontal" | "vertical";
// 線でつなぐ 2 つの箱の並び。横に並ぶ（上下の範囲が重なる）、縦に並ぶ（左右の範囲が重なる）、斜め、重なっている
export type Arrangement = "side" | "stack" | "diagonal" | "overlap";

// 選んだ線の情報（サイドバーに出す）
export interface EdgeInfo {
  kind: "edge";
  id: string;
  self: boolean; // 自分に戻る線か（通り方・向き・端や折れ線の指定は使わない。docs/SELFLOOP-plan.md）
  from: Brief; // 始点の箱
  to: Brief;   // 終点の箱
  arrow: Arrow | null;
  startHead: Head | null; // 始点の端の形（arrow の塗りの三角も含めた、実際に描く形。無ければ null）
  endHead: Head | null;   // 終点の端の形
  dash: Dash;
  caption: string | null; // 線のキャプション
  captionMoved: boolean;   // キャプションの位置を手で動かしたか（captionAt か captionOffset がある）
  route: Route;        // 実際の通り方（線に無ければ図の既定）
  via: number[] | null; // 手で直した途中の区間の位置（直していなければ null）
  adjustable: boolean;  // ドラッグで動かせる途中の区間があるか
  endsMoved: boolean;   // 線の端の位置（exitAt / enterAt）を動かしてあるか
  aligned: boolean;     // 整列しても変わらないか（両端が辺の真ん中か、まっすぐ結ぶ位置にあり、手で直した区間も無い）
  arrangement: Arrangement; // 2 つの箱の並び（横か縦に並ぶときは、始点と終点の向きをそろえないと素直に引けない）
  captionHints: string[]; // キャプションの候補（フローチャートのひし形から出る線なら Yes / No。docs/PATTERN-plan.md の 3.7 章）
}

// ボックスかワールドの情報（graph.info が返す）。onSelect には線を選んだときの EdgeInfo も届く
export type NodeInfo = WorldInfo | BoxInfo;
export type Info = NodeInfo | EdgeInfo;

// サイドバーの一覧の 1 行。parent は親のキャプション（最上位なら null）
export interface ListItem {
  id: string;
  caption: string;
  color: string;
  parent: string | null;
  page: string | null; // 載っているページ（ページの箱の id。null は最初のページ）
  purgeable?: boolean; // 消したものの行で、完全に削除できる（消した子孫まで全部がユーザーの足した箱）
  pattern?: PagePattern; // 消したものの行で、載っていたページのパターン（パターンの違うページへは戻せない。docs/PATTERN-plan.md）
}

// サイドバーの一覧（ブック全体）: 表示中のボックスと、消したボックス（どちらもデータの並び順）、ブックのページ
export interface Items {
  live: ListItem[];
  removed: ListItem[];
  pages: { id: string | null; caption: string; current: boolean; pattern: PagePattern }[]; // 先頭は最初のページ
}

// update() で変えられる項目。caption と color は空にすると既定に戻る。background はワールドだけ（空で背景なし）。
// route はワールドだけ（線の通り方の既定。null か "elbow" で折れ線）。
// title はワールドだけ（図の題名。どのページから変えても、ブック全体の world に書く。空で消す）
// ページの題名と、ページのワールドの設定（graph.updatePage。ブックのダイアログ）
export interface PagePatch {
  title?: string | null;
  theme?: string | null;
  background?: string | null;
  route?: Route | null;
  treeDirection?: TreeDirection;
}

export interface Patch {
  title?: string | null;
  background?: string | null;
  theme?: string | null; // 箱かワールドのテーマ。null で消す（親を受け継ぐ）
  caption?: string | null;
  body?: string | null;      // 空か null で消す
  bodyWidth?: number | null; // null で中身に合わせる
  width?: number | null;     // 幅の指定（リストの幅など）。null で中身に合わせる
  bodyRule?: boolean | null; // false で仕切りの線を引かない。null で引く（既定）
  bodyLines?: number | null; // 本文の最大行数。null で制限なし
  color?: string | null;
  size?: Size;
  shape?: Shape;
  childView?: ChildView;         // 箱なら子の見せ方（BoxView）、ワールドならページのパターン（PagePattern）
  treeDirection?: TreeDirection; // ワールドだけ（ツリーのページの向き）
  linkLook?: LinkLook;           // リンクの箱の見せ方（link-box.ts）
  previewSide?: PreviewSide;     // リストの子の縮図の位置（D13。right は既定なのでデータから消す）
  rowSize?: Size;                // リストの高さ（D13。M は既定なのでデータから消す）
  clip?: { x: number; y: number; w: number; h: number } | null; // リンクの箱の窓に映す範囲（null でページ全体）
  fill?: boolean;
  border?: boolean;
  overflow?: Overflow;
  route?: Route | null;
}
