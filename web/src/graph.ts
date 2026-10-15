/*
 * JSON から「線でつながったボックスの図」を描く。
 * - 全体は見えない「ワールド」ボックスの中にあり、ボックスはさらに子を持てる。
 * - 子の見せ方は「内包」（親の中に入れる）「ツリー」（組織図のように下へぶら下げる）「非表示」から選ぶ。
 * - ボックスはドラッグで移動でき、同じ階層のボックス同士は重ならない。
 * - 線は同じ階層（同じ親を持つボックス同士）でだけ引ける。
 * - 選択モードで、選んでいない箱にポインタを乗せると四辺に〇が出て、〇から引ける相手までドラッグすると線が引かれる（docs/EDGE-TOOL-plan.md）。
 * - 選択モード（モードの名前は "move"）では、クリックしたボックス（背景ならワールド）か線が選択され、onSelect で知らせる。
 *   ボックスはそのままドラッグで動かせる。線を消すのは removeEdge（サイドバーのボタン）。
 *
 * 使い方:
 *   const graph = createGraph(document.getElementById('stage'), data, { onChange, onSelect });
 *   graph.toJSON();              // 現在の状態を反映したデータ
 *   graph.load(data);            // 別のデータで描き直す（検証エラーなら例外を投げ、表示はそのまま残る）。履歴は空にする
 *   graph.load(data, { keepHistory: true, version }); // 外部（LLM）の変更として描き直す（はみ出しの調整はしない。開いたときに移した箱は、位置が変わらなければ移した先のまま）。ユーザーの履歴には積まず、
 *                                            // 変えた箱が見えたら（認知）その時刻の位置に差し込む（D31。history.ts）。見たら onLLMSeen で version を知らせる
 *   graph.undo(); graph.redo();  // ユーザーの操作を、差分で今の状態に戻す・進める（LLM の変更は残る。戻したら onChange で知らせる）。
 *                                // 戻した変更が見ていないページのものなら、そのページへ切り替える
 *   graph.select(id);            // 選択する（null はワールド）
 *   graph.reveal(id);            // 見えている範囲の外なら、図をスクロールして真ん中に持ってくる（非表示の親の中なら、見えている祖先）
 *   graph.selectEdge(id);        // 線を選択する（onSelect には線の情報 EdgeInfo が届く）
 *   graph.updateEdge(id, patch); // 線を変更する（caption は空か null で消す、arrow は null で矢印なし、dash は null か "solid" で実線、
 *                                //   route は "straight" / "elbow"。図の既定と同じなら線の側からは消す。via は null で自動に戻す）
 *   graph.alignEdge(id);         // 線の両端を、今の形での一番よい位置に固定する（整列。辺の真ん中か、まっすぐ結べる位置）
 *   graph.removeEdge(id);        // 線を消す（選択モードで線を選んで Delete キーでも。toolbar.ts）
 *   graph.link(from, to);        // 今のページの箱 from から to へ線を引く（終点に矢印。同じ箱なら自分に戻る線）。引けなければ false
 *   graph.info(id);              // ボックス（null はワールド）の情報
 *   graph.update(id, patch);     // 変更する（caption, color, size, childView, fill, border, overflow, linkLook, clip, previewSide, rowSize）。size は大きさの指定も外す
 *   graph.pageScene(page);       // ページの縮図のもと（preview-art.ts の Scene。描いたことのあるページはその配置、無ければデータの位置と既定の大きさで近似）
 *   graph.dragging();            // ドラッグ中か（外部からの変更を、手を離すまで待つのに使う）
 *   graph.setMode(mode);         // ツールのモード: "move"（選択。ドラッグで移動）/ "reparent"（親子の付け替え）/ "remove"（削除）/ "add"（追加）
 *   graph.onModeChange(fn);      // モードが変わったら知らせる（一覧から戻したときに移動モードへ切り替えるなど、図の側で変えたときも）
 *   graph.reparent(id, parentId, at); // id を parentId（null は最上位）の子にする。at は最上位へ移すときの位置
 *   graph.fitChildren(id, "width" | "height" | "both"); // 内包している子の大きさを、一番大きい子にそろえる
 *   graph.remove(id);            // 子孫ごと消す（removed へ移す。つながっていた線は捨てる）
 *   graph.restore(id, parentId, at); // 消したボックスを子孫ごと parentId（null は最上位）の子に戻す。at は親の中での位置
 *   graph.items();               // サイドバーの一覧（表示中と、消したもの）
 *   graph.geometry();            // 見えているボックスと線の位置、表示領域の大きさ（配置の要約 report.ts に渡す）
 *   graph.setPage(id);           // 描くページを変える（pages のページの id。null は最初のページ）。履歴はそのまま
 *   graph.page();                // 描いているページ
 *   graph.pages();               // ブックのページ（2 枚目から。ページの id と名前）
 *   graph.paste(copy, parentId, at, from); // ほかのブックの箱（pages.ts の copySubtree）を、parentId の子にコピーする（移植）
 *   graph.purge(id);             // 消したボックスを子孫ごと完全に削除する（ユーザーが足した箱 userAdded だけ。docs/ADD-plan.md）
 *   graph.add(req, fields);      // 新しい箱を足す（req は追加モードで押した所。onAddRequest で届く。docs/ADD-plan.md）
 *   graph.destroy();
 *
 * データ形式:
 *   {
 *     "world": { "width": 1600, "height": 900 },
 *     "nodes": [
 *       { "id": 1, "caption": "グループ", "color": "#3b82f6", "childView": "list" },
 *       { "id": 2, "caption": "A", "parent": 1, "size": "M" },
 *       { "id": 3, "caption": "B", "color": "#ef4444", "x": 300, "y": 80,
 *         "width": 120, "height": 64, "fill": false, "border": true, "overflow": "clip" }
 *     ],
 *     "edges": [
 *       { "id": "e1", "from": 1, "to": 3, "arrow": "end" }   // [1, 3] の形でも読める
 *     ]
 *   }
 *   - world は省略できる。width, height が無ければ、表示領域と置かれているボックスの範囲の大きい方になる。
 *     background で背景色を付けられる（文字や線の色は、背景の明るさに合わせて切り替わる）。
 *     title は図（ブック）の題名で、タブの見出しに使う（無ければファイル名）。ブック全体の world にだけ書く（ページを見ていても）。
 *   - ノードの項目はすべて省略できる。color の既定は白。
 *   - id は連番の数値を使う。省くと読み込み時に、既存の数値 id の続きから連番を振る。
 *   - parent に親ボックスの id を書くと、その子になる。x, y は親の左上からの位置（内包のときに使う）。
 *   - 位置が無いボックスは自動で配置する。
 *   - shape はボックスの形: "box"（既定）/ "person"（スティックマン。キャプションは足元）/ "db"（円柱の絵。キャプションは足元）/ "diamond"（ひし形）/ "server"（タワー型のサーバーの絵。キャプションは足元）/ "pc"・"factory"・"document"・"trash"・"robot"・"cat"・"heart"・"bulb"・"dog"・"forest"・"house"・"family"（パソコン・工場・書類・ゴミ箱・ロボット・猫の顔・ハート・電球・犬の顔・森・家・家族の絵。キャプションは足元。絵は shape-art.ts）/
 *     "circle"（円）/ "stadium"（角丸）。"hexagon"（六角形）/ "parallelogram"・"parallelogramAlt"（平行四辺形）/ "trapezoid"・"trapezoidAlt"（台形）。
 *     形はどこでも同じに使える（2026-10-12 ユーザー）。平行四辺形と台形はツリーの中ではボックスで見せる（形の表の placed。データは残す）。
 *     子を内包しているボックスは枠なので、形は使わない（ツリーや非表示で見せているときは使う）。
 *     "class"（UML のクラス。docs/CLASS-plan.md）は、キャプションがクラス名で、abstract（true で抽象クラス）、
 *     attrs（属性 [{ name, type?, access?, static? }]）、ops（操作 [{ name, params?, type?, access?, static?, abstract? }]）を持つ。
 *     access は public / private / protected / package。クラスは子を持たない。線は fromMember / toMember（属性か操作の名前）で行につなげる。
 *   - size はボックスの大きさの段階:
 *       "L" … 幅は文字に合わせて 120〜400。越えると折り返す
 *       "M" … 既定。幅は文字に合わせて 120〜240。越えると折り返す
 *       "S" … 小さい文字。幅は 64〜96、高さは固定。10 文字まで（超えると … で切る）
 *     幅の範囲は validate.ts の SIZES で決めている。width を書けば、その幅で折り返す。
 *     サイズが効くのは見た目が葉の箱（子の無い箱、ツリーの親の本体、非表示）だけ。内包・リストの箱では使わない（docs/SIZE-plan.md）。
 *   - 箱の childView は子の見せ方（内包パターンの持ち物）: "nest"（内包、既定）/ "hidden"（非表示、▼ で子がいることを示す）/
 *     "list"（リスト。子を縦に並べて幅をそろえる。子のサイズ・形は使わない。docs/LIST-plan.md）。
 *     リストの子が子を持つと、孫は描かずに中身の縮図を横に出す（並べ方の名前は "preview"。データには書けない。D13）。
 *     位置はリストの previewSide: "right"（既定）/ "left" / "none"（縮図を出さない。子を持つ子は非表示と同じく文字だけの行と ▼）。
 *     リストの中の窓も横に分ける見せ方になり、none なら縮図の代わりに開くアイコンを出す。
 *     リストの子は箱のサイズ（L / M / S）を使わず、高さはリストの rowSize（S: アイコンの行 / M: 普通 / L: 縮図の行）に、
 *     中身が収まる限り合わせる（収まらない行だけ高くなる）
 *   - ページのパターンは world.childView（2026-10-12 ユーザー。パターンはページ単位。docs/PATTERN-plan.md）:
 *     "nest"（内包、既定）/ "tree"（ツリー。world.root の箱を根に、その子孫全体を何段でも木に並べる。中の箱は手で動かせず、根をつかむと木全体が動く。
 *     根以外の最上位の箱は葉で、自由に置く。向きは world.treeDirection: "down"（既定）/ "up" / "left" / "right"）/
 *     "flow"（フローチャート。内包と同じく自由に置く。箱は子を持てない。docs/PATTERN-plan.md の 3.7 章。
 *     どの箱にも位置が無ければ、本筋を中央にそろえて整列して置く。layout/flow-align.ts。graph.autoAlign(null) でも同じ並べ方）。
 *     ツリーを内包に変換（graph.flattenTree(null)）すると、親子のつながりを線で引き直す。戻せない
 *     "master"（マスター。ブックの一覧のページ。内包と同じに置き、窓（book: ブックの id）でブックを並べる。マスター用のファイルの最初のページにだけ書け、
 *     新しいページの選択肢には出さない。ファイルの形式は validate.ts の PAGE_FORMATS。D26 の段階 2）
 *   - fill: false で塗りつぶし無し（透明）、border で枠線の有無（既定は内包で子を持つボックスだけ枠線あり）。
 *   - overflow は文字のボックスの中身の扱い:
 *       "wrap" … 幅に合わせて折り返す（既定）
 *       "clip" … 1 行にし、サイズの最大（width があればその幅）を幅の上限にする（文字が少なければ縮み、多ければ … で切る）
 *     S サイズでは使わない。子を持つボックスはつねに子に合わせて伸び、overflow・width・height を使わない
 *     （データにあっても無視する。図が幅を決め、文字は図の都合で折り返す。docs/SIZE-plan.md）。ワールドの overflow も使わない。
 *   - 線は同じ parent を持つボックス同士（同じページの最上位同士を含む）でだけ引ける。ページをまたぐ関連は、リンクの箱へ線を引く。
 *     ツリーの中の箱どうしの線は描かない（データには残り、内包に変換すると表示される）。
 *   - 線の id が無ければ自動で振る。toJSON() は線を常に { id, from, to } の形で返す。
 *   - arrow は線の矢印: "end"（終点 to の側）/ "start"（始点 from の側）/ "both"。無ければ矢印なし。
 *   - dash は線の模様: "dashed"（破線）。無ければ（"solid"）実線。
 *   - route は線の通り方: "straight"（直線）/ "elbow"（90 度で折れる線）。無ければ world.route（図の既定）、それも無ければ折れ線（2026-10-11 に直線から変えた）。
 *   - exit / enter は折れ線の向きの指定: 始点から出る向き・終点に入る向き。"horizontal"（左右の辺）/ "vertical"（上下の辺）。無ければ自動。
 *     横か縦に並ぶ箱どうしは、両端の向きがそろうときだけ素直に引ける（横に並ぶなら、左右ならまっすぐ、上下ならコの字）。
 *     そろわない指定は斜めのときだけ効き、箱を動かして横か縦に並んだら、指定を両方とも消して自動に戻す。直線には効かない
 *   - startHead / endHead は線の端の形（docs/HEADS-plan.md）: "arrow"（塗りの三角）/ "open" / "hollow" / "diamond" / "hollowDiamond" /
 *     "one" / "many" / "zeroOne" / "zeroMany" / "oneMany"（ER 図）。書けばその端に付き、arrow より優先する。
 *   - exitAt / enterAt は線の両端の位置（割合 0〜1）。直線は相手に向いた側の辺を角から角までたどった割合（横か縦に並ぶなら向いた 1 辺。routing.ts の borderPath）、
 *     折れ線は出入りする辺の上の割合（左右の辺は上から、上下の辺は左から。routing.ts の sidePath）。
 *     選択モードで線を選ぶと両端に丸が出て、ドラッグで辺に沿って動かせる。基準（直線は相手の向き、折れ線は出入りする辺）が変わるか、箱が重なったら消えて自動に戻る
 *   - via は手で直した折れ線の途中の区間の位置の並び（docs/ROUTE-plan.md、routing.ts）。選択モードで途中の区間をドラッグすると、
 *     そのときの形（exit / enter / via）を書き込む。引けるあいだはその形を保ち、引けなくなったら via と向きの指定を消して自動に戻す。
 *     無ければ自動（Z 字の中棒は真ん中か、ほかの箱を避けた位置）。以前の bend（中棒の割合）は、読み込むと via に移す。
 *     ページの既定は、そのページの world.route。docs/EDGE-plan.md
 *   - link はリンクの箱（link-box.ts。docs/PATTERN-plan.md）: のぞく（窓を押すと開く）ページの id。形・サイズ・子の見せ方は使わず、子を持てない。
 *     linkLook は見せ方: "window"（窓枠。上の帯が持ち手。既定）/ "side"（横に分ける。左の帯が持ち手）。
 *     窓にはそのページの縮図（四角と線だけ。preview-art.ts）が映る。ページ全体が収まる縮尺で、DEFAULTS.previewMinScale より縮めずに切り取る。
 *     clip: { x, y, w, h }（そのページの座標の四角）を書けば、その範囲を映す（編集ダイアログで選ぶ）
 *   - removed は人が消したボックス（nodes と同じ形。parent は消す直前の親）。id は nodes と重ねない。
 *     消したボックスにつながっていた線は残さない（戻しても線は戻らない）。docs/DELETE-plan.md
 *   - ページ（docs/TABS-plan.md。2026-10-12 ユーザー: ページはブックの子）: 2 枚目からのページは pages: [{ id, title, world }] に並び、
 *     最上位の箱は page: ページの id でそのページに載る（無ければ最初のページ）。中の箱は親と同じページ。
 *     ページのワールドの設定（パターン・テーマ・背景など）は、そのページの world に持つ（ファイルの world と同じ形）。
 *     箱はパターンの違うページへは移せない（付け替え・戻す・移植は断って onEvent の crossPattern で知らせる）
 *
 * ブックとページ（docs/TABS-plan.md 3.2）:
 *   ファイル全体（ブック）のデータを持ち、描くのは 1 ページだけ。描くページの箱だけを Box にし、
 *   そのページの最上位の箱がワールドに並ぶ。配置と描画は、今のページだけを見ている。
 *   ほかのページの箱と線はデータ（source）にそのまま残し、保存のときに書き戻す。
 */

import { GRAPH_CSS, GRAPH_STYLE_ID } from "./graph-style";
import { SVGNS, injectStyle, keyOf } from "./dom";
import { createHistory, type HistoryState, type Op } from "./history";
import { touchedOf } from "./diff";
import { t } from "./i18n";
import { type AddRequest, createInteraction, type Mode } from "./interaction";
import { createDrag } from "./layout/drag";
import { createLayout } from "./layout/layout";
import { BODY_MIN_W } from "./layout/node-kinds";
import { SCENES } from "./layout/policy";
import { type MeasureText, browserMeasure, createTextMeasurer } from "./layout/measure";
import { DEFAULT_SHAPE, shapeDef } from "./shapes";
import {
  type Box, type Container, type Edge, type World, abilitiesOf, absPos, ancestors, arrowOf, bodyLinesOf, bodyWidthOf, bodyWrapW, borderOf,
  canBody, captionOf, dashOf, dataSizeOf, descendants, displayCaption, fillOf, inList, inNest, isHidden, isNesting, other,
  overflowOf, inTreeOf, isLinkBox, listPreviewOf, previewSideOf, rowSizeOf, isTreeRoot, linkBookOf, linkLookOf, linkPageOf, clipOf, lookOf, rootBoxOf, STRATEGIES, acceptsKid, worldViewOf, DEFAULT_VIEW, DEFAULT_ROUTE, kidSizeOf, captionHintsOf, placesFreely, routeDefaultOf, routeOf, setOrDelete, setSpec, shapeOf, sizeOf, treeDirOf, treeLinesOf, viaOf, viewOf,
} from "./model";
import { type ClassEdit, type Place, type Pos, addBox, applyClassEdit, canPurge, moveSubtree, pasteSubtree, purgeRemoved, removeSubtree, restoreSubtree } from "./edits";
import { attrsOf, opsOf } from "./classbox";
import { type Head, headOf, isHead } from "./heads";
import { type Subtree, captionOfData, dataPaint, liveItems, pageData, pageMembers, pageNameOf, pageOf, pageWorld, pagesOf, patternOf, removedPageOf, subtreeIds } from "./pages";
import { CAPTION_OFFSET_MAX, createRenderer } from "./render";
import { type RouteFix, type RouteInput, alignedEnds, framedAround, isAligned, passes, perimeterAt, pickCandidate, route, routeCandidates, vertexOf } from "./routing";
import { type Rect, nearestAt, pointAt } from "./geom";
import { perimeter } from "./selfloop";
import { DEFAULT_THEME, PALETTE, PALETTE_LABELS, isTheme, paintFor, themeById, type Theme } from "./theme";
import { createEdgeDrag } from "./edge-drag";
import type { GraphEvent } from "./notices";
import type { GeoEdge, Geometry } from "./report";
import type { Arrow, BoxData, BoxView, Dash, Route, BoxInfo, Diagram, EdgeData, EdgeInfo, Id, Info, Items, LinkLook, NodeInfo, ListItem, PageData, PagePattern, PagePatch, Patch, Shape, Size, ToolKey, WorldData } from "./types";
import { ARROWS, DASHES, DEFAULT_PAPER, GROUP_MIN, PAGE_PATTERNS, PAPERS, type PaperName, ROUTES, SIZES, assignIds, checkSettings, isPaper, isPattern, normalizeEdge, validate } from "./validate";
import { DEFAULT_LINK_LOOK, type Rect as ClipRect, isRect } from "./link-box";
import { type Scene, sceneOf } from "./preview-art";
import { EMPTY_SCENE, dataScene } from "./data-scene";

export const DEFAULTS = {
  color: "#ffffff",
  gap: 8,         // 同じ階層のボックス同士の最小間隔（全世界のルール）。並べ方の戦略がローカルなルールで上書きできる（model.ts の STRATEGIES の kidGap）
  linkGap: 32,    // 線でつながった 2 つの箱の最小間隔（線が見えるように。2026-10-12 ユーザー）
  captionGap: 40, // その線にキャプションがあるときの最小間隔（キャプション 1 行と上下の余白が入る）
  padding: 12,   // 内包するボックスの内側の余白
  header: 30,    // 内包するボックスのキャプション欄の高さ
  treeGapX: 24,  // ツリーで横に並ぶ子の間隔
  treeGapY: 40,  // ツリーの親と子の縦の間隔
  rootAt: { x: 40, y: 40 }, // ツリーのページを作るときに置く根の箱の位置（addPage）
  previewMinScale: 0.15, // リンクの箱の窓に映すページの縮尺の下限（これより縮めず、収まらない分は切り取る。link-box.ts の previewRegion）
  margin: 88, // 図の周りの余白（ワールドの外。物は置けない。道具箱の幅 42 の 2 つ分くらい。2026-10-15 ユーザー。D32）
  paper: true as boolean, // 紙の制限を使うか（D33。単体テストは配置の計算を確かめるので test/setup.ts で切る。紙を確かめるテストは createGraph に渡す）
};

// updateEdge で変えられる線の項目（null で消す）
export interface EdgePatch {
  caption?: string | null; // 空か null で消す
  captionAt?: number | null;     // null で真ん中に戻す
  captionOffset?: number | null; // null で線の上に戻す
  arrow?: Arrow | null;
  startHead?: Head | null; // 端の形（heads.ts。null で消す）
  endHead?: Head | null;
  dash?: Dash | null;
  route?: Route | null;
  via?: number[] | null;
  exitAt?: number | null;
  enterAt?: number | null;
}

export interface GraphOptions extends Partial<typeof DEFAULTS> {
  onChange?: (data: Diagram) => void;
  onSelect?: (info: Info) => void;
  onHistory?: (state: HistoryState) => void; // 戻れる・進めるかが変わったとき
  onEvent?: (ev: GraphEvent) => void;         // 図で起きたこと（付け替えた、消したなど）。文言と画面の方針は notices.ts
  onBuild?: () => void;                       // 図を組み立て直した（ページの増減やキャプションを見直すため）
  onLiftOver?: (x: number, y: number) => void; // 付け替えのドラッグ中のポインタの位置（画面の座標。タブへのドラッグに使う）
  onLiftEnd?: () => void;                     // 付け替えのドラッグが終わった
  onAddRequest?: (req: AddRequest) => void;   // 追加モードで図を押した（新しい箱の中身を聞いて add を呼ぶのは画面の側。view.ts）
  onOpenPage?: (page: string) => void;
  onLLMSeen?: (version: string) => void;     // 見ていなかった LLM の変更（その版にした変更）をユーザーが見た（D31。サーバーの LLM の履歴に印を付けるのは画面の側。app.ts）        // リンクの箱の窓を押した（そのページのタブを前に出すのは画面の側。app.ts）
  // マスターの窓（book）がのぞくブックの題名・最初のページのパターン・縮図（まだ読んでいなければ scene は null）。visible は窓が見えているか
  // （見えていない窓（その他のブックの中）の縮図は取りに行かない。D26）。持たなければ book の id を題名にして、縮図は空
  bookWindow?: (book: string, visible: boolean) => { title: string; pattern: PagePattern; scene: Scene | null } | null;
  onOpenBook?: (book: string) => void;        // マスターの窓を押した（そのブックを前に出すのは画面の側。app.ts）
  // 描いていないページの縮図を、画面の外で実際に並べて作る（offscreen-scene.ts の layoutScene）。持たなければデータだけの近似（dataScene。テスト）
  sceneLayout?: (data: Diagram, page: string | null, without?: string) => Promise<Scene>; // without は中身だけを映す箱（リストの子の縮図。D13）
  measureText?: MeasureText;                  // 文字の測り方（テストで偽物に差し替える。既定はブラウザで測る）
}

export type { AddRequest, HistoryState, Mode };
export { COPY_MIME, REMOVED_MIME } from "./interaction";

// 履歴に残す件数
const HISTORY_LIMIT = 100;
// 手を離したとき、粘った形が一番よい形よりこれだけ折れ目が多ければ一番よい形に付け替える（docs/EDGE-SPEC.md の問 2）。
// 2 だと、相手の端を動かさずに Z 字で結んだ形（まっすぐより 2 つ多い）まで付け替えてしまう
const SETTLE_BENDS = 3;

export interface Graph {
  load(data: unknown, options?: { keepHistory?: boolean; version?: string }): void; // version は外部の変更の版（見ていない LLM の変更を、見たときにサーバーへ伝える。D31）
  undo(): boolean;
  redo(): boolean;
  history(): HistoryState;
  select(id: Id | null): void;
  reveal(id: Id): void; // 図の見えている範囲の外なら、スクロールして真ん中に持ってくる
  selected(): string | null;
  selectedEdge(): string | null; // 選んでいる線の id（線を選んでいなければ null）
  selectEdge(id: Id): void;
  updateEdge(id: Id, patch: EdgePatch): void;
  alignEdge(id: Id): void; // 線の両端を、今の形での一番よい位置に固定する（整列。docs/EDGE-SPEC.md の C1）
  removeEdge(id: Id): void;
  link(from: Id, to: Id): boolean;
  info(id: Id | null): NodeInfo;
  edgeInfo(id: Id): EdgeInfo | null; // 線の情報（無ければ null）
  update(id: Id | null, patch: Patch): void;
  batch(fn: () => void): boolean; // fn の中の変更を履歴の 1 件にまとめる（ダイアログの確定で、項目と一回きりの操作を一緒に書く）。紙からはみ出すならしないで false（D33）
  // クラスの箱にかかわる変更（クラスにする・クラスを直す・クラスでなくする。docs/CLASS-plan.md）。子や線を消すことがあるので、
  // 図を組み立て直して履歴に 1 件残す
  updateClass(id: Id, edit: ClassEdit): void;
  // ツリーのページを内包のページに変換する: 根の子孫を平らにして、親子を線で引き直す（元のツリーには戻せない。Undo では戻る）。
  // ツリーのページでなければ false（docs/PATTERN-plan.md）
  flattenTree(): boolean;
  toJSON(): Diagram;
  dragging(): boolean;
  setMode(mode: Mode): void;
  // 決まった形とサイズを足す追加モードに入る（道具入れの道具。影にその形の絵が付き、押した所に足すダイアログを開く。2026-10-12 ユーザー:
  // 道具入れもヘッダーの追加ボタンと同じ足し方にそろえた）
  startAdd(shape: Shape, size: Size): void;
  onModeChange(listener: (mode: Mode) => void): () => void; // モードが変わったら知らせる（図の側で変えたときも）。外す関数を返す
  // データが変わったら知らせる（組み立て直したとき: 読み込み・Undo・付け替えなど、と、履歴に残す変更をしたとき）。
  // サイドバーの一覧は、これを受けて図から作り直す（一覧は自分でデータを持たない）。外す関数を返す
  onDataChange(listener: () => void): () => void;
  mode(): Mode;
  reparent(id: Id, parentId: Id | null, at?: { x: number; y: number }): boolean; // at は最上位へ移すときの位置
  fitChildren(id: Id, what: "width" | "height" | "both"): number;
  // 決まった並べ方を持つパターン（フローチャート）のページの箱を、その並べ方で置き直す（自動で整列。docs/PATTERN-plan.md の 3.7 章）
  autoAlign(): boolean;
  // フローチャートのページの箱を、全部サイズ size にし、その間隔で整列し直す（中の箱のサイズ。ページの world に kidSize として覚える。
  // 1 回の変更として履歴に残す。docs/PATTERN-plan.md の 3.7 章）
  setKidSize(size: Size): boolean;
  remove(id: Id): boolean;
  restore(id: Id, parentId: Id | null, at?: { x: number; y: number }): boolean;
  items(): Items;
  geometry(): Geometry;
  pageScene(page: string): Scene; // ページの縮図のもと（リンクの箱の窓と、その設定ダイアログに）
  redraw(): void; // 描き直す（窓の縮図が届いたとき。データは変えない）
  linkScene(id: Id): Scene; // 窓（リンクの箱・マスターの窓）に映す縮図のもと（窓に映す範囲の設定ダイアログに）
  setPage(id: Id | null): void;
  page(): string | null;
  pages(): { id: string; caption: string }[]; // ブックのページ（2 枚目から。最初のページは含まない）
  // ページを足す（2 枚目から）。world はそのページの設定（パターンなど）。ツリーなら根の箱を 1 つ置く。新しいページの id を返す
  addPage(spec: { title?: string; world?: WorldData }): string;
  // ページ（null は最初のページ）の題名とワールドの設定（テーマ・背景色・線の通り方・ツリーの向き）を変える。履歴に 1 件残す。
  // 今描いているページは update(null) と同じ書き方、ほかのページはデータを書き換えて組み直す（ブックのダイアログ。D26）。
  // 最初のページの題名はブックの題名（world.title）なので、title は 2 枚目からのページだけ
  updatePage(id: string | null, patch: PagePatch): void;
  paste(copy: Subtree, parentId: Id | null, at?: { x: number; y: number }, from?: string): string;
  purge(id: Id): boolean; // 消したボックスを子孫ごと完全に削除する（ユーザーが足した箱だけ）
  // 新しい箱を足す（追加モードで押した所 req に、fields を中身にして）。新しい箱を選び、その id を返す
  add(req: AddRequest, fields: Partial<BoxData>): string;
  // プレビュー（見るだけのモード）。倍率を渡すと入り、null で編集に戻る。プレビュー中は、押すと選ぶだけで、
  // 背景のドラッグは見る範囲を動かす。図を直す操作（ドラッグ、Undo / Redo）は効かない
  setPreview(zoom: number | null): void;
  // 編集中の倍率（D32。preview.ts が 75% / 100% / 125% から選ぶ）。プレビューの間は効かず、抜けるとこの倍率に戻る
  setZoom(zoom: number): void;
  zoom(): number;
  preview(): number | null;
  // 画面の見え方（D32）: 今の倍率、図の周りの余白、ワールドをずらす量（ox・oy）。スクロールの位置 = ずらす量 + ワールドの座標 × 倍率（viewport.ts）
  view(): { zoom: number; margin: number; ox: number; oy: number };
  paper(): { name: PaperName; w: number; h: number } | null; // 今のページの紙（紙の制限を受けないページは null。D33）
  home(): void; // ワールドの左上を表示領域の左上に合わせる。紙が表示領域より小さい向きは真ん中に（開いたとき・ページを切り替えたとき。D32）
  contentSize(): { w: number; h: number }; // ボックスが占める範囲（ワールドの左上から、余白込み）
  destroy(): void;
}

export function createGraph(container: HTMLElement, data: unknown, options: GraphOptions = {}): Graph {
  injectStyle(GRAPH_STYLE_ID, GRAPH_CSS);
  const opt = { ...DEFAULTS, ...options };
  container.classList.add("mz-stage", "mz-mode-move"); // 最初は選択モード（setMode と同じ印を付けておく）

  // スクロールできる広さを決める見えない入れ物と、その中で周りの余白の分だけずらして置くワールド（D32）
  const canvasEl = document.createElement("div");
  canvasEl.className = "mz-canvas";
  container.appendChild(canvasEl);
  const worldEl = document.createElement("div");
  worldEl.className = "mz-world";
  container.appendChild(worldEl);
  const svg = document.createElementNS(SVGNS, "svg");

  let source: Diagram = { nodes: [] }; // 読み込んだデータ（ブック全体。保存時に未知の項目もそのまま残す）
  let page: string | null = null;      // 描いているページ（pages のページの id。null は最初のページ）
  let offEdges: EdgeData[] = [];       // ほかのページの線（描かずに残しておく）
  let nodes: Box[] = [];               // データの並び順
  let roots: Box[] = [];
  let byId = new Map<string, Box>();
  let edges: Edge[] = [];
  let mode: Mode = "move";
  let current: Box | null = null;      // 選択中（null はワールド）
  let currentEdge: Edge | null = null; // 選択中の線（選んでいればボックスは選んでいない）
  const boxOfEl = new WeakMap<Element, Box>();
  const edgeOfEl = new WeakMap<Element, Edge>(); // 線の要素（g）から線を引く（途中の区間をつかむ線から、その線を見つける）

  const world: World = {
    isWorld: true, id: null, el: worldEl, x: 0, y: 0, w: 0, h: 0, src: {},
    get children() { return roots; },
  };

  // 文字はワールドの中で測るので、倍率をかけていれば割り戻す（transform は文字の並び方を変えない。D32）
  const measurer = createTextMeasurer(options.measureText ?? ((head, width) => browserMeasure(head, width, applied)));
  // 開いたときのはみ出しの調整で移した箱（id → 移したときのファイルの位置と、移した先）。画面にだけある位置なので、
  // 外部の変更の読み直しで、LLM がその箱の位置を変えていなければ移した先に置く（keepShownPositions）。
  // ユーザーが図を変えて保存すると位置はファイルに入るので、忘れる
  let fitted = new Map<string, { file: string; x: number; y: number }>();
  const posKey = (s: { x?: unknown; y?: unknown }) =>
    Number.isFinite(s.x) && Number.isFinite(s.y) ? `${s.x},${s.y}` : null;
  // プレビューの倍率（null は編集中）と、今ワールドにかけている倍率
  let preview: number | null = null;
  let applied = 1;
  // 紙（D33。docs/PAPER-plan.md）: 紙の制限を受けるパターン（STRATEGIES の paper）のページは、紙の型（world.paper。無ければ DEFAULT_PAPER）の大きさ。
  // 受けないページ（マスター）は null
  const paperOf = (): { name: PaperName; w: number; h: number } | null => {
    if (!opt.paper || !STRATEGIES[worldViewOf(world)].paper) return null;
    const name = isPaper(world.src.paper) ? world.src.paper : DEFAULT_PAPER;
    return { name, w: PAPERS[name].w, h: PAPERS[name].h };
  };
  // ワールドの固定の大きさ（null の向きは表示領域と中身に合わせる）。紙があれば紙の大きさ、無ければデータの world.width / height
  const worldFixed = () => {
    const p = paperOf();
    return p ? { w: p.w, h: p.h } : { w: Number(world.src.width) || null, h: Number(world.src.height) || null };
  };
  const L = createLayout({
    opt, world, worldEl, container, canvas: canvasEl, measurer, roots: () => roots, edges: () => edges, zoom: () => applied, worldFixed, canvasSized: () => rehome(),
    fitted: n => {
      const file = posKey(n.src);
      if (file && !fitted.has(n.id)) fitted.set(n.id, { file, x: Math.round(n.x), y: Math.round(n.y) });
    },
  });
  // ドラッグ中か（線の道筋から分かったデータの直しを、手を離すまで待つ）。操作の仕組み（I）を作ったあとで差し替える
  let dragging = () => false;
  const R = createRenderer({ opt, world, worldEl, nodes: () => nodes, edges: () => edges, fixEdge, themeOf, paintOf, backgroundOf, dragging: () => dragging(), linkOf, sceneOf: windowScene }, L);
  const {
    incident, innerArea, syncWorld, clamp, centerX, refitAncestors,
    settle, sizable, alignChildren,
  } = L;
  const { applyWorldStyle, applyStyle, renderEdges, render, blocked, unfocus } = R;
  const H = createHistory({
    snapshot: () => api.toJSON(),
    // 記録した状態に戻す。選択は保ち、読み込み直後のはみ出しの調整はしない（記録どおりに戻すため）
    apply(d) {
      const sel = current?.id ?? null;
      build(d, false);
      if (sel != null && byId.has(sel)) select(byId.get(sel)!);
      fitted.clear();
      opt.onChange?.(api.toJSON());
    },
    onHistory: opt.onHistory,
    limit: HISTORY_LIMIT,
  });
  const I = createInteraction({
    container, world, boxOfEl, zoom: () => applied,
    current: () => current,
    mode: () => mode,
    select,
    canLink,
    link,
    canReconnect,
    reconnect,
    changed,
    notifySelect,
    reparent,
    drop: n => { settle(SCENES.drop, n); render(); },
    remove: n => { remove(n.id); },
    openLink: n => { const p = linkPageOf(n), b = linkBookOf(n); if (p != null) opt.onOpenPage?.(p); else if (b != null) opt.onOpenBook?.(b); },
    boxById: id => byId.get(id),
    edgeOfEl: el => {
      const g = el.closest(".mz-edge");
      return g ? edgeOfEl.get(g) : undefined;
    },
    // 線の区間・端・キャプションのドラッグの中身（edge-drag.ts）
    edgeDrag: createEdgeDrag({
      svg, edges: () => edges, anchorRect: n => L.anchorRect(n), redraw: () => renderEdges(),
      edited: e => { renderEdges(); if (currentEdge === e) notifySelect(); },
      committed: e => { renderEdges(); changed(); if (currentEdge === e) notifySelect(); },
      routeInput: e => R.routeInputOf(e),
    }),
    paste: (copy, parentId, at, from) => { paste(copy, parentId, at, from); },
    liftOver: (x, y) => opt.onLiftOver?.(x, y),
    liftEnd: () => opt.onLiftEnd?.(),
    reorder: (n, index) => { reorder(n, index); },
    // 箱につながる線の、自由な端を前に描いた辺の記憶を捨てる（一番よい形を追わせる）。passive は押し出された箱で、つかんだ箱 grabbed との
    // 線は除く（つかんだ箱の線は粘る。docs/EDGE-SPEC.md の A2・A3・A5）
    resizeBody: n => bodyResizer(n),
    resizeList: n => listResizer(n),
    resizeListHeight: n => listHeightResizer(n),
    resetRoutes: (boxes, passive = [], grabbed = null) => {
      const set = new Set(boxes), pushed = new Set(passive);
      for (const e of edges) {
        const fresh = set.has(e.a) || set.has(e.b) || ((pushed.has(e.a) || pushed.has(e.b)) && e.a !== grabbed && e.b !== grabbed);
        if (fresh && e.memory) { e.memory = null; e.routeMemo = null; }
      }
    },
    // 手を離した: つかんだ箱の線で、粘った形が一番よい形より折れ目が SETTLE_BENDS 以上多ければ、記憶を捨てて一番よい形にする（A4）
    settleRoutes: n => {
      for (const e of edges) {
        if ((e.a !== n && e.b !== n) || !e.memory || e.a === e.b) continue;
        const best = route({ ...R.routeInputOf(e), memory: null });
        if (e.points.length - 2 - best.bends >= SETTLE_BENDS) { e.memory = null; e.routeMemo = null; }
      }
    },
    // 一覧からドラッグして戻した（選択モードへの切り替えは、知らせを受けた画面の側で決める。notices.ts）
    restore: (id, parentId, at) => { restore(id, parentId, at, true); },
    // 追加モードで押したら、足すダイアログを開く前に選択モードに戻す（影の追従もここで終わる。キャンセルしても選択モードのまま。
    // 2026-10-12 ユーザー）。足す形とサイズは、戻す前に取っておく
    requestAdd: req => {
      const full = { ...req, ...(adding ? { shape: adding.shape, size: adding.size } : {}) };
      setMode("move");
      opt.onAddRequest?.(full);
    },
    addShape: () => adding?.shape ?? DEFAULT_SHAPE,
    leaveAdd: () => setMode("move"),
  }, L, R, createDrag(opt, L));
  dragging = () => I.dragging();

  // まだユーザーが見ていない LLM の変更（外部の変更の読み直し。D31。2026-10-15 ユーザー）。変えた箱が見えている範囲に入ったら（スクロールで
  // 通っただけでも）認知し、ユーザーの履歴の時刻の位置に差し込む（history.ts の adopt）。1 つの変更が複数の箱を扱うときは、どれか 1 つが見えたら全体。
  // 消した箱は消す前の場所、ページの設定（world・pages）は、そのページが出たら。非表示や縮図の行の中の箱は、▼ や縮図が見えても認知しない
  interface Unseen {
    op: Op;
    version: string | null;
    nodes: Set<string>;
    removed: { page: string | null; rect: Rect }[];
    pages: Set<string | null>;
    whole: boolean;
  }
  let unseen: Unseen[] = [];

  // データの変更を知らせる相手（onDataChange）
  const dataListeners = new Set<() => void>();
  const dataChanged = () => { for (const f of dataListeners) f(); };

  let batching = 0, batchDirty = false; // batch の中か・その中で変わったか
  function changed() {
    L.holdWorld(false); // 箱を足す所を探す間に広げた図は、図が変わったら中身に合わせる（layout.ts の stretchWorld）
    dataChanged();
    fitted.clear();
    if (batching) { batchDirty = true; return; } // まとめている間は、終わったときに 1 件だけ残す（batch）
    if (refuseOverPaper(true)) return;
    const data = api.toJSON();
    H.record(data);
    opt.onChange?.(data);
  }

  // 紙（D33）: 紙からはみ出している最上位の箱。操作のたびに、前から出ていた箱（LLM がファイルに書いた位置など）を覚えておき、
  // 操作で新しくはみ出す箱ができたら、その操作はしない（直前の状態に戻し、履歴に積まない）。warn なら知らせる（ダイアログは自分で知らせる）
  let outsideKnown = new Set<string>();
  const outsideNow = () => new Set(roots.filter(L.outsideFixed).map(n => n.id));
  function refuseOverPaper(warn: boolean): boolean {
    const p = paperOf();
    const now = outsideNow();
    if (!p || [...now].every(id => outsideKnown.has(id))) {
      outsideKnown = now;
      return false;
    }
    const sel = current?.id ?? null;
    build(JSON.parse(JSON.stringify(H.last())), false); // 写しを読む（読んだデータはこのあとの編集で書き換わるので、履歴の状態を渡さない）
    if (sel != null && byId.has(sel)) select(byId.get(sel)!);
    dataChanged();
    if (warn) opt.onEvent?.({ kind: "overPaper", paper: p.name });
    return true;
  }

  // fn の中の変更を、履歴の 1 件（と 1 回の変更の知らせ）にまとめる。ダイアログの確定で、項目の変更と一回きりの操作（子のサイズを
  // そろえる・線の整列など）を一緒に書くときに使う（D26 の案 A。2026-10-14 ユーザー）。
  // 紙からはみ出すなら、まとめてしなかったことにして false を返す（知らせるのは呼んだ側。ダイアログは閉じずに知らせる。D33）
  function batch(fn: () => void): boolean {
    batching++;
    try {
      fn();
    } finally {
      batching--;
    }
    if (batching || !batchDirty) return true;
    batchDirty = false;
    if (refuseOverPaper(false)) return false;
    const data = api.toJSON();
    H.record(data);
    opt.onChange?.(data);
    return true;
  }

  function notifySelect() {
    opt.onSelect?.(currentEdge ? edgeInfo(currentEdge) : info(current));
  }

  // ---- 選択 ----

  // n が図の見えている範囲（スクロールバーを除く）に収まっていなければ、図をスクロールして真ん中に持ってくる。
  // 非表示の親の中にいて描かれていなければ、描かれている一番近い祖先を見せる
  function reveal(n: Box) {
    let m: Box | null = n;
    while (m && !m.el.getClientRects().length) m = m.parent;
    if (!m) return;
    const r = m.el.getBoundingClientRect(), c = container.getBoundingClientRect();
    const left = c.left + container.clientLeft, top = c.top + container.clientTop;
    const right = left + container.clientWidth, bottom = top + container.clientHeight;
    if (r.left >= left && r.top >= top && r.right <= right && r.bottom <= bottom) return;
    container.scrollBy({
      left: r.left + r.width / 2 - (left + right) / 2,
      top: r.top + r.height / 2 - (top + bottom) / 2,
      behavior: "smooth",
    });
  }

  function select(n: Box | null) {
    markEdge(null);
    (current ?? world).el.classList.remove("mz-current");
    current = n;
    (current ?? world).el.classList.add("mz-current");
    notifySelect();
  }

  // 線を選ぶ。ボックス（とワールド）の選択は外す
  function selectEdge(e: Edge) {
    (current ?? world).el.classList.remove("mz-current");
    current = null;
    markEdge(e);
    notifySelect();
  }

  function markEdge(e: Edge | null) {
    currentEdge?.el.classList.remove("mz-selected");
    currentEdge = e;
    e?.el.classList.add("mz-selected");
    if (e) R.toFront([e]); // 選んだ線は、重なったほかの線より手前に
  }

  // 線の道筋を決めたときに分かった、データに書き戻すこと（routing.ts の RouteFix）。描画の側ではデータを書き換えない
  // 箱や線をドラッグしている間は書き戻さず、手を離して描き直すときに書く（途中で一瞬引けなくなっただけで消さない。docs/EDGE-SPEC.md の P2）
  function fixEdge(e: Edge, fix: RouteFix) {
    if (dragging()) return;
    if (fix.clearVia) delete e.src.via;
    if (fix.clearLegacy) { delete e.src.exit; delete e.src.enter; delete e.src.bend; }
  }



  function edgeInfo(e: Edge): EdgeInfo {
    return {
      kind: "edge", id: e.id, self: e.a === e.b, from: brief(e.a), to: brief(e.b), arrow: arrowOf(e),
      startHead: headOf(e.src, "start"), endHead: headOf(e.src, "end"), dash: dashOf(e), caption: typeof e.src.caption === "string" && e.src.caption ? e.src.caption : null,
      captionMoved: e.src.captionAt != null || e.src.captionOffset != null, route: routeOf(e, world),
      via: viaOf(e), adjustable: e.segments.length > 0, endsMoved: e.src.exitAt != null || e.src.enterAt != null,
      aligned: e.a === e.b || !e.ends || isAligned(R.routeInputOf(e), e.points),
      arrangement: e.arrangement,
      captionHints: captionHintsOf(e),
    };
  }

  function edgeOf(id: Id) {
    const e = edges.find(x => x.id === String(id));
    if (!e) throw new Error(t("線がありません: {id}", { id }));
    return e;
  }

  // ---- 線の追加・削除 ----

  function newEdgeId() {
    const used = new Set([...edges.map(e => e.id), ...offEdges.map(e => String(e.id))]);
    let i = edges.length + 1;
    while (used.has("e" + i)) i++;
    return "e" + i;
  }

  // 線の端を吸着させる距離（ワールドの px）





  function canLink(a: Box, b: Box) {
    if (a.parent !== b.parent || !abilitiesOf(a).link) return false;
    // 自分に戻る線は、同じ箱に何本でも引ける（輪の大きさを変えて重ねない。docs/SELFLOOP-plan.md）
    if (a === b) return true;
    return !edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  }

  function addEdge(src: EdgeData, a: Box, b: Box) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "mz-edge");
    g.dataset.id = String(src.id); // 外から線を特定するため（線は手前に描き直すと並びが変わるので、順番では探さない）
    const line = document.createElementNS(SVGNS, "polyline");
    line.setAttribute("class", "mz-line");
    const arrowEl = document.createElementNS(SVGNS, "path");
    arrowEl.setAttribute("class", "mz-arrow");
    const headLineEl = document.createElementNS(SVGNS, "path");
    headLineEl.setAttribute("class", "mz-arrow-line");
    const hit = document.createElementNS(SVGNS, "polyline");
    hit.setAttribute("class", "mz-hit");
    const handlesEl = document.createElementNS(SVGNS, "g");
    handlesEl.setAttribute("class", "mz-bends");
    const endsEl = document.createElementNS(SVGNS, "g");
    endsEl.setAttribute("class", "mz-ends");
    for (const end of ["exit", "enter"]) {
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("class", "mz-end");
      c.setAttribute("r", "5");
      c.dataset.end = end;
      endsEl.appendChild(c);
    }
    g.append(line, arrowEl, headLineEl, hit, handlesEl, endsEl);
    svg.appendChild(g);
    const e: Edge = {
      src, id: String(src.id), a, b, el: g, lines: [line, hit], arrowEl, headLineEl, points: [], handlesEl,
      shape: null, segments: [], arrangement: "diagonal", ends: null, memory: null, routeMemo: null, endsEl, labelEl: null,
    };
    // キャプションの札を押しても、線を選ぶ（札は render.ts が作ったり消したりするので、g で受け取る）
    g.addEventListener("click", ev => {
      if (mode !== "move" || !(ev.target instanceof Element) || !ev.target.closest(".mz-label")) return;
      ev.stopPropagation();
      selectEdge(e);
    });
    // ポインタを乗せた線は、重なったほかの線より手前に描く（乗せたときの色が、重なった区間で隠れないように）
    g.addEventListener("pointerenter", () => R.toFront([e]));
    edgeOfEl.set(g, e);
    for (const el of [hit, handlesEl]) {
      el.addEventListener("click", ev => {
        if (mode !== "move") return; // 選択モード以外では、線は CSS でもクリックを受けない
        ev.stopPropagation();
        selectEdge(e);
      });
    }
    edges.push(e);
    return e;
  }

  function removeEdge(e: Edge) {
    e.el.remove();
    edges = edges.filter(x => x !== e);
    if (currentEdge === e) select(null);
    unfocus();
    changed();
    notifySelect();
  }

  function updateEdge(e: Edge, patch: EdgePatch) {
    for (const k of ["exitAt", "enterAt"] as const) {
      if (!(k in patch)) continue;
      const v = patch[k];
      if (v != null && !(v >= 0 && v <= 1)) throw new Error(t("{k} は 0 から 1 の数にしてください: {v}", { k, v }));
      setOrDelete(e.src, k, v ?? undefined, v == null);
    }
    if ("via" in patch) {
      if (patch.via != null && !(Array.isArray(patch.via) && patch.via.every(Number.isFinite))) throw new Error(t("via は数の並びにしてください"));
      setOrDelete(e.src, "via", patch.via ?? undefined, patch.via == null);
    }
    if ("route" in patch) {
      if (patch.route != null && !(ROUTES as readonly string[]).includes(patch.route)) throw new Error(t("route の値が不正です: {v}", { v: patch.route }));
      // 図の既定と同じなら書かない（既定を変えたとき一緒に変わるように）
      setOrDelete(e.src, "route", patch.route ?? undefined, patch.route == null || patch.route === routeDefaultOf(world));
    }
    if ("arrow" in patch) {
      if (patch.arrow != null && !(ARROWS as readonly string[]).includes(patch.arrow)) throw new Error(t("arrow の値が不正です: {v}", { v: patch.arrow }));
      setOrDelete(e.src, "arrow", patch.arrow ?? undefined, patch.arrow == null);
    }
    for (const k of ["startHead", "endHead"] as const) {
      if (!(k in patch)) continue;
      const v = patch[k];
      if (v != null && !isHead(v)) throw new Error(t("{k} の値が不正です: {v}", { k, v }));
      setOrDelete(e.src, k, v ?? undefined, v == null);
    }
    if ("captionAt" in patch) {
      const v = patch.captionAt;
      if (v != null && !(v >= 0 && v <= 1)) throw new Error(t("captionAt は 0 から 1 の数にしてください: {v}", { v }));
      setOrDelete(e.src, "captionAt", v ?? undefined, v == null);
    }
    if ("captionOffset" in patch) {
      const v = patch.captionOffset;
      if (v != null && !Number.isFinite(v)) throw new Error(t("captionOffset は数にしてください: {v}", { v }));
      setOrDelete(e.src, "captionOffset", v == null ? undefined : Math.max(-CAPTION_OFFSET_MAX, Math.min(CAPTION_OFFSET_MAX, v)), v == null);
    }
    if ("caption" in patch) {
      const v = patch.caption == null ? "" : String(patch.caption).trim();
      setOrDelete(e.src, "caption", v, !v);
    }
    if ("dash" in patch) {
      if (patch.dash != null && !(DASHES as readonly string[]).includes(patch.dash)) throw new Error(t("dash の値が不正です: {v}", { v: patch.dash }));
      // 実線は既定なので、JSON には書かない
      setOrDelete(e.src, "dash", patch.dash ?? undefined, patch.dash == null || patch.dash === "solid");
    }
    // 端や形を決め直したら、自由な端の前の辺の記憶は使わない（一番よい形から）
    if ("exitAt" in patch || "enterAt" in patch || "via" in patch || "route" in patch) e.memory = null;
    // キャプションが付くと、つながった 2 つの箱の最小間隔が広がる（layout.ts の gapBetween）。近すぎれば終点の側をどける
    if ("caption" in patch && e.a !== e.b) {
      settle(SCENES.drop, e.a);
      render();
    } else renderEdges();
    changed();
    notifySelect();
  }

  // 本文の幅をつまんで変える（docs/BODY-plan.md の段階 2）。開始時の位置を覚えておき、幅を変えるたびにそこから決め直す
  // （押しのけた相手は、狭めれば戻る）。手を離したら 1 件の履歴にする。
  // 変えられる幅は、葉の見た目の箱なら本文の最小の幅〜サイズの最大。内包する箱・リストの親なら本文の最小の幅〜子の並びで決まった箱の幅
  // （本文で箱は広がらない。箱の幅まで広げたら自動に戻す。docs/SIZE-plan.md）
  // リストの幅のつまみ（docs/SIZE-plan.md の 10 章）。ドラッグの間は開始時の位置の写しから毎回決め直し（本文の幅と同じ場面）、
  // 手を離したら 1 件の履歴。幅は width に書く（狭める下限は layout が決める。node-kinds.ts の list）
  function listResizer(n: Box) {
    const snap = new Map(nodes.map(b => [b, { x: b.x, y: b.y, intendedY: b.intendedY, intendedCX: b.intendedCX }]));
    const before = n.specW;
    const restore = () => { for (const [b, s] of snap) Object.assign(b, s); };
    const apply = (w: number) => {
      restore();
      setSpec(n, "w", w);
      settle(SCENES.resizeBody, n);
      render();
    };
    return {
      width: n.w,
      set(w: number) { apply(Math.round(Math.max(GROUP_MIN.w, w))); },
      finish() {
        if (!n.parent) n.intendedCX = centerX(n);
        changed();
        notifySelect();
      },
      cancel() { apply(before); },
    };
  }

  // スクロールにしたリストの高さの上限（D33）。つまみを動かした分だけ変え、周りは押しのける（手を離したら確定）
  function listHeightResizer(n: Box) {
    const snap = new Map(nodes.map(b => [b, { x: b.x, y: b.y, intendedY: b.intendedY, intendedCX: b.intendedCX }]));
    const before = Number(n.src.listHeight) || n.h;
    const restore = () => { for (const [b, s] of snap) Object.assign(b, s); };
    const apply = (h: number) => {
      restore();
      n.src.listHeight = h;
      settle(SCENES.resizeBody, n);
      render();
    };
    return {
      width: n.h, // 今の高さ（resizeGesture は width という名前で受け取る）
      set(h: number) { apply(Math.round(Math.max(n.kidsTop + 32, Math.min(n.fullH, h)))); },
      finish() { changed(); notifySelect(); },
      cancel() { apply(before); },
    };
  }

  function bodyResizer(n: Box) {
    const snap = new Map(nodes.map(b => [b, { x: b.x, y: b.y, intendedY: b.intendedY, intendedCX: b.intendedCX }]));
    const before = typeof n.src.bodyWidth === "number" ? n.src.bodyWidth : undefined;
    const group = isNesting(n);
    const width = group ? bodyWrapW(n, n.hw) : n.hw;
    const max = group ? n.hw : SIZES[sizeOf(n)].maxW;
    const restore = () => { for (const [b, s] of snap) Object.assign(b, s); };
    const apply = (w: number | undefined) => {
      restore();
      setOrDelete(n.src, "bodyWidth", w, w == null);
      settle(SCENES.resizeBody, n);
      render();
    };
    return {
      width,
      set(w: number) {
        const v = Math.round(Math.max(BODY_MIN_W, Math.min(max, w)));
        apply(group && v >= Math.floor(max) ? undefined : v);
      },
      finish() {
        if (!n.parent) n.intendedCX = centerX(n);
        changed();
        notifySelect();
      },
      cancel() { apply(before); },
    };
  }

  // 整列: 両端を、今の形での一番よい位置（辺の真ん中か、まっすぐ結べる位置）に固定し、手で直した区間は消す（docs/EDGE-SPEC.md の C1）
  function alignEdge(e: Edge) {
    if (e.a === e.b || e.points.length < 2 || !e.ends) return;
    updateEdge(e, { ...alignedEnds(R.routeInputOf(e), e.points), via: null });
  }

  // a から b へ線を引く（引けなければ何もせず false）。from（引き始めた〇の辺の真ん中）と at（離した所）はワールドの座標。
  // from があれば始点をそこに、at があれば終点を at に一番近いふちの点（ひし形は頂点）に固定する。
  // 同じ箱なら自分に戻る線で、at に一番近い角が空いていれば、端をその角に固定する（docs/EDGE-TOOL-plan.md）
  function link(a: Box, b: Box, at?: [number, number], from?: [number, number], members?: { from?: string; to?: string }): boolean {
    if (!canLink(a, b)) {
      blocked(b);
      return false;
    }
    // 画面で引いた線は、終点に矢印を付けておく（2026-10-11 ユーザー。外せるのはサイドバーと編集ダイアログ）
    const src: EdgeData = { id: newEdgeId(), from: a.src.id!, to: b.src.id!, arrow: "end" };
    // クラスの箱の属性・操作につなぐ線は、行の左右の端（相手のいる側）に付くので、端の位置は書かない（docs/CLASS-plan.md）
    if (a !== b && members?.from != null) { src.fromMember = members.from; from = undefined; }
    if (a !== b && members?.to != null) { src.toMember = members.to; at = undefined; }
    const e = addEdge(src, a, b);
    // 線でつながると、2 つの箱の最小間隔が広がる（layout.ts の gapBetween）。近すぎれば、始点の箱はそのままで終点の側をどける
    if (a !== b) settle(SCENES.drop, a);
    if (a !== b && (at || from)) {
      if (from) fixEnd(e, "exit", from);
      if (at) fixEnd(e, "enter", at);
    }
    if (a !== b) render(); else renderEdges();
    const corner = a === b && at ? R.loopCornerNear(e, at) : null;
    if (corner) {
      e.src.exitAt = Math.round(corner.exit * 1000) / 1000; // 端をつまんで動かしたときと同じ桁
      e.src.enterAt = Math.round(corner.enter * 1000) / 1000;
      renderEdges();
    }
    changed();
    notifySelect();
    return true;
  }

  // 線 e の端（exit は始点、enter は終点）を、p（ワールドの座標）に一番近い箱の縁の位置に固定する（頂点にしかつなげない形は一番近い頂点）
  function fixEnd(e: Edge, end: "exit" | "enter", p: [number, number]) {
    const input = R.routeInputOf(e);
    const r = end === "exit" ? input.a : input.b;
    const q = pointAt(perimeter(r), nearestAt(perimeter(r), p[0], p[1]));
    const vertex = end === "exit" ? input.aVertex : input.bVertex;
    e.src[end === "exit" ? "exitAt" : "enterAt"] = perimeterAt(r, vertex ? vertexOf(r, q) : q);
  }

  // 線 e の端を、箱 to につなぎ替えられるか（残課題 E12）。線を引くときと同じ決まり: もう一方の端と同じ階層で、同じ組の線がほかに無いこと。
  // もう一方の端と同じ箱なら、自分に戻る線になる（何本でもよい）。今つないでいる箱は付け替えにならない
  function canReconnect(e: Edge, end: "exit" | "enter", to: Box): boolean {
    const own = end === "exit" ? e.a : e.b, other = end === "exit" ? e.b : e.a;
    if (to === own || to.parent !== other.parent || !abilitiesOf(to).link) return false;
    if (to === other) return true;
    return !edges.some(o => o !== e && ((o.a === to && o.b === other) || (o.a === other && o.b === to)));
  }

  // 線 e の端を箱 to につなぎ替え、端を離した所 at（ワールドの座標）に近い縁に固定する。キャプション・矢印・線の種類はそのまま。
  // 道筋（折れ目 via）と、付け替えた端の位置・クラスの行は捨てる。自分に戻る線になる・でなくなるときは、両端の位置を捨てる（意味が変わるため）
  function reconnect(e: Edge, end: "exit" | "enter", to: Box, at: [number, number]): boolean {
    if (!canReconnect(e, end, to)) {
      blocked(to);
      return false;
    }
    const wasLoop = e.a === e.b;
    if (end === "exit") { e.a = to; e.src.from = to.src.id!; delete e.src.fromMember; delete e.src.exitAt; }
    else { e.b = to; e.src.to = to.src.id!; delete e.src.toMember; delete e.src.enterAt; }
    const loop = e.a === e.b;
    if (wasLoop || loop) { delete e.src.exitAt; delete e.src.enterAt; }
    delete e.src.via;
    e.memory = null;
    e.routeMemo = null;
    if (!loop) {
      // 線でつながると最小間隔が広がる（layout.ts の gapBetween）。近すぎれば、つなぎ替えた先はそのままで、もう一方をどける
      settle(SCENES.drop, to);
      render();
      fixEnd(e, end, at);
      renderEdges();
    } else {
      renderEdges();
      const corner = R.loopCornerNear(e, at);
      if (corner) {
        e.src.exitAt = Math.round(corner.exit * 1000) / 1000;
        e.src.enterAt = Math.round(corner.enter * 1000) / 1000;
        renderEdges();
      }
    }
    changed();
    notifySelect();
    return true;
  }

  // ---- 親子の付け替え ----

  // id のボックス（子孫ごと）を parentId（今のページの箱。null は今のページの最上位）の子にする。同じ階層でなくなった線は外す。
  // id はほかのページの箱でもよい（タブへのドラッグでページを移したとき）。
  // 位置: 最上位なら at。子を内包しているグループなら、今ある子の下の左端。
  // それ以外（子の無いボックスやツリー、非表示）は自動で並べる
  function reparent(id: Id, parentId: Id | null, at?: { x: number; y: number }) {
    const dest = target(parentId);
    if (!source.nodes.some(s => String(s.id) === String(id))) throw new Error(t("ボックスがありません: {id}", { id }));
    if (refusePattern(patternOf(source, pageOf(source.nodes, id)))) return false;
    if (refuseKids(dest, subtreeIds(api.toJSON().nodes, id).size - 1)) return false;
    const to = placeOf(dest);
    let cut = 0, fromPage: string | null = null;
    const moved = rebuildWith(data => {
      const src = data.nodes.find(s => String(s.id) === String(id));
      if (!src) throw new Error(t("ボックスがありません: {id}", { id }));
      fromPage = pageOf(data.nodes, id);
      // 同じ親の中（最上位なら同じページ）なら、動かすものが無い
      if (String(src.parent ?? "") === String(to.parent ?? "") && (src.parent != null || fromPage === page)) return null;
      const pos = dest == null && at ? { x: Math.max(0, at.x), y: Math.max(0, at.y) }
        : dest && isNesting(dest) ? { x: innerArea(dest).left, y: Math.max(...dest.children.map(k => k.y + k.h)) + opt.gap * 2 }
        : null;
      cut = moveSubtree(data, id, to, pos);
      return { select: String(id) };
    });
    if (!moved) return false;
    opt.onEvent?.({
      kind: "moved", into: dest ? keyOfBox(byId.get(dest.id)!) : null, page: fromPage !== page ? pageName(page) : null, cutEdges: cut,
    });
    return true;
  }

  const pageName = (p: string | null) => pageNameOf(source, p);
  // リンクの箱がのぞくページ（link-box.ts）: ページの名前とパターン（窓の札に出す）。リンクの箱でなければ null
  function linkOf(n: Box): { page: string; pageName: string; pattern: PagePattern; look: LinkLook; clip: ClipRect | null; book: string | null } | null {
    const book = linkBookOf(n);
    if (book != null) {
      const w = opt.bookWindow?.(book, false);
      return { page: "", pageName: w?.title ?? book, pattern: w?.pattern ?? DEFAULT_VIEW, look: linkLookOf(n), clip: clipOf(n), book };
    }
    const page = linkPageOf(n);
    if (page == null) return null;
    const view = pageWorld(source, page).childView;
    return { page, pageName: pageName(page), pattern: isPattern(view) ? view : DEFAULT_VIEW, look: linkLookOf(n), clip: clipOf(n), book: null };
  }
  // 窓に映す縮図のもと。マスターの窓は、見えている窓だけ縮図を取りに行かせる（隠れた箱の中の窓は題名だけ）
  function windowScene(n: Box): Scene {
    if (!isLinkBox(n)) return boxScene(n);
    const book = linkBookOf(n);
    if (book == null) return pageScene(linkPageOf(n) ?? "");
    return opt.bookWindow?.(book, !isHidden(n))?.scene ?? EMPTY_SCENE;
  }

  // ページの縮図のもと（リンクの箱の窓に映す。preview-art.ts。D27 段階 4）。描いたページは、ページを離れるときに配置の結果を覚える（captureScene）。
  // 覚えたものは、そのページのデータ（箱・線・world）が変わっていない間だけ使い、変わっていれば（外部の変更など）描き直すまで近似で映す。
  // 近似は、そのページの最上位の箱をデータの位置（無ければ 0,0）と大きさの指定（無ければ M の最小）で置き、最上位どうしの線を中心で結ぶ
  const scenes = new Map<string, { key: string; scene: Scene }>();
  const sceneKey = (d: Diagram, p: string | null) => {
    const members = new Set(pageMembers(d.nodes, p));
    const edgesIn = (d.edges ?? []).map(normalizeEdge).filter(e => members.has(String(e.from)));
    return JSON.stringify([pageWorld(d, p), d.nodes.filter(s => members.has(String(s.id))), edgesIn]);
  };
  // 今のページの縮図を覚える。data は今の状態を書き出したもの（toJSON。配置で決まった位置も書いてあるので、次に読むデータと鍵が合う）
  function captureScene(data: Diagram) {
    scenes.set(page ?? "", { key: sceneKey(data, page), scene: sceneOf(api.geometry(), backgroundOf()) });
  }
  // Undo / Redo（2026-10-15 ユーザー）: 履歴はブック全体なので、戻した変更が見ていないページのものなら、そのページへ切り替える
  // （今のページも変わっていれば、今のページのまま）
  function step(move: () => boolean): boolean {
    const before = api.toJSON();
    if (!move()) return false;
    const after = api.toJSON();
    const changedOn = (p: string | null) => sceneKey(before, p) !== sceneKey(after, p);
    if (!changedOn(page)) {
      const target = [null, ...pagesOf(after).map(x => String(x.id))].find(changedOn);
      if (target !== undefined) {
        api.setPage(target);
        opt.onChange?.(api.toJSON()); // 画面のタブを合わせる（app.ts の refreshPages）
      }
    }
    return true;
  }

  // 描いていないページは、画面の外で並べて作る（届くまでは空の絵。近似は線や子が合わないので出さない。2026-10-14 ユーザー）
  const layingOut = new Set<string>();
  let destroyed = false; // 壊したあとに届いた縮図は使わない
  function pageScene(p: string): Scene {
    const hit = scenes.get(p);
    if (hit && hit.key === sceneKey(source, p)) return hit.scene;
    if (!opt.sceneLayout) return dataScene(source, p, opt);
    if (!layingOut.has(p)) {
      layingOut.add(p);
      // 組み立ての途中（描きながら呼ばれる）でデータを書き出さないよう、次の番で始める
      setTimeout(() => {
        if (destroyed) return;
        const k = sceneKey(source, p);
        void opt.sceneLayout!(api.toJSON(), p === "" ? null : p).then(scene => {
          layingOut.delete(p);
          if (destroyed) return;
          scenes.set(p, { key: k, scene });
          api.redraw();
        }, () => layingOut.delete(p));
      }, 0);
    }
    return hit?.scene ?? EMPTY_SCENE; // 変わる前の絵があれば、届くまでそれを出す
  }

  // リストの子の中身の縮図（D13。2026-10-14 ユーザー）: その箱と子孫を 1 ページの図にして画面の外で並べ、箱自身の枠を除いて映す。
  // 鍵はその図のデータで、中身が変わるまで使い回す。届くまでは前の絵（無ければ空の絵）
  const boxScenes = new Map<string, { key: string; scene: Scene }>();
  function boxData(id: string): Diagram {
    const ids = subtreeIds(source.nodes, id);
    const nodes = source.nodes.filter(s => ids.has(String(s.id)))
      .map(s => (String(s.id) === id ? { ...s, parent: undefined, page: undefined, x: 0, y: 0 } : s));
    const edges = (source.edges ?? []).map(normalizeEdge).filter(e => ids.has(String(e.from)) && ids.has(String(e.to)));
    return { world: { ...pageWorld(source, pageOf(source.nodes, id)), childView: undefined, root: undefined }, nodes, edges };
  }
  function boxScene(n: Box): Scene {
    const hit = boxScenes.get(n.id);
    if (!opt.sceneLayout) return hit?.scene ?? EMPTY_SCENE;
    const data = boxData(n.id), k = JSON.stringify(data);
    if (hit && hit.key === k) return hit.scene;
    const job = "box:" + n.id;
    if (!layingOut.has(job)) {
      layingOut.add(job);
      setTimeout(() => {
        if (destroyed) return;
        void opt.sceneLayout!(data, null, n.id).then(scene => {
          layingOut.delete(job);
          if (destroyed) return;
          boxScenes.set(n.id, { key: k, scene });
          api.redraw();
        }, () => layingOut.delete(job));
      }, 0);
    }
    return hit?.scene ?? EMPTY_SCENE;
  }


  // 落とし先（parentId。null は今のページの最上位）の箱。子を持てない箱（クラス・フローチャートの箱）の中へは入れられない
  function target(parentId: Id | null): Box | null {
    const dest = parentId == null ? null : (nodeOf(parentId) as Box);
    if (dest && !shapeDef(shapeOf(dest)).kids) throw new Error(t("クラスの箱は子を持てません"));
    if (dest && !acceptsKid(dest, false)) throw new Error(t("フローチャートの中の箱は子を持てません"));
    return dest;
  }

  // パターンの違うページから箱を移そうとしたら（付け替え・戻す・移植）、知らせて断る（true）。要素はパターンをまたがない（docs/PATTERN-plan.md）
  function refusePattern(from: PagePattern): boolean {
    const to = patternOf(source, page);
    if (from === to) return false;
    opt.onEvent?.({ kind: "crossPattern", from, to });
    return true;
  }

  // 子を持つ箱（子孫 kids 個）を、子が子を持てない戦略（フローチャート）の箱 dest へ入れようとしたら、知らせて断る（true）
  function refuseKids(dest: Box | null, kids: number): boolean {
    if (!kids || acceptsKid(dest ?? world, true)) return false;
    opt.onEvent?.({ kind: "leafKids" });
    return true;
  }

  // 道具箱（toolbox.ts）: ページのパターンの道具（形・追加・マスターの操作。STRATEGIES の tools）。どの箱を選んでいても図の左端に出す。無ければ null
  function toolHostOf(): { id: string | null; tools: ToolKey[]; size: Size } | null {
    const { tools } = STRATEGIES[worldViewOf(world)];
    return tools.length ? { id: null, tools: [...tools], size: kidSizeOf(world) ?? "M" } : null;
  }

  // ページに掛けられないパターン（子を持つ最上位の箱があるなら、箱が子を持てないフローチャートは掛けられない）
  const patternsOff = (): PagePattern[] =>
    roots.some(k => k.children.length) ? PAGE_PATTERNS.filter(v => STRATEGIES[v].leafKids) : [];

  // 置き場所（edits.ts の Place）: 落とし先の箱の中か、今のページの最上位
  const placeOf = (t: Box | null): Place => (t ? { parent: t.src.id, page: null } : { page });

  // 落とした位置に置くか（内包か子の無い箱の中、または最上位）。ツリー・非表示の中なら自動で並べる（null）
  const dropPos = (t: Box | null, at?: { x: number; y: number }) => (at && (!t || placesFreely(t)) ? at : null);

  // 構造が変わる操作（付け替え・ほかのページの箱を消す・戻す・移植）の入口（docs/REFACTOR-2.md）。
  // 図の写しを edit で直して作り直し、選び直して、履歴に 1 件残す。順番（作り直す → 選ぶ → 履歴）はここで決める。
  // edit は、選び直す箱の id（select。無ければワールド）と、落とした操作なら落とした位置（drop。null は位置を決めない）を返す。
  // null を返したら何もしない（作り直さず、履歴にも残さない）。
  // 落とした箱は、落とした位置に置き直し、ぶつかった相手を下へずらし、置いた位置を本来いたい位置にする。
  // 選び直した箱（無ければ null）を返す。値を変える操作（update など）はその場で直すので、ここを通らない。
  // 今のページの箱を消す remove も、押し下げられた箱の本来いたい高さを保つため、その場で外す（作り直すと忘れる）
  function rebuildWith(edit: (data: Diagram) => { select?: string; drop?: Pos } | null): Box | null | undefined {
    const data = api.toJSON();
    const r = edit(data);
    if (!r) return undefined;
    build(data, false);
    const n = r.select != null ? byId.get(r.select) ?? null : null;
    if (n && r.drop !== undefined) {
      if (r.drop) {
        [n.x, n.y] = clamp(n, r.drop.x, r.drop.y);
        settle(SCENES.drop, n);
        render();
      }
      n.intendedY = n.y;
      n.intendedCX = centerX(n);
    }
    select(n);
    changed();
    return n;
  }

  // ---- ツリーを平らにして線で引き直す（docs/PATTERN-plan.md の 3.6 章） ----

  // ツリーの特殊な操作。解除（内包に戻す）とは別で、見た目を保ったまま普通の箱と線に変える（元のツリーには戻せない。Undo では戻る）。
  // ツリーにした箱 root と子孫を、root の親の直下に今の見た目の位置で並べ、親から子へ 1 本ずつ折れ線を引く。端は辺の真ん中に固定し、
  // 腹（親と子の間の区間）を兄弟でそろえるので、ツリーの線と同じ絵になる（親から出る区間は兄弟の線で重なる）。矢印は付けない
  // ツリーのページを内包に変換できるか（根がある）
  const canFlatten = (): boolean => !!rootBoxOf(world);

  // ツリーのページを内包のページに変換する（戻せない）。根の子孫を平らにして線で結び、ページのパターンを内包にする
  function flattenTree(): boolean {
    const root = rootBoxOf(world);
    if (!root) return false;
    const dir = treeDirOf(world);
    const subtree = [root, ...descendants(root)];
    // root の親の左上からの、本体の位置と大きさ（平らにすると、どの箱も本体だけの箱になる）
    const [rx, ry] = absPos(root);
    const bx = rx - root.x, by = ry - root.y;
    const head = new Map(subtree.map(n => {
      const [x, y] = absPos(n);
      return [n.id, { x: x - bx + n.hx, y: y - by + n.hy, w: n.hw, h: n.hh }];
    }));
    const half = opt.treeGapY / 2;
    const used = new Set([...edges.map(e => e.id), ...offEdges.map(e => String(e.id))]);
    let next = 1;
    const newId = () => { while (used.has("e" + next)) next++; used.add("e" + next); return "e" + next; };
    // 辺の真ん中の、ふち一周の割合（exitAt / enterAt に書く値）
    const rimAt = (r: { w: number; h: number }, side: "t" | "r" | "b" | "l") => {
      const box = { x: 0, y: 0, w: r.w, h: r.h };
      const p: [number, number] = side === "t" ? [r.w / 2, 0] : side === "b" ? [r.w / 2, r.h] : side === "l" ? [0, r.h / 2] : [r.w, r.h / 2];
      return perimeterAt(box, p);
    };
    const [exitSide, enterSide] = ({ down: ["b", "t"], up: ["t", "b"], right: ["r", "l"], left: ["l", "r"] } as const)[dir];
    const links: EdgeData[] = [];
    for (const p of subtree) {
      const pr = head.get(p.id)!;
      const belly = dir === "down" ? pr.y + pr.h + half : dir === "up" ? pr.y - half : dir === "right" ? pr.x + pr.w + half : pr.x - half;
      for (const c of p.children) {
        links.push({
          id: newId(), from: p.src.id!, to: c.src.id!,
          ...(routeDefaultOf(world) !== "elbow" ? { route: "elbow" as const } : {}),
          exitAt: rimAt(pr, exitSide), enterAt: rimAt(head.get(c.id)!, enterSide), via: [Math.round(belly)],
        });
      }
    }
    const rerouted = rerouteAround(root, subtree, head, bx, by);
    rebuildWith(data => {
      for (const d of data.edges ?? []) {
        if (Array.isArray(d) || !rerouted.has(String(d.id))) continue;
        const p = rerouted.get(String(d.id))!;
        for (const k of ["exitAt", "enterAt", "via"] as const) {
          if (p[k] == null) delete d[k]; else (d as Record<string, unknown>)[k] = p[k];
        }
      }
      for (const n of subtree) {
        const s = data.nodes.find(x => String(x.id) === n.id);
        if (!s) continue;
        // 根はページの最上位なので、子孫も同じページの最上位に（page はこのページ。無ければ最初のページ）
        delete s.parent;
        if (page != null) s.page = page; else delete s.page;
        const r = head.get(n.id)!;
        s.x = Math.round(r.x);
        s.y = Math.round(r.y);
        // ツリーの中で無視していた見せ方は、平らにすると意味が無くなるので消す（子を持たない箱になる）
        delete s.childView;
      }
      data.edges = [...(data.edges ?? []), ...links];
      // ページのパターンを内包に（根と向きも消す）
      const w = pageWorld(data, page);
      delete w.childView;
      delete w.root;
      delete w.treeDirection;
      return { select: root.id };
    });
    return true;
  }

  // 平らにすると、外から root につながっていた線は root の本体につながる。自動の道筋のままだと、元の枠の中（子孫の箱の間）を
  // 通ることがあるので、そのときは枠の中を通らない道を探し、両端の位置と via を固定して書く（手で直した形と同じく保たれる）。
  // 枠の中で通ってよいのは、root の本体から枠の外へまっすぐ出る通り道のうち、ほかの箱に掛からないものだけ。
  // 返すのは、書き換える線の id と、その線の exitAt / enterAt / via（null は消す）
  type EndsPatch = { exitAt: number | null; enterAt: number | null; via: number[] | null };
  function rerouteAround(root: Box, subtree: Box[], head: Map<string, Rect>, bx: number, by: number): Map<string, EndsPatch> {
    const out = new Map<string, EndsPatch>();
    const [fx, fy] = absPos(root);
    const F = { x: fx, y: fy, w: root.w, h: root.h };
    const abs = (r: Rect) => ({ x: r.x + bx, y: r.y + by, w: r.w, h: r.h });
    const H = abs(head.get(root.id)!);
    const others = subtree.filter(n => n !== root).map(n => abs(head.get(n.id)!));
    const region = framedAround(F, H, others);
    const inside = new Set(subtree);
    for (const e of edges) {
      const atA = e.a === root && !inside.has(e.b), atB = e.b === root && !inside.has(e.a);
      if (!atA && !atB) continue;
      const base = R.routeInputOf(e);
      if (!base.elbow) continue; // 直線は道を選べない
      // 枠に対して決めてあった root の側の端の位置と via は、本体には当てはまらないので捨てる
      const input: RouteInput = {
        ...base, via: null, memory: null,
        ...(atA ? { a: H, exitAt: null } : { b: H, enterAt: null }),
        obstacles: [...base.obstacles, ...others],
      };
      const reset: EndsPatch = { exitAt: input.exitAt ?? null, enterAt: input.enterAt ?? null, via: null };
      const drawn = route(input).points;
      if (!region.some(o => passes(drawn, o))) {
        if (base.via || (atA ? base.exitAt : base.enterAt) != null) out.set(e.id, reset);
        continue;
      }
      const best = pickCandidate(routeCandidates({ ...input, obstacles: [...base.obstacles, ...region] }));
      if (!best) { out.set(e.id, reset); continue; }
      const pts = best.points;
      out.set(e.id, {
        exitAt: perimeterAt(input.a, pts[0]!), enterAt: perimeterAt(input.b, pts[pts.length - 1]!), via: best.shape.via.map(Math.round),
      });
    }
    return out;
  }

  // ---- リストの並べ替え（docs/LIST-plan.md） ----

  // リストの子 n を兄弟の中で index 番目へ移し、並べ直して描く。並び順はデータの並び順（nodes の順）なので、
  // データでも、n を新しい次の兄弟の前（いなければ前の兄弟の後ろ）へ移す。
  // 図の箱（nodes）は今のページの箱だけで、データ（source.nodes）は全ページの箱なので、位置はそれぞれの配列で探す
  function reorder(n: Box, index: number) {
    const kids = n.parent!.children;
    const from = kids.indexOf(n);
    if (from < 0 || from === index) return;
    kids.splice(from, 1);
    kids.splice(index, 0, n);
    const next = kids[index + 1], prev = kids[index - 1];
    const move = <T>(list: T[], item: T, at: (list: T[]) => number) => {
      list.splice(list.indexOf(item), 1);
      list.splice(at(list), 0, item);
    };
    move(nodes, n, l => (next ? l.indexOf(next) : l.indexOf(prev!) + 1));
    move(source.nodes, n.src, l => (next ? l.indexOf(next.src) : l.indexOf(prev!.src) + 1));
    refitAncestors(n);
    render();
  }

  // ---- 削除と復活（docs/DELETE-plan.md） ----

  // n を子孫ごと消す。図は作り直さずにその場で外す（作り直すと、押し下げられた箱が本来いたい高さを忘れる）。
  // 今の位置を書いて removed の末尾へ移し、つながっていた線は捨てる。親は縮み（中身に合わせて伸びる祖先の
  // 大きさの指定は外す）、残った子は動かさない
  function remove(id: Id) {
    if (!byId.has(String(id))) return removeElsewhere(id);
    const n = nodeOf(id);
    if (n.isWorld) throw new Error(t("ワールドは消せません"));
    const gone = new Set([n, ...descendants(n)]);
    // データは今の位置を書いた写しで消し、消したものだけを移す（ほかのページにある子孫、つまりページの箱の中身も一緒に消える）。
    // 残る箱のデータは図の箱が参照しているので、入れ替えずに外すだけにする
    const out = api.toJSON();
    const { ids } = removeSubtree(out, n.id);
    source.removed = out.removed;
    source.nodes = source.nodes.filter(s => !ids.has(String(s.id)));
    offEdges = offEdges.filter(e => !ids.has(String(e.from)) && !ids.has(String(e.to)));
    nodes = nodes.filter(b => !gone.has(b));
    for (const b of gone) byId.delete(b.id);

    const parent = n.parent;
    if (parent) parent.children.splice(parent.children.indexOf(n), 1);
    else roots.splice(roots.indexOf(n), 1);
    n.el.remove();
    const cut = edges.filter(e => gone.has(e.a) || gone.has(e.b));
    for (const e of cut) e.el.remove();
    edges = edges.filter(e => !cut.includes(e));

    // 選んでいた箱や線が消えたら、ワールドを選び直す（消えた線の情報をサイドバーへ送らないように）
    if ((current && gone.has(current)) || (currentEdge && cut.includes(currentEdge))) select(null);
    unfocus();
    settle(SCENES.remove, parent ?? undefined);
    render();
    changed();
    notifySelect();
    opt.onEvent?.({ kind: "removed", key: keyOfBox(n), kids: gone.size - 1, cutEdges: cut.length });
    return true;
  }

  // ほかのページの箱を子孫ごと消す（一覧の × から）。描いていないので、データだけを直して組み立て直す。
  // 今描いているページの箱そのものを消したら、最初のページに戻る
  function removeElsewhere(id: Id) {
    const s = source.nodes.find(x => String(x.id) === String(id));
    if (!s) throw new Error(t("ボックスがありません: {id}", { id }));
    let gone = 0, cut = 0;
    rebuildWith(data => {
      const r = removeSubtree(data, id);
      [gone, cut] = [r.ids.size, r.cut];
      return {};
    });
    opt.onEvent?.({ kind: "removed", key: keyOf(s.id, captionOfData(s)), kids: gone - 1, cutEdges: cut });
    return true;
  }

  // 消したボックス id を、removed の中の子孫ごと parentId（null は最上位）の子に戻す。付け替えと同じく作り直す。
  // 位置: 内包（か子の無いボックス）の中や最上位なら at（親の中での位置）。ツリー・非表示の中なら自動で並べる。
  // at に置いてぶつかった相手は、ドラッグで手を離したときと同じく下へずらす。線は戻さない
  function restore(id: Id, parentId: Id | null, at?: { x: number; y: number }, byDrag = false) {
    const dest = target(parentId);
    if (!(source.removed ?? []).some(s => String(s.id) === String(id))) throw new Error(t("消したボックスにありません: {id}", { id }));
    if (refusePattern(patternOf(source, removedPageOf(source, id)))) return false;
    if (refuseKids(dest, subtreeIds(api.toJSON().removed ?? [], id).size - 1)) return false;
    const pos = dropPos(dest, at);
    const n = rebuildWith(data => {
      restoreSubtree(data, id, placeOf(dest), pos);
      return { select: String(id), drop: pos };
    })!;
    opt.onEvent?.({ kind: "restored", key: keyOfBox(n), byDrag });
    return true;
  }

  // ほかのブックの箱を子孫ごと、parentId（null は今のページの最上位）の子にコピーする（移植。docs/TABS-plan.md 4.3）。
  // id はこのブックで空いている番号に振り直し、線は写した箱どうしのものだけ持ってくる（線の id も振り直す）。
  // 位置の扱いは復活と同じ。写した箱の新しい id を返す
  function paste(copy: Subtree, parentId: Id | null, at?: { x: number; y: number }, from?: string) {
    const dest = target(parentId);
    if (refusePattern(copy.pattern ?? DEFAULT_VIEW)) return "";
    if (refuseKids(dest, copy.nodes.length - 1)) return "";
    const pos = dropPos(dest, at);
    let r!: ReturnType<typeof pasteSubtree>;
    const n = rebuildWith(data => {
      r = pasteSubtree(data, copy, placeOf(dest), pos);
      return { select: r.root, drop: pos };
    })!;
    opt.onEvent?.({ kind: "pasted", key: keyOfBox(n), from: from ?? null, kids: r.nodes - 1, edges: r.edges });
    return r.root;
  }

  // 新しい箱を足す（docs/ADD-plan.md）。足す所の決まりは復活と同じ（内包か子の無い箱の中、最上位なら押した位置、ツリー・非表示の中なら自動）。
  // リストへの差し込みは、データの並びで before の箱の前に入れる（無ければ末尾）。テーマや色は書かず、親から受け継ぐ
  function add(req: AddRequest, fields: Partial<BoxData>) {
    const dest = target(req.parentId);
    const pos = dropPos(dest, req.at);
    let id!: number;
    const n = rebuildWith(data => {
      id = addBox(data, fields, placeOf(dest), pos, req.before);
      return { select: String(id), drop: pos };
    })!;
    opt.onEvent?.({ kind: "added", key: keyOfBox(n) });
    return String(id);
  }

  // 消したボックス id を、消した子孫ごと完全に削除する（ユーザーが足した箱だけ。docs/ADD-plan.md の 4 章）。描いていないので、
  // データだけを直して組み立て直す（履歴に 1 件。Undo で戻せる）
  function purge(id: Id) {
    const s = (source.removed ?? []).find(x => String(x.id) === String(id));
    if (!s) throw new Error(t("消したボックスにありません: {id}", { id }));
    let count = 0;
    rebuildWith(data => {
      count = purgeRemoved(data, id);
      return current ? { select: current.id } : {};
    });
    opt.onEvent?.({ kind: "purged", key: keyOf(s.id, captionOfData(s)), kids: count - 1 });
    return true;
  }

  // サイドバーの一覧（ブック全体）。表示中の箱は、載っているページを添える（ページの箱の直下の子は、親を出さない）。
  // 消したボックスの親は、表示中か消したものの中から名前を引く
  function items(): Items {
    // 色の印は図で塗っている色（消したボックスは図に無いので、データから同じ決まりで求める）
    const paint = dataPaint(source, opt.color);
    const item = (id: Id, caption: string, s: BoxData, parent: string | null, p: string | null = null): ListItem =>
      ({ id: String(id), caption, color: paint(s), parent, page: p });
    const removed = source.removed ?? [];
    const removedCaption = new Map(removed.map(s => [String(s.id), s.caption != null ? String(s.caption) : String(s.id)]));
    const nameOf = (p: Id | undefined) => {
      if (p == null) return null;
      const live = byId.get(String(p));
      return live ? captionOf(live) : removedCaption.get(String(p)) ?? null;
    };
    return {
      ...liveItems(source, page, s => { const n = byId.get(String(s.id)); return n ? paintOf(n).color : paint(s); }),
      removed: removed.map(s => ({
        ...item(s.id!, removedCaption.get(String(s.id))!, s, nameOf(s.parent)), purgeable: canPurge(removed, s.id!),
        pattern: patternOf(source, removedPageOf(source, s.id!)),
      })),
    };
  }

  // 内包している子の幅や高さを、今いちばん小さい子に合わせてそろえる（layout/layout.ts の alignChildren）。
  // そろえた子の数を返す
  function fitChildren(id: Id, what: "width" | "height" | "both") {
    const n = nodeOf(id);
    if (n.isWorld) throw new Error(t("ワールドの子はそろえられません"));
    if (sizable(n).length < 2) return 0;
    let result = { count: 0, partial: false };
    settle(SCENES.fitChildren, n, () => { result = alignChildren(n, what, SCENES.fitChildren); });
    const { count, partial } = result;
    render();
    changed();
    notifySelect();
    opt.onEvent?.({ kind: "aligned", count, what, partial });
    return count;
  }

  // 決まった並べ方で整列できるのはページ（パターンがフローチャート）だけ
  const aligns = (c: Container) => c.isWorld && c.children.length > 0 && STRATEGIES[worldViewOf(c)].autoAlign;

  function setKidSize(size: Size) {
    const c = world;
    if (!aligns(c)) return false;
    if (!(SIZES as Record<string, unknown>)[size]) throw new Error(t("size の値が不正です: {where} ({value})", { where: "world", value: size }));
    // 箱のサイズを変えて測り直してから（サイズを選んだときと同じく、付いていた大きさの指定は外す）、そのサイズの間隔で整列する
    settle(SCENES.fitChildren, undefined, () => {
      c.src.kidSize = size;
      if (c.isWorld) storeWorld();
      for (const k of c.children) {
        k.src.size = size;
        setSpec(k, "w", 0);
        setSpec(k, "h", 0);
        applyStyle(k);
      }
    });
    return autoAlign();
  }

  function autoAlign() {
    const c = world;
    if (!aligns(c)) return false;
    settle(SCENES.fitChildren, undefined, () => L.alignKids(c));
    // 中の線は、端の固定と折れ目と、動かしていたときの辺の記憶を捨てて、並べ直した位置での一番よい形にする（2026-10-12 ユーザー:
    // 手で固定した端も外す）。分岐の形へ入る線は、上の頂点から入れる（layout/flow-align.ts の、横に置いた分岐へ上から入る形）
    const kids = new Set(c.children);
    const inner = edges.filter(e => kids.has(e.a) && kids.has(e.b));
    for (const e of inner) {
      delete e.src.exitAt; delete e.src.enterAt; delete e.src.via;
      e.memory = null; e.routeMemo = null;
    }
    render();
    for (const e of inner) {
      if (e.a === e.b || !shapeDef(shapeOf(e.b)).branch) continue;
      const b = R.routeInputOf(e).b;
      e.src.enterAt = perimeterAt(b, [b.x + b.w / 2, b.y]);
    }
    render();
    changed();
    notifySelect();
    return true;
  }

  // 追加モードで足す形とサイズ（道具入れの道具から入ったとき。startAdd。ヘッダーの追加ボタンなら null でボックス・M）
  let adding: { shape: Shape; size: Size } | null = null;
  function startAdd(shape: Shape, size: Size) {
    setMode("add");
    adding = { shape, size };
  }

  function setMode(m: Mode) {
    adding = null;
    I.endLift();
    I.unmarkRemove();
    mode = m;
    container.classList.toggle("mz-mode-move", m === "move");
    container.classList.toggle("mz-mode-reparent", m === "reparent");
    container.classList.toggle("mz-mode-remove", m === "remove");
    container.classList.toggle("mz-mode-add", m === "add");
    container.classList.toggle("mz-mode-pan", m === "pan");
    if (m !== "add") I.endAdd();
    L.holdWorld(false); // 箱を足す所を探す間に広げた図を、中身に合わせる
    for (const f of modeListeners) f(m);
  }
  const modeListeners = new Set<(m: Mode) => void>();

  // ---- 情報と変更 ----

  function nodeOf(id: Id | null): Container {
    if (id == null) return world;
    const n = byId.get(String(id));
    if (!n) throw new Error(t("ボックスがありません: {id}", { id }));
    return n;
  }

  // ---- テーマ（theme.ts、docs/THEME-plan.md） ----

  // 箱（null はワールド）に効いているテーマ。近い祖先から順にたどって最初に書かれたもの。無ければ描いているワールド、
  // ページならブック全体のワールド、それも無ければ default
  function themeOf(n: Box | null): Theme {
    for (let b: Box | null = n; b; b = b.parent) if (isTheme(b.src.theme)) return themeById(b.src.theme);
    if (isTheme(world.src.theme)) return themeById(world.src.theme);
    if (page != null && isTheme(source.world?.theme)) return themeById(source.world!.theme);
    return themeById(DEFAULT_THEME);
  }

  // 箱を塗る色と、それがデータの color から来たか（own）。決まりは theme.ts の paintFor
  function paintOf(n: Box): { color: string; own: boolean } {
    return paintFor(themeOf(n), n.src.color, isNesting(n), opt.color);
  }

  // 実際の背景の色。world.background はテーマの上の上書き。無ければテーマの背景
  function backgroundOf(): string | null {
    return world.src.background || themeOf(null).background || null;
  }

  // 書いてあるが知らないテーマの名前（無ければ null）
  const unknownTheme = (v: unknown) => (v != null && v !== "" && !isTheme(v) ? String(v) : null);

  // データ全体（ブック）にある、知らないテーマの名前。読み込んだときに知らせる
  function unknownThemes(): string[] {
    const found = new Set<string>();
    const add = (v: unknown) => { const u = unknownTheme(v); if (u) found.add(u); };
    add(source.world?.theme);
    for (const p of pagesOf(source)) add(p.world?.theme);
    for (const s of source.nodes) add(s.theme);
    return [...found];
  }

  const brief = (n: Box) => ({ id: n.id, caption: captionOf(n) });
  // 知らせに出す短いキー（長いキャプションでヘッダーが崩れないように）
  const keyOfBox = (n: Box) => keyOf(n.src.id, captionOf(n));

  function info(n: Container | null): NodeInfo {
    if (n == null || n.isWorld) {
      return {
        kind: "world", id: null, caption: t("ワールド"),
        x: 0, y: 0, w: Math.round(world.w), h: Math.round(world.h),
        children: roots.map(brief),
        links: [],
        overflow: overflowOf(world),
        overflows: [],
        background: world.src.background || null,
        backgroundPaint: backgroundOf(),
        theme: isTheme(world.src.theme) ? world.src.theme : null,
        themeUnknown: unknownTheme(world.src.theme),
        themeUsed: themeOf(null).id,
        route: routeDefaultOf(world),
        title: typeof source.world?.title === "string" && source.world.title ? source.world.title : null,
        childView: worldViewOf(world),
        views: PAGE_PATTERNS.filter(v => STRATEGIES[v].pick),
        viewsOff: patternsOff(),
        treeDirection: treeDirOf(world),
        canFlatten: canFlatten(),
        tools: toolHostOf(),
        canAlign: aligns(world),
        kidSize: kidSizeOf(world),
      };
    }
    const size = sizeOf(n);
    // 中身の扱いを選べるのは、文字を持つボックス（S 以外）だけ。子を持つ箱はつねに子に合わせて伸びる（docs/SIZE-plan.md）。
    // スティックマンは文字の置き方が決まっているので使わない
    const usesOverflow = !n.children.length && size !== "S" && shapeDef(shapeOf(n)).overflow && !lookOf(n).sharedSize;
    const out: BoxInfo = {
      kind: n.children.length ? "group" : "box",
      id: n.id,
      caption: captionOf(n),
      color: n.src.color ?? "",
      theme: isTheme(n.src.theme) ? n.src.theme : null,
      themeUnknown: unknownTheme(n.src.theme),
      themeUsed: themeOf(n).id,
      paint: paintOf(n).color,
      palette: PALETTE.map(name => ({ name, label: PALETTE_LABELS[name], color: themeOf(n).palette[name] })),
      fill: fillOf(n),
      border: borderOf(n),
      // リストの子は、見た目はリストの中でそろえたサイズで描くが、選ぶのは自分のサイズ（そろえる幅の候補になる）
      size: lookOf(n).sharedSize ? dataSizeOf(n) : size,
      shape: shapeOf(n),
      canShape: !isNesting(n) && !lookOf(n).plainShape && !isLinkBox(n),
      canClass: !lookOf(n).plainShape && !isLinkBox(n),
      body: typeof n.src.body === "string" ? n.src.body : "",
      canBody: canBody(n),
      bodyRule: n.src.bodyRule !== false,
      bodyLines: bodyLinesOf(n) || null,
      bodyWidth: bodyWidthOf(n) || null,
      inList: inList(n),
      sizableChildren: sizable(n).length,
      childView: viewOf(n),
      framed: isNesting(n),
      tools: toolHostOf(),
      inTree: inTreeOf(n),
      treeRoot: isTreeRoot(n),
      link: linkOf(n),
      previewSide: previewSideOf(n),
      rowSize: rowSizeOf(n),
      listHeight: Number(n.src.listHeight) > 0 ? Number(n.src.listHeight) : null,
      parent: n.parent ? brief(n.parent) : null,
      x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h),
      children: n.children.map(brief),
      links: incident(n).map(e => ({ edgeId: e.id, ...brief(other(e, n)) })),
      overflow: overflowOf(n),
      overflows: usesOverflow ? ["wrap", "clip"] : [],
      abstract: n.src.abstract === true,
      attrs: attrsOf(n.src).map(a => ({ ...a })),
      ops: opsOf(n.src).map(o => ({ ...o })),
    };
    return out;
  }

  // 見せ方を切り替える。内包での子の位置はデータに残し、内包へ戻したときに使う。ツリーは子孫全体を並べるので（docs/PATTERN-plan.md の 3.6 章）、
  // 子だけでなく、自由に置かれていた子孫の位置を残し、切り替えて自由に置かれるようになった子孫はデータの位置に戻す
  function setView(n: Box, view: BoxView) {
    const prev = viewOf(n);
    if (view === prev) return;
    const free = new Set(descendants(n).filter(inNest));
    for (const k of free) {
      k.src.x = Math.round(k.x);
      k.src.y = Math.round(k.y);
    }
    setOrDelete(n.src, "childView", view, view === DEFAULT_VIEW);
    for (const k of descendants(n)) {
      if (!inNest(k) || free.has(k)) continue;
      k.hasPos = Number.isFinite(k.src.x) && Number.isFinite(k.src.y);
      k.x = Number(k.src.x) || 0;
      k.y = Number(k.src.y) || 0;
      k.intendedY = k.y;
    }
  }

  // ページのパターンを変える（データの道。画面はページを作るときに決める。docs/PATTERN-plan.md）。箱の見せ方の切り替え（setView）と同じく、
  // 自由に置いていた箱の位置はデータに残し、内包に戻したときに使う。ツリーにするなら根が要る: 無ければ、子を持つ最上位の箱、無ければ最初の最上位の箱
  function setPattern(pattern: PagePattern) {
    const tree = STRATEGIES[pattern].descendants;
    const free = new Set(nodes.filter(inNest));
    for (const k of free) {
      k.src.x = Math.round(k.x);
      k.src.y = Math.round(k.y);
    }
    if (tree && !roots.some(r => r.id === String(world.src.root))) {
      const root = roots.find(r => r.children.length) ?? roots[0];
      if (!root) throw new Error(t("ツリーのページには根が要ります（最上位の箱が 1 つも無いのでツリーにできません）"));
      world.src.root = root.src.id;
    }
    if (!tree) { delete world.src.root; delete world.src.treeDirection; }
    setOrDelete(world.src, "childView", pattern, pattern === DEFAULT_VIEW); // 既定は書かない
    for (const k of nodes) {
      if (!inNest(k) || free.has(k)) continue;
      k.hasPos = Number.isFinite(k.src.x) && Number.isFinite(k.src.y);
      k.x = Number(k.src.x) || 0;
      k.y = Number(k.src.y) || 0;
      k.intendedY = k.y;
    }
  }

  // ページを足す（docs/TABS-plan.md。2026-10-12 ユーザー: ページはブックの子で、パターンは作るときに決める）。
  // id は "p" + 空いている番号。ツリーなら根の箱を 1 つ置き、world.root にする（根のキャプションはページの題名）。新しいページの id を返す
  function addPage(spec: { title?: string; world?: WorldData }): string {
    let id = "";
    rebuildWith(data => {
      const used = new Set(pagesOf(data).map(p => String(p.id)));
      let n = pagesOf(data).length + 1;
      while (used.has("p" + n)) n++;
      id = "p" + n;
      const world: WorldData = { ...(spec.world ?? {}) };
      const title = spec.title?.trim() ?? "";
      const pageEntry: PageData = { id, ...(title ? { title } : {}) };
      if (STRATEGIES[isPattern(world.childView) ? world.childView : DEFAULT_VIEW].descendants) {
        world.root = addBox(data, title ? { caption: title } : {}, { page: id }, DEFAULTS.rootAt);
      }
      if (Object.keys(world).length) pageEntry.world = world;
      data.pages = [...pagesOf(data), pageEntry];
      return {};
    });
    return id;
  }

  function updatePage(id: string | null, patch: PagePatch) {
    const { title, ...worldPatch } = patch;
    if (id != null && !pageData(source, id)) throw new Error(t("そのページはありません: {id}", { id }));
    checkSettings(worldPatch as Record<string, unknown>, "world", true);
    batch(() => {
      if (title !== undefined && id != null) {
        rebuildWith(data => {
          const p = pageData(data, id)!;
          const v = String(title ?? "").trim();
          if (v) p.title = v; else delete p.title;
          return {};
        });
      }
      if (!Object.keys(worldPatch).length) return;
      if (id === page) return update(null, worldPatch);
      rebuildWith(data => {
        const p = pageData(data, id);
        const w: WorldData = { ...(id == null ? data.world : p!.world) };
        for (const [k, v] of Object.entries(worldPatch)) {
          const dflt = (k === "route" && v === DEFAULT_ROUTE) || (k === "treeDirection" && v === "down") || (k === "paper" && v === DEFAULT_PAPER);
          if (v == null || v === "" || dflt) delete w[k]; else w[k] = v;
        }
        if (id == null) data.world = w;
        else if (Object.keys(w).length) p!.world = w;
        else delete p!.world;
        return {};
      });
    });
  }

  function updateClass(id: Id, edit: ClassEdit) {
    const n = nodeOf(id);
    if (n.isWorld) throw new Error(t("ワールドはクラスにできません"));
    let kids = 0;
    rebuildWith(data => {
      kids = applyClassEdit(data, n.id, edit).kids;
      return { select: n.id };
    });
    if (kids) opt.onEvent?.({ kind: "classKids", key: keyOfBox(byId.get(n.id) ?? n), kids });
  }

  function update(id: Id | null, patch: Patch) {
    const n = nodeOf(id);
    const next = { ...patch };
    checkSettings(next as Record<string, unknown>, n.isWorld ? "world" : n.id, n.isWorld);
    if (n.isWorld && next.overflow) throw new Error(t("ワールドには中身の扱いがありません"));
    if (!n.isWorld && !n.children.length && next.overflow === "grow") throw new Error(t("文字のボックスは伸ばせません"));
    if (!n.isWorld && n.children.length && next.overflow) throw new Error(t("子を持つボックスは、つねに子に合わせて伸びます"));
    if (n.isWorld && next.childView && (patternsOff() as string[]).includes(next.childView)) {
      throw new Error(t("子を持つ最上位の箱があるので、箱が子を持てないパターン（フローチャート）にはできません"));
    }
    if (!n.isWorld && next.treeDirection) throw new Error(t("treeDirection は箱には書けません（ツリーのページの world.treeDirection に書きます）: {where}", { where: n.id }));
    if ((next.linkLook || next.clip) && (n.isWorld || !isLinkBox(n))) throw new Error(t("linkLook と clip はリンクの箱（link のある箱）にだけ書けます: {where}", { where: n.isWorld ? "world" : n.id }));
    if (next.clip && !isRect(next.clip)) throw new Error(t("clip は { x, y, w, h } の四角（w と h は正の数）にしてください: {where}", { where: n.isWorld ? "world" : n.id }));

    // 大きさや見せ方が変わっても、線の角度と長さが変わらないよう位置を保つ（設定変更の場面）。
    // settle が保つ位置を覚えてから apply を呼ぶ
    const apply = () => {
      if (!n.isWorld) {
        // キャプションが空なら空の箱にし、色が空なら既定色に戻す
        if ("caption" in next) {
          setOrDelete(n.src, "caption", String(next.caption ?? ""), next.caption == null || String(next.caption) === "");
        }
        if ("body" in next) setOrDelete(n.src, "body", String(next.body ?? ""), !next.body);
        if ("bodyRule" in next) setOrDelete(n.src, "bodyRule", false, next.bodyRule !== false);
        if ("bodyLines" in next) setOrDelete(n.src, "bodyLines", next.bodyLines ?? undefined, next.bodyLines == null);
        if ("bodyWidth" in next) {
          const v = next.bodyWidth; // 値の誤りは checkSettings で断っている
          setOrDelete(n.src, "bodyWidth", v == null ? undefined : Math.round(v), v == null);
        }
        if ("width" in next) setSpec(n, "w", next.width ? Math.round(next.width) : 0);
        if ("color" in next) setOrDelete(n.src, "color", String(next.color ?? ""), !next.color);
        if ("theme" in next) setOrDelete(n.src, "theme", String(next.theme ?? ""), !next.theme);
        if ("fill" in next) n.src.fill = !!next.fill;
        if ("border" in next) n.src.border = !!next.border;
        if (next.size) {
          // サイズを選んだら、そのサイズで中身に合わせた大きさに戻す（付いていた大きさの指定を外す）
          n.src.size = next.size;
          setSpec(n, "w", 0);
          setSpec(n, "h", 0);
        }
        if (next.shape) setOrDelete(n.src, "shape", next.shape, next.shape === DEFAULT_SHAPE);
        if (next.linkLook) setOrDelete(n.src, "linkLook", next.linkLook, next.linkLook === DEFAULT_LINK_LOOK); // 値は checkSettings で確かめている
        if (next.previewSide) setOrDelete(n.src, "previewSide", next.previewSide, next.previewSide === "right");
        if (next.rowSize) setOrDelete(n.src, "rowSize", next.rowSize, next.rowSize === "M");
        if ("listHeight" in next) setOrDelete(n.src, "listHeight", next.listHeight == null ? undefined : Math.round(next.listHeight), next.listHeight == null); // D33
        if ("clip" in next) {
          const c = next.clip;
          setOrDelete(n.src, "clip", c ? { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) } : undefined, !c);
        }
        if (next.childView) setView(n, next.childView as BoxView); // 値は checkSettings で確かめている
      }
      if (next.overflow && next.overflow !== overflowOf(n)) {
        // 文字のボックスのキャプションを 1 行にする（clip）か戻す（wrap）。幅の上限はサイズの最大（幅の指定があればその幅）なので、
        // 大きさの指定は書かない（docs/SIZE-plan.md の 5 章）。既定の wrap はデータから消す
        setOrDelete(n.src, "overflow", next.overflow, next.overflow === "wrap");
      }
      if (n.isWorld) {
        if ("title" in next) {
          // 題名はブック全体のもの。ページを見ていても、ブック全体の world に書く
          const title = String(next.title ?? "").trim();
          const top = page != null ? (source.world ??= {}) : world.src;
          setOrDelete(top, "title", title, !title);
          if (page != null && !Object.keys(top).length) delete source.world;
        }
        if ("background" in next) setOrDelete(world.src, "background", String(next.background ?? ""), !next.background);
        // 紙の型（D33）。大きさが変わるので、このあとの syncWorld で測り直す。小さくして箱がはみ出すなら、changed の refuseOverPaper が断る
        if ("paper" in next) setOrDelete(world.src, "paper", String(next.paper ?? ""), !next.paper || next.paper === DEFAULT_PAPER);
        if (next.childView) setPattern(next.childView as PagePattern); // 値は checkSettings で確かめている
        if (next.treeDirection) setOrDelete(world.src, "treeDirection", next.treeDirection, next.treeDirection === "down");
        if ("theme" in next) setOrDelete(world.src, "theme", String(next.theme ?? ""), !next.theme);
        if ("route" in next) {
          if (next.route != null && !(ROUTES as readonly string[]).includes(next.route)) throw new Error(t("route の値が不正です: {v}", { v: next.route }));
          setOrDelete(world.src, "route", next.route ?? undefined, next.route == null || next.route === DEFAULT_ROUTE);
        }
        storeWorld();
        syncWorld();
        applyWorldStyle();
        // テーマは全部の箱に効く（書いていない箱は受け継ぐ）。ページのパターンや向きが変われば、箱の見た目（ツリーの枠など）が変わる
        if ("theme" in next || next.childView || next.treeDirection) nodes.forEach(applyStyle);
      } else {
        applyStyle(n);
        // テーマは子孫も受け継ぐ。子の見せ方を変えたら、子孫の見た目も変わる（リストの子は、子を持てば非表示の扱いで、
        // 枠ではなく文字の箱として描き、その子は隠す。リストから戻せば元の見た目）
        // 縮図の位置（リスト。D13）を変えると、子の見た目（縮図の左右、出さないなら枠に戻す）が変わる
        if ("theme" in next || next.childView || next.previewSide || next.rowSize) descendants(n).forEach(applyStyle);
      }
    };
    // ページのパターンや向きを変えると、大きさが変わるのはツリーの根（これからなる箱も含む）なので、根の位置を保つ
    const treeRoot = () => rootBoxOf(world) ?? (next.childView && STRATEGIES[next.childView].descendants ? roots.find(r => r.children.length) ?? roots[0] : undefined);
    const anchor = n.isWorld ? (next.childView || next.treeDirection ? treeRoot() : undefined) : n;
    settle(SCENES.settings, anchor, apply);
    render();
    // 選択中のボックスが非表示になったら、隠した親を選び直す
    if (current && isHidden(current)) select(n.isWorld ? null : n);
    changed();
    notifySelect();
  }

  // ---- ページ ----

  // ワールドの設定を、今のページの持ち主（ファイルの world か、pages のページ）へ書き戻す。ページの world は空なら項目ごと消す
  function storeWorld() {
    const p = pageData(source, page);
    if (p) {
      if (!Object.keys(world.src).length) delete p.world;
      else p.world = world.src;
    } else {
      source.world = world.src;
    }
  }

  // ---- 読み込み ----

  function clear() {
    for (const n of roots) n.el.remove();
    svg.replaceChildren();
    nodes = [];
    roots = [];
    byId = new Map();
    edges = [];
    I.reset();
    currentEdge = null;
    current?.el.classList.remove("mz-current");
    current = null;
  }

  function buildNode(src: BoxData): Box {
    const el = document.createElement("div");
    el.className = "mz-node";
    el.dataset.id = String(src.id); // 外から箱を特定するため（実際のブラウザのテストなど）
    const head = document.createElement("div");
    head.className = "mz-head";
    const textEl = document.createElement("div");
    const moreEl = document.createElement("span");
    moreEl.className = "mz-more";
    moreEl.textContent = "▼";
    const shapeSvg = document.createElementNS(SVGNS, "svg");
    shapeSvg.setAttribute("class", "mz-shape");
    shapeSvg.setAttribute("aria-hidden", "true");
    const bodyEl = document.createElement("div");
    bodyEl.className = "mz-body";
    bodyEl.hidden = true;
    const classEl = document.createElement("div");
    classEl.className = "mz-class";
    classEl.hidden = true;
    const gripEl = document.createElement("div");
    gripEl.className = "mz-body-grip";
    gripEl.title = t("ドラッグで本文の幅を変える（ダブルクリックで元に戻す）");
    gripEl.hidden = true;
    // リストの幅のつまみ（リストの右の縁。docs/SIZE-plan.md の 10 章）
    const widthGripEl = document.createElement("div");
    widthGripEl.className = "mz-width-grip";
    widthGripEl.title = t("ドラッグでリストの幅を変える（ダブルクリックで元に戻す）");
    widthGripEl.hidden = true;
    // スクロールにしたリストの高さの上限のつまみ（下の縁。D33）
    const heightGripEl = document.createElement("div");
    heightGripEl.className = "mz-height-grip";
    heightGripEl.title = t("ドラッグでリストの高さの上限を変える（超えた分はリストの中でスクロール）");
    heightGripEl.hidden = true;
    // リンクの箱の部品（link-box.ts）: 持ち手の帯（パターンの札を持つ）と窓。リンクの箱のときだけ出す（render.ts）
    const linkEl = document.createElement("div");
    linkEl.className = "mz-link-parts";
    linkEl.hidden = true;
    const linkBar = document.createElement("div");
    linkBar.className = "mz-link-bar";
    const linkBadge = document.createElement("span");
    linkBadge.className = "mz-link-badge";
    linkBar.appendChild(linkBadge);
    const linkWin = document.createElement("div");
    linkWin.className = "mz-link-win";
    const linkArt = document.createElementNS(SVGNS, "svg");
    linkArt.setAttribute("class", "mz-link-art");
    linkArt.setAttribute("aria-hidden", "true");
    const linkGo = document.createElement("span");
    linkGo.className = "mz-link-go";
    linkWin.append(linkArt, linkGo);
    linkEl.append(linkBar, linkWin);
    head.append(shapeSvg, textEl, classEl, bodyEl, gripEl, widthGripEl, heightGripEl, moreEl, linkEl);
    const treeSvg = document.createElementNS(SVGNS, "svg");
    treeSvg.setAttribute("class", "mz-tree");
    const treePath = document.createElementNS(SVGNS, "path");
    const treeFrame = document.createElementNS(SVGNS, "rect");
    treeFrame.setAttribute("class", "mz-tree-frame");
    treeFrame.setAttribute("x", "0.75");
    treeFrame.setAttribute("y", "0.75");
    treeFrame.setAttribute("rx", "10");
    treeSvg.append(treeFrame, treePath);
    el.append(treeSvg, head);
    const n: Box = {
      isWorld: false,
      world,
      src,
      id: String(src.id),
      parent: null,
      children: [],
      specW: Number(src.width) || 0,
      specH: Number(src.height) || 0,
      x: Number(src.x) || 0,
      y: Number(src.y) || 0,
      w: 0, h: 0, hx: 0, hy: 0, hw: 0, hh: 0,
      hasPos: Number.isFinite(src.x) && Number.isFinite(src.y),
      intendedY: Number(src.y) || 0,
      intendedCX: NaN,
      capW: 0,
      listW: 0, kidsTop: 0, fullH: 0, kidsEl: null,
      out: null,
      bodyH: 0,
      el, head, textEl, bodyEl, classEl, gripEl, widthGripEl, heightGripEl, moreEl, shapeSvg, treeSvg, treePath, treeFrame, linkEl, linkBadge, linkWin, linkArt,
    };
    boxOfEl.set(el, n);
    return n;
  }

  // 読み込み直後のはみ出しの調整（fitToViewport）は、最初に開いたときだけ行う。
  // 外部（LLM など）の変更の読み直しでは行わない。行うと、ファイルの位置と画面の位置がずれていくため
  function load(newData: unknown, o: { keepHistory?: boolean; version?: string } = {}) {
    const copy: unknown = newData == null ? newData : JSON.parse(JSON.stringify(newData));
    if (o.keepHistory) keepShownPositions(copy);
    else fitted = new Map();
    // 消える箱の、今の場所（消した箱の認知は、消す前の場所が見えたとき）
    const before = o.keepHistory ? new Map(nodes.map(n => { const [x, y] = absPos(n); return [n.id, { page, rect: { x, y, w: n.w, h: n.h } }]; })) : null;
    // 外部の変更の読み直しでは、選んでいる箱や線を保つ（残っていれば。Undo と同じ）。LLM が図を書き換えるたびに
    // 選択が外れると、サイドバーで入力中の内容も消えてしまうため（docs/REVIEW-2026-10-09.md の B10）
    const keep = o.keepHistory ? { box: current?.id ?? null, edge: currentEdge?.id ?? null } : undefined;
    build(copy, !o.keepHistory, keep);
    const unknown = unknownThemes();
    if (unknown.length) opt.onEvent?.({ kind: "unknownTheme", names: unknown });
    // 外部の変更（LLM）はユーザーの履歴に積まず、見ていない変更として覚える。読み込み直しは出発点にする
    if (o.keepHistory) {
      const op = H.external();
      if (op) {
        const t = touchedOf(op.changes);
        unseen.push({
          op, version: o.version ? o.version.replace(/^W\//, "").replace(/"/g, "") : null, nodes: t.nodes, pages: t.pages, whole: t.whole,
          removed: [...t.removed.keys()].flatMap(id => { const b = before?.get(id); return b ? [b] : []; }),
        });
        setTimeout(checkSeen, 0); // 描いてから
      }
    } else {
      H.reset();
      unseen = [];
    }
  }

  // 見ていない LLM の変更のうち、見えたものを認知する（読み込み・スクロール・大きさの変化・ページの切り替え・拡大縮小のあと）
  function checkSeen() {
    if (!unseen.length || destroyed || !container.getClientRects().length) return; // 裏のブック（隠れている）は見えていない
    const c = container.getBoundingClientRect();
    const view = { left: c.left + container.clientLeft, top: c.top + container.clientTop, right: 0, bottom: 0 };
    view.right = view.left + container.clientWidth;
    view.bottom = view.top + container.clientHeight;
    const hits = (r: { left: number; top: number; right: number; bottom: number }) =>
      r.right > view.left && r.left < view.right && r.bottom > view.top && r.top < view.bottom;
    const w = worldEl.getBoundingClientRect();
    const seen = (u: Unseen) => u.whole || u.pages.has(page)
      || [...u.nodes].some(id => {
        const n = byId.get(id);
        // スクロールしているリスト（D33）の中の子は、リストの枠の中に見えているときだけ（隠れた所は画面の上でも枠の外）
        const r = n?.head.getBoundingClientRect();
        return !!n && !!r && !isHidden(n) && n.el.getClientRects().length > 0 && hits(r)
          && ancestors(n).every(a => !a.kidsEl || (() => { const k = a.kidsEl!.getBoundingClientRect(); return r.bottom > k.top && r.top < k.bottom; })());
      })
      || u.removed.some(r => r.page === page && hits({
        left: w.left + r.rect.x * applied, top: w.top + r.rect.y * applied,
        right: w.left + (r.rect.x + r.rect.w) * applied, bottom: w.top + (r.rect.y + r.rect.h) * applied,
      }));
    const now = unseen.filter(seen);
    if (!now.length) return;
    unseen = unseen.filter(u => !now.includes(u));
    for (const u of now) {
      H.adopt(u.op);
      if (u.version) opt.onLLMSeen?.(u.version);
    }
  }
  container.addEventListener("scroll", () => checkSeen(), { passive: true });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => checkSeen()).observe(container);

  // 外部の変更を読み直すとき、画面にだけある位置（保存されない）を使う。使わないと読み直すたびに動いてしまう。
  // - 開いたときのはみ出しの調整（fitToViewport）で移した箱は、ファイルの位置が移したときのままなら、移した先に置く
  //   （ユーザーが触る前に LLM が set すると、関係の無い箱がデータの位置へ飛んでいた。docs/DIST-TRIAL.md。2026-10-10 ユーザー）。
  //   今の位置ではなく移した先にするのは、そのあと押し下げられた分（データから計算し直せる）まで残さないため
  // - 位置の無い箱は、直前まで同じ親の中に描いていた位置（LLM が位置を書かずに箱を足したとき、見ている配置が変わらないように。2026-10-03 ユーザー）。
  //   自由に置ける箱（最上位と内包の子）だけ。ツリーの子の位置は自動なので使わない（使うと内包に戻したときの位置になってしまう）
  function keepShownPositions(data: unknown) {
    if (!data || typeof data !== "object" || !Array.isArray((data as Diagram).nodes)) return;
    const shown = new Map(nodes.filter(n => inNest(n)).map(n => [n.id, n]));
    for (const s of (data as Diagram).nodes) {
      if (!s || typeof s !== "object" || s.id == null) continue;
      const k = posKey(s);
      if (k) {
        const f = fitted.get(String(s.id));
        if (!f) continue;
        if (f.file !== k || s.parent != null || (s.page == null ? null : String(s.page)) !== page) { fitted.delete(String(s.id)); continue; }
        s.x = f.x;
        s.y = f.y;
        continue;
      }
      const n = shown.get(String(s.id));
      // 同じ所（同じ親の中か、同じページの最上位）に描いていた箱だけ
      const samePlace = n && (n.parent ? n.parent.id === String(s.parent) : s.parent == null && (s.page == null ? null : String(s.page)) === page);
      if (!samePlace) continue;
      s.x = Math.round(n.x);
      s.y = Math.round(n.y);
    }
  }

  // データを検証して描き直す。fit は読み込み直後のはみ出しの調整をするか
  // keep は組み立て直したあとに選び直す箱か線の id（残っていれば。無ければワールドを選ぶ）。途中でワールドを選ばずに
  // 直接選ぶ（いったんワールドを選ぶと、サイドバーの情報タブが切り替わって、入力中の内容が消えるため）
  function build(copy: unknown, fit: boolean, keep?: { box: string | null; edge: string | null }) {
    buildAll(copy, fit, keep);
    worldEl.classList.toggle("mz-paper", !!paperOf()); // 紙の見た目（graph-style.ts。D33）
    outsideKnown = outsideNow(); // 読み込んだときから紙の外にある箱（LLM の書いた位置）は、操作を断る理由にしない
  }

  // ---- プレビュー ----

  // 倍率は transform: scale でかける（文字の並び方を変えないので、組み直すときに外さなくてよい。D32）。
  // スクロールできる広さは、見えない入れ物（canvasEl）を syncWorld が倍率に合わせて決める
  function applyZoom(z: number) {
    applied = z;
    worldEl.style.transform = z === 1 ? "" : `scale(${z})`;
    syncWorld();
    if (unseen.length) setTimeout(checkSeen, 0); // 拡大縮小で見えた LLM の変更（D31）
  }

  function setPreview(z: number | null) {
    preview = z;
    container.classList.toggle("mz-preview", z != null);
    applyZoom(z ?? editZoom);
    checkSeen();
  }

  // ワールドの左上を表示領域の左上に合わせる（スクロールの位置 = 余白。D32）。隠れている図（裏のブック）はスクロールできないので、
  // 見えるようになったときに合わせる（下の ResizeObserver）
  let homed = false;
  let homeAt: { left: number; top: number } | null = null; // 合わせたスクロールの位置（そのまま動いていなければ、紙の大きさが変わったとき合わせ直す）
  function home() {
    homed = container.clientWidth > 0;
    if (!homed) return;
    // 紙が表示領域より大きければワールドの左上を表示領域の左上に、小さければ真ん中に（ずらす量が真ん中の分を含むので、その分戻す）
    const v = api.view();
    container.scrollLeft = Math.max(0, v.ox - Math.max(0, (container.clientWidth - world.w * v.zoom) / 2));
    container.scrollTop = Math.max(0, v.oy - Math.max(0, (container.clientHeight - world.h * v.zoom) / 2));
    homeAt = { left: container.scrollLeft, top: container.scrollTop };
  }
  // 開いた直後に紙の型が決まる（既定の紙で合わせたあと、データの紙に替わる）ときのため、合わせたまま動いていなければ合わせ直す
  function rehome() {
    if (!homeAt) return;
    if (container.scrollLeft !== homeAt.left || container.scrollTop !== homeAt.top) { homeAt = null; return; }
    home();
  }
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { if (!homed) home(); }).observe(container);

  // 編集中の倍率（D32）
  let editZoom = 1;
  function setZoom(z: number) {
    editZoom = z;
    if (preview == null) applyZoom(z);
  }

  // 見る範囲を動かす（つかんだ所がポインタに付いてくる）。プレビューの背景のドラッグと、手のひら（D32）
  function pan(e: PointerEvent) {
    const start = { x: e.clientX, y: e.clientY, left: container.scrollLeft, top: container.scrollTop };
    const stop = new AbortController();
    container.classList.add("mz-panning");
    document.addEventListener("pointermove", ev => {
      container.scrollLeft = start.left - (ev.clientX - start.x);
      container.scrollTop = start.top - (ev.clientY - start.y);
    }, { signal: stop.signal });
    const end = () => { stop.abort(); container.classList.remove("mz-panning"); };
    document.addEventListener("pointerup", end, { signal: stop.signal });
    document.addEventListener("pointercancel", end, { signal: stop.signal });
  }

  // 手のひらのモードの押下（D32）。図の操作（interaction.ts）より先に受け取り、どこを押しても見る範囲を動かすだけにする
  // （箱を選んだり動かしたりしない）。道具箱は押せる
  container.addEventListener("pointerdown", e => {
    if (mode !== "pan" || preview != null) return;
    if (e.target instanceof Element && e.target.closest(".mz-toolbox")) return;
    e.stopImmediatePropagation();
    e.preventDefault(); // 文字を選ばない
    if (e.button === 0) pan(e);
  }, true);

  // プレビュー中の押下。図の操作（interaction.ts）より先に受け取り、選ぶだけにする。
  // 背景を押したらワールドを選び、そのままドラッグすると見る範囲を動かす
  container.addEventListener("pointerdown", e => {
    if (preview == null) return;
    e.stopImmediatePropagation();
    const t = e.target instanceof Element ? e.target : null;
    const edgeEl = t?.closest(".mz-edge");
    const edge = edgeEl ? edgeOfEl.get(edgeEl) : undefined;
    if (edge) return selectEdge(edge);
    const nodeEl = t?.closest(".mz-node");
    const n = nodeEl ? boxOfEl.get(nodeEl) : undefined;
    if (n) return select(n);
    select(null);
    if (e.button === 0) pan(e);
  }, true);

  function buildAll(copy: unknown, fit: boolean, keep?: { box: string | null; edge: string | null }) {
    assignIds(copy);
    validate(copy);
    clear();
    source = copy;
    // 描いていたページが無くなっていたら（Undo や外部の変更で）、最初のページに戻る
    if (page != null && !pageData(source, page)) page = null;
    world.src = pageWorld(source, page);
    syncWorld();
    applyWorldStyle();

    const shown = new Set(pageMembers(source.nodes, page));
    nodes = source.nodes.filter(s => shown.has(String(s.id))).map(buildNode);
    byId = new Map(nodes.map(n => [n.id, n]));
    for (const n of nodes) {
      n.parent = n.src.parent != null ? byId.get(String(n.src.parent)) ?? null : null;
      if (n.parent) n.parent.children.push(n);
      else roots.push(n);
    }

    // 親子構造に合わせて DOM も入れ子にする（子は本体より手前に来る）
    for (const n of nodes) (n.parent ? n.parent.el : worldEl).appendChild(n.el);
    nodes.forEach(applyStyle);
    worldEl.appendChild(svg); // 線をボックスより手前に

    const raw = (source.edges ?? []).map(normalizeEdge);
    const used = new Set(raw.map(e => e.id).filter(id => id != null).map(String));
    let seq = 1;
    offEdges = [];
    for (const src of raw) {
      if (src.id == null) {
        while (used.has("e" + seq)) seq++;
        src.id = "e" + seq;
        used.add(src.id);
      }
      // 線は同じ親どうしなので、両端とも今のページにあるか、両端ともほかのページにある
      const a = byId.get(String(src.from)), b = byId.get(String(src.to));
      if (a && b) addEdge(src, a, b);
      else offEdges.push(src);
    }
    source.edges = raw;

    settle(fit ? SCENES.open : SCENES.reload);
    render();
    const keptEdge = keep?.edge != null ? edges.find(e => e.id === keep.edge) : undefined;
    if (keep?.box != null && byId.has(keep.box)) select(byId.get(keep.box)!);
    else if (keptEdge) selectEdge(keptEdge);
    else select(null);
    opt.onBuild?.();
    dataChanged();
  }


  // ワールドの大きさが指定されていなければ、表示領域に合わせて追従する。紙（D33）のページも、スクロールできる広さは表示領域で変わるので測り直す。
  // ここでボックスを動かすと、スクロールバーの出入りで大きさが変わり続けるので動かさない
  const ro = new ResizeObserver(() => syncWorld());
  ro.observe(container);

  const api: Graph = {
    load,
    undo: () => preview == null && step(H.undo),
    redo: () => preview == null && step(H.redo),
    history: () => H.state(),
    select(id) { select(id == null ? null : nodeOf(id) as Box); },
    reveal(id) { const n = nodeOf(id); if (!n.isWorld) reveal(n); },
    selected: () => (current ? current.id : null),
    selectedEdge: () => currentEdge?.id ?? null,
    selectEdge: id => selectEdge(edgeOf(id)),
    updateEdge: (id, patch) => updateEdge(edgeOf(id), patch),
    edgeInfo: id => { const e = edges.find(x => x.id === String(id)); return e ? edgeInfo(e) : null; },
    alignEdge: id => alignEdge(edgeOf(id)),
    batch,
    removeEdge: id => removeEdge(edgeOf(id)),
    link: (from, to) => {
      const a = byId.get(String(from)), b = byId.get(String(to));
      return !!a && !!b && link(a, b);
    },
    info: id => info(id == null ? null : nodeOf(id)),
    update,
    updateClass,
    flattenTree,
    autoAlign,
    setKidSize,
    // 現在の状態を返す（元データにある他の項目はそのまま残す）
    toJSON() {
      const out: Diagram = JSON.parse(JSON.stringify(source));
      for (const src of out.nodes) {
        const n = byId.get(String(src.id));
        // ほかのページの箱はそのまま。ツリーや非表示の子は自動配置なので、内包のときの位置を残す
        if (!n || !inNest(n)) continue;
        src.x = Math.round(n.x);
        src.y = Math.round(n.y);
      }
      // 線は読み込んだときの並びを保ち、ほかのページの線はそのまま残す。消した線は外し、足した線は後ろに付ける
      const drawn = new Map(edges.map(e => [e.id, { ...e.src, id: e.id, from: e.a.src.id!, to: e.b.src.id! }]));
      const off = new Set(offEdges);
      const list: EdgeData[] = [];
      for (const e of (source.edges ?? []) as EdgeData[]) {
        if (off.has(e)) list.push(JSON.parse(JSON.stringify(e)));
        else if (drawn.has(String(e.id))) { list.push(drawn.get(String(e.id))!); drawn.delete(String(e.id)); }
      }
      out.edges = [...list, ...drawn.values()];
      return out;
    },
    dragging: () => I.dragging(),
    setMode,
    startAdd,
    onDataChange(f) {
      dataListeners.add(f);
      return () => dataListeners.delete(f);
    },
    onModeChange(f) {
      modeListeners.add(f);
      return () => modeListeners.delete(f);
    },
    mode: () => mode,
    reparent,
    fitChildren,
    remove,
    restore,
    items,
    setPage(id) {
      const next = id == null ? null : String(id);
      if (next === page) return;
      if (next != null && !pageData(source, next)) throw new Error(t("ページがありません: {id}", { id }));
      const data = api.toJSON();
      captureScene(data); // 離れるページの縮図を覚える（リンクの箱の窓に映す）
      page = next;
      build(data, true);
      home(); // 新しいページは、ワールドの左上から見せる（D32）
      notifySelect();
      setTimeout(checkSeen, 0); // そのページの見ていない LLM の変更（D31）
    },
    page: () => page,
    pageScene,
    redraw: () => { nodes.filter(n => isLinkBox(n) || listPreviewOf(n)).forEach(applyStyle); render(); }, // 窓と縮図の行の絵は applyStyle で描く
    linkScene: id => windowScene(nodeOf(id) as Box),
    paste,
    add,
    purge,
      pages: () => pagesOf(source).map(p => ({ id: String(p.id), caption: pageNameOf(source, String(p.id)) })),
    addPage,
    updatePage,
    geometry() {
      // スクロールしているリスト（D33）の子は、リストの枠の中に見えている分だけ入れ、スクロールした分だけ上にずらす
      const shownInLists = (n: Box): { dy: number; shown: boolean } => {
        let dy = 0, c = n;
        for (const a of ancestors(n)) {
          if (a.kidsEl) {
            const top = a.kidsTop + a.kidsEl.scrollTop, bottom = top + (a.h - a.kidsTop);
            if (c.y + c.h <= top || c.y >= bottom) return { dy, shown: false };
            dy -= a.kidsEl.scrollTop;
          }
          c = a;
        }
        return { dy, shown: true };
      };
      const boxes = nodes.filter(n => !isHidden(n) && shownInLists(n).shown).map(n => {
        const [x, y0] = absPos(n);
        const y = y0 + shownInLists(n).dy;
        const scroll = n.kidsEl ? { shown: n.children.filter(k => shownInLists(k).shown).length, total: n.children.length } : null;
        return {
          ...(scroll ? { scroll } : {}),
          id: n.id, caption: captionOf(n), ancestors: ancestors(n).map(p => p.id),
          x, y, w: n.w, h: n.h, cut: displayCaption(n) !== captionOf(n), color: paintOf(n).color, fill: fillOf(n), border: borderOf(n),
          ...(n.children.length ? { view: viewOf(n), kids: n.children.length } : {}),
          ...(isTreeRoot(n) || inTreeOf(n) ? { head: { x: x + n.hx, y: y + n.hy, w: n.hw, h: n.hh } } : {}),
        };
      });
      const treeLines = nodes.filter(n => !isHidden(n) && n.children.length && (isTreeRoot(n) || inTreeOf(n))).flatMap(n => {
        const [x, y] = absPos(n);
        return treeLinesOf(n, opt.treeGapY).map(seg => seg.map(([px, py]) => [x + px, y + py] as [number, number]));
      });
      // 線の点の並びは、矢印の分を縮める前のもの（見える線は、矢印のある端で短くしている）
      const shown = edges.filter(e => e.el.style.display !== "none");
      return {
        viewport: L.viewport(), // 倍率をかけないときの広さ（LLM への配置の要約。D32・D33）
        paper: paperOf(),
        outside: [...outsideNow()],
        boxes,
        treeLines,
        edges: shown.map(e => {
          const out: GeoEdge = { id: e.id, a: e.a.id, b: e.b.id, points: e.points.map(p => [...p] as [number, number]) };
          // キャプションの札の範囲（ワールドの座標）。描かれていて大きさが分かるときだけ
          const text = e.labelEl?.querySelector("span");
          if (text && typeof e.src.caption === "string") {
            const sr = text.getBoundingClientRect(), wr = worldEl.getBoundingClientRect(), z = applied;
            out.caption = e.src.caption;
            if (sr.width) out.label = { x: (sr.left - wr.left) / z, y: (sr.top - wr.top) / z, w: sr.width / z, h: sr.height / z };
          }
          return out;
        }),
      };
    },
    setPreview,
    setZoom,
    zoom: () => editZoom,
    preview: () => preview,
    view: () => ({ zoom: applied, margin: opt.margin, ox: L.offset().x, oy: L.offset().y }),
    paper: paperOf,
    home,
    contentSize() {
      let w = 0, h = 0;
      for (const r of roots) {
        w = Math.max(w, r.x + r.w + opt.padding);
        h = Math.max(h, r.y + r.h + opt.padding);
      }
      return { w, h };
    },
    destroy() {
      destroyed = true;
      measurer.dispose();
      I.endLift();
      ro.disconnect();
      I.destroy();
      clear();
      worldEl.remove();
      container.classList.remove("mz-stage");
    },
  };

  load(data);
  return api;
}
