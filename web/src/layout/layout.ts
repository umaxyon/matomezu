// 配置: 重なりの判定と直し方、読み込み時の配置。節点ごとの大きさの決め方とツリーの並べ方は node-kinds.ts。
// 状態（ボックスや線の一覧）は ctx から読む。
//
// 大きさが変わったとき（設定変更、追加・貼り付け・付け替え・戻す、箱を消す、本文の幅・リストのつまみ）は、regrow が統一した決まり
// （docs/PAPER-plan.md の 4.6）で並べ直す: ページの起点から広がり、ぶつかる相手は同じ向きにだけ押し（折り返さない）、縮めば押した相手は
// 本来いたい位置（intendedX・intendedY）へ戻り、紙に収まらなければ断る。判定は squeeze.ts の canSqueeze。
// 開いたとき・読み直し・Undo も同じ決まり（D45。2026-10-19 ユーザー）: データの大きさを前の状態として regrow で押す（settleFromData）。
// 紙の外にある箱（ファイルに書かれた位置）もここで押し込み、収まらなければそのファイルを開かない（fitPaper。4.6 の 7）。
// 文字の箱が同じ段の右の大きい兄弟にぶつかるなら、押す前にその手前で折り返す（fitToRow。regrow の中で、どの場面でも）。
//
// 子のサイズをそろえる・ドラッグで手を離したときに重なりが残っていたときは、settle が
// 場面ごとの設定値（policy.ts の SCENES）に従って決め直す。場面ごとの違い（誰が動くか、子を詰め直す向き、
// はみ出しを調整するか、置いた位置を本来いたい位置にするか）は SCENES の 1 行の値の差。
// 設定を変える処理（子のサイズをそろえるときは alignChildren）は apply として settle に渡す。
//
// SCENES の外にある決まり（どの場面でも同じか、表の値では表せない手順のもの）:
//   - ぶつかった相手は、同じ x のまま下へ、相手の端のちょうど gap 先へずらす（placeGroup + spotBelow + slide）
//   - 位置の無い箱は、最上位なら円形に並べてから近くの空きへ（placeAutoRoots + findFreeSpot）、グループの中なら左上から格子状に空きを探す（findGridSpot）
//   - 押し下げられた箱は本来いたい位置を変えない。上が空いたら、次の regrow で本来いたい位置へ戻る（戻すのは regrow だけ。D48）
//   - 本来いたい位置（intendedX・intendedY）を決めるのは土台だけ（adoptMoved・markPlaced・fromPrior。D48）。操作の側は箱を動かすだけ
//   - 開いたとき・読み直しでも押せずに残った重なり（大きさの分からない箱、前から重なっていた組）は、下へずらす（settleFromData の最後の段）
//   - ツリーとリストの子の並べ方は node-kinds.ts（子の位置は自分では決めない）
//   - ドラッグ中は settle を使わず、drag.ts の DragSession が開始時の写しから毎回決め直す（入れ替えは 4 分の 1 食い込んでから）。
//     手を離したときに重なりが残っていれば、settle(SCENES.drop) で直す。どちらでも、置いたあとの位置で fitToRow を決め直す（regrow）

import {
  type Box, type Container, type Edge, type World,
  absPos, ancestors, descendants, growFromOf, inNest, isIconShape, kidSizeOf, kidStrategyOf, other, placerOf, setSpec, shapeOf, sizeRuleOf,
} from "../model";
import { alignFlow } from "./flow-align";
import { shapeDef } from "../shapes";
import type { TextMeasurer } from "./measure";
import { bodyBand, createNodeKinds } from "./node-kinds";
import type { Scene } from "./policy";
import { type SqBox, canSqueeze } from "./squeeze";
import { layoutStats } from "./stats";

export { layoutStats };

export interface LayoutOptions {
  gap: number;
  linkGap: number;
  captionGap: number;
  padding: number;
  header: number;
  treeGapX: number;
  treeGapY: number;
  margin: number; // 図の周りの余白（ワールドの外。物は置けない。D32）
}

export interface LayoutContext {
  opt: LayoutOptions;
  world: World;
  worldEl: HTMLElement;
  container: HTMLElement;
  canvas?: HTMLElement; // スクロールできる広さを決める見えない入れ物（ワールド×倍率＋周りの余白。D32）
  // ワールドの固定の大きさ（null の向きは、表示領域と中身に合わせて決める）。大きさの決まりはここ 1 か所から受け取る
  // （今はデータの world.width / height。D33 で紙の型の大きさに差し替える。docs/PAPER-plan.md）。無ければ固定しない
  worldFixed?(): { w: number | null; h: number | null };
  measurer: TextMeasurer;
  roots(): Box[];
  edges(): Edge[];
  zoom?(): number; // ワールドにかけている倍率（transform: scale。無ければ 1）
  inset?(): number; // 図の左にかぶせているドロワーの幅（px。E22。無ければ 0）。その間は左の余白をこの分広げる
  canvasSized?(): void; // スクロールの広さとワールドをずらす量を決め直したあと（graph.ts が開いたときの見え方を合わせ直す）
  // 開いたときのはみ出しの調整（fitToViewport）で移した（表示だけ。ファイルには無い位置）
  fitted?(n: Box): void;
  // 開いたとき・読み直し・Undo で、押す前の大きさ（D45）: データの width・height、無ければ直前に画面に出ていた大きさ。どちらも無ければ undefined（土台の最小）
  priorSize?(n: Box): { w: number; h: number } | undefined;
  // 読み直し・Undo で、直前の画面から引き継ぐ本来いたい位置（D45）: 位置も親も画面に出ていたときのままの箱だけ。無ければ undefined（今の位置）
  priorHome?(n: Box): { x: number; y: number } | undefined;
}

export type Layout = ReturnType<typeof createLayout>;

export function createLayout(ctx: LayoutContext) {
  const { opt, world, worldEl, container } = ctx;
  const roots = () => ctx.roots();
  const edges = () => ctx.edges();

  const containerOf = (n: Box): Container => n.parent ?? world;
  const siblings = (n: Box) => containerOf(n).children;
  // n につながる線
  const incident = (n: Box) => edges().filter(e => e.a === n || e.b === n);

  // 見出しの下の本文の分（本文が無ければ 0）
  const bodyTop = (n: Box) => bodyBand(kindOf(n).name === "nest" ? bodyHeightTop(n) : 0);

  // 子を置ける領域の内側の余白
  function innerArea(c: Container) {
    return {
      left: opt.padding,
      // 内包する箱に本文があれば、その下から（docs/BODY-plan.md）
      top: c.isWorld ? opt.padding : opt.header + bodyTop(c),
      right: opt.padding,
      bottom: opt.padding,
    };
  }

  // 大きさが固定されている方向。子を持つ箱はつねに子に合わせて伸びるので、固定されるのはワールドだけ（docs/SIZE-plan.md）。
  // ワールドは幅を固定し、高さは指定が無ければ下へ伸ばせる（横スクロールより縦スクロールの方が見やすい）
  // 固定の大きさを決める口（LayoutContext.worldFixed）
  const worldFixed = () => ctx.worldFixed?.() ?? { w: null, h: null };
  // 最上位の箱が、固定の大きさ（紙）の外にはみ出しているか（D33）。1px 未満のずれは数えない（ドラッグの clamped と同じ。
  // 二分探索で紙の端まで寄せた箱が 0.3px はみ出したことにされ、操作ごと断られていた。2026-10-17 P2）
  const outsideFixed = (n: Box) => {
    if (n.parent || !n.hasPos) return false;
    const f = worldFixed();
    return (f.w != null && n.x + n.w > f.w - opt.padding + 0.5) || (f.h != null && n.y + n.h > f.h - opt.padding + 0.5);
  };
  function fixedSize(c: Container): { w: number | null; h: number | null } {
    if (c.isWorld) return { w: world.w, h: worldFixed().h != null ? world.h : null };
    return { w: null, h: null };
  }

  // 表示領域の中身（スクロールバーを除く）の幅と高さ。clientWidth / clientHeight は小数を四捨五入するので、
  // 実際の幅が 836.6 のとき 837 になり、それに合わせたワールドが 0.4px はみ出して、動かせないスクロールバーが出る
  // （Windows の表示倍率などで幅に小数が出る）。小数まで測って切り捨てる
  // 倍率をかけないときの広さで答える。拡大縮小は紙を遠くから・近くから見るだけで、紙の大きさや箱を置ける範囲は変えない
  // （2026-10-15 ユーザー。D33。縮めたとき、紙の外は余白の色で見える）。LLM への配置の要約もこの広さ。
  // 周りの余白（D32）は表示領域の外側に足すので、ここでは引かない（ワールドは表示領域いっぱいに出す）
  function viewport() {
    const r = container.getBoundingClientRect();
    return {
      w: Math.floor(r.width - (container.offsetWidth - container.clientWidth)),
      h: Math.floor(r.height - (container.offsetHeight - container.clientHeight)),
    };
  }

  // 指定が無ければ、表示領域と置かれているボックスの範囲の大きい方にする。
  // 表示領域が狭くなってもボックスは動かさず、はみ出た分はスクロールで見る
  // 箱をドラッグしている間は、図を縮めない（holdWorld）。縮めるとスクロールの位置が押し戻され、スクロールした量も足して位置を決める
  // ドラッグ中の箱が、ポインタより余分に動いてしまうため（2026-10-12 ユーザー: 下へ広げたあと上へ戻すと速すぎた）。手を離したら縮める
  // 箱を足す所を探している間（追加モードの影、道具入れからのドラッグ）も、端へ寄せたら図を (x, y) まで広げて縮めない（stretchWorld）。
  // 縮めるのは、箱を足したときかモードを変えたとき（graph.ts）
  let held: { w: number; h: number } | null = null;
  function holdWorld(on: boolean) {
    if (!on && !held) return;
    held = on ? { w: world.w, h: world.h } : null;
    if (!on) syncWorld();
  }
  function stretchWorld(x: number, y: number) {
    held = { w: Math.max(held?.w ?? world.w, Math.ceil(x)), h: Math.max(held?.h ?? world.h, Math.ceil(y)) };
    syncWorld();
  }

  function syncWorld() {
    let right = 0, bottom = 0;
    for (const n of roots()) {
      if (!n.hasPos || !n.w) continue;
      right = Math.max(right, n.x + n.w + opt.padding);
      bottom = Math.max(bottom, n.y + n.h + opt.padding);
    }
    const v = viewport();
    const f = worldFixed();
    world.w = f.w ?? Math.max(v.w, right, held?.w ?? 0);
    world.h = f.h ?? Math.max(v.h, bottom, held?.h ?? 0);
    if (held) held = { w: world.w, h: world.h };
    worldEl.style.width = world.w + "px";
    worldEl.style.height = world.h + "px";
    sizeCanvas();
  }

  // スクロールできる広さ: ワールドの見た目の大きさ（倍率をかけた分）と、周りの余白。ワールドは transform で拡大縮小するので、
  // スクロールの広さは見た目に追従しない。それをこの入れ物で決める（D32）。ワールドは表示領域より狭くならないので、
  // 上下左右とも、余白の分だけワールドを外へずらせる
  // ワールドをずらす量（縦横別）は、周りの余白と、紙が表示領域より小さいときに真ん中に来る量の大きい方（2026-10-15 ユーザー:
  // 縮めたとき紙を真ん中に。広い画面で右と下ばかり空かないように）。スクロールの広さは、ワールドの見た目の大きさ ＋ 両側のずらす量
  // 左にドロワーをかぶせている間（inset。E22。2026-10-18 ユーザー）は、左の余白をその幅だけ広げ、図をドロワーの下から出せるようにする。真ん中はドロワーの右の範囲で取る
  let offset = { x: opt.margin, y: opt.margin };
  function sizeCanvas() {
    if (!ctx.canvas) return;
    const z = ctx.zoom?.() ?? 1, m = opt.margin, inset = ctx.inset?.() ?? 0;
    const ww = world.w * z, wh = world.h * z;
    const right = Math.max(m, (container.clientWidth - inset - ww) / 2);
    offset = { x: inset + right, y: Math.max(m, (container.clientHeight - wh) / 2) };
    worldEl.style.left = offset.x + "px";
    worldEl.style.top = offset.y + "px";
    ctx.canvas.style.width = Math.ceil(ww + offset.x + right) + "px";
    ctx.canvas.style.height = Math.ceil(wh + 2 * offset.y) + "px";
    ctx.canvasSized?.();
  }

  // ---- 大きさ ----

  // 節点の種類（文字の箱、非表示、内包、ツリー）ごとの、大きさの決め方と線がつながる範囲
  const { kindOf, bodyTop: bodyHeightTop } = createNodeKinds({
    opt, measure: (n, w, captionOnly) => ctx.measurer.measure(n, w, captionOnly), body: (n, w) => ctx.measurer.body(n, w),
    caption: n => ctx.measurer.caption(n),
  });

  // 自分の大きさと本体の矩形を決める（子の大きさと、内包なら子の位置はもう決まっていること）
  const fit = (n: Box) => kindOf(n).measure(n);
  // 同じ階層との線をつなぐ範囲（ボックスの左上からの位置）。ツリーで見せていれば枠全体、それ以外は本体
  const anchorRect = (n: Box) => kindOf(n).anchorRect(n);
  // 線がつながる範囲（ワールドの座標）
  const absAnchorRect = (n: Box) => { const [x, y] = absPos(n), r = anchorRect(n); return { x: x + r.x, y: y + r.y, w: r.w, h: r.h }; };
  // 線がつながる範囲の横の中心（親の中での位置）
  const centerX = (n: Box) => { const a = anchorRect(n); return n.x + a.x + a.w / 2; };

  // 置く処理（placeGroup、compress）の途中で、まだ置いていないボックス。重なりの判定の相手にしない。
  // 置く処理の外（ドラッグ中など）では空で、すべてのボックスが相手になる
  const unplaced = new Set<Box>();
  // 位置のある箱を動かさず、位置の無い箱だけを空きに置く（開いたとき・読み直しの最初の段。大きさが変わった分は regrow が押す。D45）
  let holdPlaced = false;
  const isPlaced = (o: Box) => !unplaced.has(o);

  // ---- 本来いたい位置（intendedX・intendedY）の決まり（D48。2026-10-19 ユーザー: 土台を固める） ----
  // 本来いたい位置から離れてよいのは、土台が押した箱（regrow の押し、重なりを下へずらす）だけ。決めるのはこの 3 つだけで、操作の側は触らない:
  //   adoptMoved: 並べ直しの初めに、土台が最後に並べ終えた位置（placedX・placedY）から動いている箱は、土台の外で動かされた
  //               （ドラッグ・ドロップ・置き直し・詰め直し）ので、今の位置を本来いたい位置にする（片方の向きだけ動かしても、置いた位置全体が意図）
  //   markPlaced: 並べ終えたら、今の位置を覚える（自由に置かれる箱だけ。並べ方が決まる箱は、自由に置かれたときに今の位置から始める）
  //   fromPrior:  開いたとき・読み直し・Undo は、直前の画面から引き継ぐ（ctx.priorHome）か、データの位置
  // 土台の中で、押すのではなく置き直す所（空きに置く・整列・押し込み・開いたときの採用）は、そこで本来いたい位置も決める
  const isFree = (b: Box) => inNest(b) && b.hasPos;
  function adoptMoved() {
    for (const b of allBoxes()) {
      if (Math.abs(b.x - b.placedX) <= 0.5 && Math.abs(b.y - b.placedY) <= 0.5) continue;
      [b.intendedX, b.intendedY] = [b.x, b.y];
    }
  }
  function markPlaced() {
    for (const b of allBoxes()) [b.placedX, b.placedY] = isFree(b) ? [b.x, b.y] : [NaN, NaN];
  }
  function fromPrior() {
    for (const b of allBoxes()) {
      const home = ctx.priorHome?.(b);
      [b.intendedX, b.intendedY] = home ? [home.x, home.y] : [b.x, b.y];
    }
    markPlaced();
  }
  // 今の位置と本来いたい位置を覚え、戻す関数を返す（つまみで幅を変える間、開始時から毎回決め直すため。resizers.ts）
  function hold(): () => void {
    const saved = allBoxes().map(b => [b, b.x, b.y, b.intendedX, b.intendedY, b.placedX, b.placedY] as const);
    return () => { for (const [b, ...v] of saved) [b.x, b.y, b.intendedX, b.intendedY, b.placedX, b.placedY] = v; };
  }

  function refitAncestors(n: Box) {
    for (const p of ancestors(n)) fit(p);
  }

  // ---- 重なり判定 ----

  // 親の中に収まる位置に寄せる（大きさが固定されていない方向は、親が伸びるので上限なし）
  function clamp(n: Box, x: number, y: number): [number, number] {
    if (!inNest(n)) return [x, y]; // ツリーの子は自動で並ぶ
    const c = containerOf(n);
    const a = innerArea(c);
    // ワールドにも、グループと同じ余白を残す
    const pad = opt.padding;
    const minX = a.left;
    const minY = a.top;
    const f = fixedSize(c);
    const maxX = f.w != null ? f.w - pad - n.w : Infinity;
    const maxY = f.h != null ? f.h - pad - n.h : Infinity;
    return [
      Math.max(minX, Math.min(maxX, x)),
      Math.max(minY, Math.min(maxY, y)),
    ];
  }

  // 文字の箱（と、本体だけを見せる非表示）が、同じ段の右にいる自分より大きい兄弟にはみ出すなら、その手前まで
  // 狭めて折り返す。左端を保ち、右端を相手の手前にそろえるので、何度計算し直しても（Undo や読み直しを含む）同じ幅になる。
  // 自分以下の大きさの兄弟は押す（regrow）。幅の指定がある箱、位置の無い箱は変えない。最小の幅でも収まらなければ狭めない。
  // regrow が押す前に、どの場面でも使う（D45。2026-10-19 ユーザー: 文字は折り返しが要る場合がある）。置いたあとの位置で決めるので、Undo・Redo でも同じ幅になる
  function fitToRow(n: Box) {
    const kind = kindOf(n).name;
    if (!n.hasPos || !inNest(n) || (kind !== "text" && kind !== "hidden") || (kind === "text" && n.specW)) return;
    if (n.capW) { n.capW = 0; fit(n); }
    const g = (o: Box) => gapBetween(n, o);
    const cx = n.x + n.w / 2, top = n.y, bottom = n.y + n.h, area = n.w * n.h;
    const row = siblings(n).filter(o =>
      o !== n && o.hasPos && o.w * o.h > area && o.y < bottom + g(o) && o.y + o.h + g(o) > top);
    const ahead = row.filter(o => o.x + o.w / 2 >= cx);
    if (!ahead.length) return;
    const right = Math.min(...ahead.map(o => o.x - g(o)));
    if (n.x + n.w <= right + 0.5) return;
    if (n.x >= right) return;
    n.capW = right - n.x;
    fit(n);
    if (n.w > n.capW + 0.5) { n.capW = 0; fit(n); return; } // 最小の幅でも収まらない
    n.x = right - n.w;
  }

  // 2 つの箱の間にとる最小間隔（2026-10-12 ユーザー）: 線でつながっていなければ gap（8）、つながっていれば linkGap（32）、
  // その線にキャプションがあれば captionGap（40）。ユーザーがつながっていない箱をそばに寄せられるように、組ごとに決める
  // 並べ方の戦略のローカルなルールが先: 子どうしの間隔を決めていればそれ（リスト）、組ごとの間隔を使わない戦略（フローチャート）なら
  // 線があっても広げない（model.ts の STRATEGIES の kidGap・pairGaps）
  function gapBetween(n: Box, o: Box): number {
    const s = placerOf(n);
    let g = s.kidGap ?? opt.gap;
    if (!s.pairGaps) return g;
    for (const e of edges()) {
      if (!((e.a === n && e.b === o) || (e.a === o && e.b === n))) continue;
      g = Math.max(g, typeof e.src.caption === "string" && e.src.caption.trim() ? opt.captionGap : opt.linkGap);
    }
    return g;
  }

  function overlaps(n: Box, x: number, y: number, o: Box) {
    layoutStats.overlapChecks++;
    const g = gapBetween(n, o);
    return x < o.x + o.w + g && x + n.w + g > o.x &&
           y < o.y + o.h + g && y + n.h + g > o.y;
  }

  function collides(n: Box, x: number, y: number) {
    if (!inNest(n)) return false;
    return siblings(n).some(o => o !== n && isPlaced(o) && overlaps(n, x, y, o));
  }

  // ---- 配置 ----

  // 親の中で、左上から格子状に空きを探す
  function findGridSpot(n: Box): [number, number] {
    const c = containerOf(n);
    const sibs = siblings(n);
    const a = innerArea(c);
    // 格子の目は、n が兄弟ととる一番広い間隔で切る（線でつながった兄弟がいれば 32・40px。gapBetween）。8px の目のままだと、
    // つながった兄弟の隣の目に入れず、1 つ先の目まで飛んで間が空きすぎる
    const g = Math.max(opt.gap, ...sibs.filter(s => s !== n).map(s => gapBetween(n, s)));
    const cw = Math.max(...sibs.map(s => s.w)) + g;
    const ch = Math.max(...sibs.map(s => s.h)) + g;
    const f = fixedSize(c);
    let cols = Math.max(1, Math.ceil(Math.sqrt(sibs.length)));
    if (f.w != null) cols = Math.max(1, Math.min(cols, Math.floor((f.w - a.left - a.right + g) / cw)));
    for (let i = 0; i < 10000; i++) {
      const x = a.left + (i % cols) * cw;
      const y = a.top + Math.floor(i / cols) * ch;
      if (!collides(n, x, y)) return [x, y];
    }
    return [a.left, a.top];
  }

  // ワールド内で (x, y) に近い空きを探す
  function findFreeSpot(n: Box, x: number, y: number): [number, number] {
    const maxR = Math.max(world.w, world.h);
    for (let r = 0; r <= maxR; r += 16) {
      const step = r === 0 ? 360 : Math.max(5, 360 / (r / 4));
      for (let a = 0; a < 360; a += step) {
        const [cx, cy] = clamp(n,
          x + r * Math.cos((a * Math.PI) / 180),
          y + r * Math.sin((a * Math.PI) / 180));
        if (!collides(n, cx, cy)) return [cx, cy];
      }
    }
    // 探す範囲（ワールドの幅か高さ）で見つからなければ、同じ x のまま下へずらす（表示領域が狭いと、大きいボックスを縦に積む場所が
    // 範囲の外になり、重ねて置いていた）。紙（高さが決まっている）に入りきらなくても重ねず、紙の下の外へ置く（開いたときなら、そのあと
    // fitPaper が形を変えずに押し込み、入らなければ開かない。docs/PAPER-plan.md の 4.6 の 7。以前は重ねて置いていた。2026-10-17 P3）
    const [sx, sy] = clamp(n, x, y);
    return slide(n, sx, sy, "down", Infinity) ?? [x, y];
  }

  // 位置指定のあるものを優先して1つずつ置き、重なるものは空きへ逃がす（押し下げる。本来いたい位置は変えない）。
  // first を指定すると、それを最初に置く（変更したボックスをその場に残し、相手の方をずらすため）。
  // 押し下げた箱を戻すのはここではなく regrow（本来いたい位置から押すので、相手が縮めば戻る。D48 で 1 か所にした）
  function placeGroup(list: Box[], spot: (n: Box) => [number, number], first?: Box) {
    for (const n of list) unplaced.add(n);
    const rest = list.filter(n => n !== first);
    const order = (first && list.includes(first) ? [first] : []).concat(rest.filter(n => n.hasPos), rest.filter(n => !n.hasPos));
    for (const n of order) {
      // 紙の外にある最上位の箱（ファイルに書かれた位置）は、ここでは寄せない。1 つずつ紙の端へ寄せると、隣と重なって押し下げられる（折り返す）。
      // 並べたあとで fitPaper が、形を変えずに紙の内側へ押し込む（docs/PAPER-plan.md の 4.6 の 7）
      if (!outsideFixed(n)) [n.x, n.y] = clamp(n, n.x, n.y);
      if (!n.hasPos || (!holdPlaced && collides(n, n.x, n.y))) {
        const wasPlaced = n.hasPos, was = { x: n.x };
        [n.x, n.y] = spot(n);
        if (!wasPlaced) n.intendedY = n.y; // 位置の無いボックスは、空きに置いた位置が本来いたい位置
        // 空きを探して横へ移したら、そこが本来いたい左端（横へ戻すのは、大きさが変わって横へ押したときだけ。regrow）
        if (!wasPlaced || Math.abs(n.x - was.x) > 0.5) n.intendedX = n.x;
      }
      unplaced.delete(n);
      n.hasPos = true;
    }
  }

  // 子から順に大きさと配置を決める
  // keep は変更したボックスとその祖先。重なったときはこれらをその場に残し、相手の方をずらす。
  // 位置のある子が重なったら同じ x のまま下へずらし、位置の無い子は左上から空きを探す
  function settleNode(n: Box, keep?: Set<Box>) {
    n.children.forEach(c => settleNode(c, keep));
    if (kindOf(n).holdsChildren) {
      if (unplacedAligned(n)) alignKids(n);
      if (!fromData) n.children.forEach(c => fitToRow(c));
      placeGroup(n.children, c => (c.hasPos ? spotBelow(c) : findGridSpot(c)), n.children.find(c => keep?.has(c)));
    }
    fit(n);
  }

  // 位置のあるボックスが重なったら、同じ x のまま下へずらす（周りを探すより元の並びが崩れにくい）。
  // 位置の無いボックスは、置こうとした場所の近くの空きを探す
  function settleRoots(first?: Box) {
    placeGroup(roots(), n => (n.hasPos ? spotBelow(n) : findFreeSpot(n, n.x, n.y)), first);
  }

  // n を (x, y) から dir の向きへ、兄弟とぶつからなくなるまでずらした位置を返す。ぶつかった相手の端のちょうど
  // opt.gap 先へ一度に進めるので、押し下げた相手との間隔はいつも opt.gap になる（ドラッグの pushAway と同じ。
  // 少しずつずらすと、止まる位置が刻みに引っ張られて間隔がばらつく）。
  // その向きの位置が limit を越えたら null（呼び出し側で別の置き方をする）。
  // 読み込み・設定変更のあと（spotBelow）、子のサイズをそろえる（compress）、最初に開いたとき（fitToViewport）で使う
  function slide(n: Box, x: number, y: number, dir: "down" | "right" = "down", limit = Infinity): [number, number] | null {
    for (;;) {
      if ((dir === "down" ? y : x) > limit) return null;
      const hits = siblings(n).filter(o => o !== n && isPlaced(o) && overlaps(n, x, y, o));
      if (!inNest(n) || !hits.length) return [x, y];
      if (dir === "down") y = Math.max(...hits.map(o => o.y + o.h + gapBetween(n, o)));
      else x = Math.max(...hits.map(o => o.x + o.w + gapBetween(n, o)));
    }
  }

  function spotBelow(n: Box): [number, number] {
    // 親の高さが決まっていれば（ワールドの高さの指定や、切り詰める枠）、下にも限りがある。
    // ただし紙の外にある最上位の箱（ファイルに書かれた位置）は、あとで fitPaper が押し込むので、そのまま下へずらす（4.6 の 7）。
    // 紙の中で空きを探すと、紙が埋まっているときに探し尽くして重くなっていた（2026-10-17 P4）
    const c = containerOf(n);
    const f = fixedSize(c);
    const maxY = f.h != null && !outsideFixed(n) ? f.h - opt.padding - n.h : Infinity;
    return slide(n, n.x, n.y, "down", maxY) ?? (c.isWorld ? findFreeSpot(n, n.x, n.y) : findGridSpot(n));
  }

  // 決まった並べ方で子を置く戦略（フローチャート）で、子のどれにも位置が無いか（LLM が位置を書かずに書き出したとき）
  const unplacedAligned = (c: Container) => kidStrategyOf(c).autoAlign && c.children.length > 0 && c.children.every(k => !k.hasPos);

  // 入れ物 c の子を、決まった並べ方で置き直す（layout/flow-align.ts。本筋を中央の縦の線にそろえる）。
  // ワールドなら、並べた全体の左端から右端までの真ん中を画面の幅の真ん中に（2026-10-12 ユーザー。はみ出すなら左の余白から）、
  // 箱なら箱の中の左の余白から。位置を覚えた子は、そこが本来いたい位置になる
  function alignKids(c: Container) {
    const kids = c.children;
    const inside = new Set(kids);
    // 間隔は戦略の表（STRATEGIES の align。中の箱のサイズごと）
    const align = kidStrategyOf(c).align!, size = kidSizeOf(c) ?? "M", gap = align.gaps[size];
    const pos = alignFlow(
      kids.map(k => ({ id: k.id, w: k.w, h: k.h, start: shapeDef(shapeOf(k)).terminal, branch: shapeDef(shapeOf(k)).branch })),
      edges().filter(e => inside.has(e.a) && inside.has(e.b)).map(e => ({ from: e.a.id, to: e.b.id })),
      { centerX: 0, top: innerArea(c).top + (c.isWorld ? align.top : 0), gapX: gap.x, gapY: gap.y, sideDrop: align.sideDrop[size] },
    );
    const minX = Math.min(...kids.map(k => pos.get(k.id)!.x));
    const maxX = Math.max(...kids.map(k => pos.get(k.id)!.x + k.w));
    const left = innerArea(c).left;
    const dx = c.isWorld ? Math.max(left - minX, viewport().w / 2 - (minX + maxX) / 2) : left - minX;
    for (const k of kids) {
      const p = pos.get(k.id)!;
      k.x = p.x + dx;
      k.y = p.y;
      k.hasPos = true;
      k.intendedY = k.y;
      k.intendedX = k.x;
    }
  }

  // 位置の無い最上位のボックスを円形に並べる（開いたときと、外部の変更で増えたとき）
  function placeAutoRoots() {
    const auto = roots().filter(n => !n.hasPos);
    const R = Math.min(world.w, world.h) * 0.3 + 40;
    auto.forEach((n, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / auto.length;
      n.x = world.w / 2 + R * Math.cos(a) - n.w / 2;
      n.y = world.h / 2 + R * Math.sin(a) - n.h / 2;
    });
  }

  // 場面の方針（policy.ts の SCENES の1行）に従って、全体の大きさと位置を決め直す。
  // changed は変えた節点、apply はその変更。変える前に保つ位置を覚えてから apply を呼ぶ
  // （先に変えると、変わったあとの大きさで覚えてしまう）
  function settle(scene: Scene, changed?: Box, apply?: () => void) {
    apply?.();
    if (scene.fromData) return settleFromData(scene);
    adoptMoved();
    // 変えた節点と祖先はその場に残し、ぶつかる相手の方を動かす（others）。later なら後から置くものが動く
    const keep = changed && scene.yieldTo === "others" ? new Set([changed, ...ancestors(changed)]) : undefined;
    roots().forEach(r => settleNode(r, keep));
    if (!fromData) roots().forEach(r => fitToRow(r));
    syncWorld();
    if (unplacedAligned(world)) alignKids(world);
    placeAutoRoots();
    settleRoots(keep ? (ancestors(changed!).pop() ?? changed) : undefined);
    syncWorld();
    if (scene.fitViewport) fitToViewport();
    if (scene.adoptPlaced) for (const b of roots().flatMap(r => [r, ...descendants(r)])) [b.intendedX, b.intendedY] = [b.x, b.y];
    markPlaced();
  }

  // 開いたとき・読み直し・Undo（D45。2026-10-19 ユーザー）: ユーザーの操作と同じ決まり（regrow）で並べる。
  // データの大きさ（無ければ直前に画面に出ていた大きさ）を前の状態とし、測った本当の大きさへ広がった分を同じ向きに押す
  // （縮めば押された箱は本来いたい位置へ戻る）。大きさの分からない箱（LLM が書いたばかり）は前の状態を持たず、本当の大きさで重なれば
  // 3 で下へずらす（最小の大きさから広がったとみなすと、押す向きを仮の大きさで決めてしまう。2026-10-19 に試した）。手順:
  //   1. 位置の無い箱だけを空きに置く（位置のある箱は動かさない）
  //   2. 前の大きさから regrow で押す（文字の箱が右の大きい隣にぶつかるなら、まず手前で折り返す。regrow の中の fitToRow）
  //   3. それでも重なっている箱（大きさの分からない箱、前の大きさでも重なっていた組。regrow は押さない）は、今までどおり下へずらす
  let fromData = false;
  let pushedIn = false;
  function settleFromData(scene: Scene) {
    fromData = true;
    try {
      fromPrior();
      holdPlaced = true;
      try { settleSteps(); } finally { holdPlaced = false; }
      // 紙の外に書かれた箱があれば、ここで押し込まれる（fitPaper が「押し込んだ」と答えて、呼んだ側がファイルに書き戻せるよう覚える）
      const outside = roots().some(outsideFixed);
      regrow(() => {}, undefined, { prior: priorFromData() });
      pushedIn = outside && !roots().some(outsideFixed);
      settleSteps();
      if (scene.fitViewport) fitToViewport();
      // 開いたとき（前の画面が無い）は、並べた結果が出発点（押した位置が本来いたい位置。あとで上が空いても上がらない。docs/LAYOUT-PENDING.md の 3）。
      // 読み直し・Undo は、画面から引き継いだ本来いたい位置を保つ（相手が縮めば戻る。graph.ts の buildNode）
      if (scene.adoptPlaced) for (const b of allBoxes()) [b.intendedX, b.intendedY] = [b.x, b.y];
      markPlaced();
    } finally { fromData = false; }
  }
  function settleSteps() {
    roots().forEach(r => settleNode(r));
    syncWorld();
    if (unplacedAligned(world)) alignKids(world);
    placeAutoRoots();
    settleRoots();
    syncWorld();
  }
  // 押す前の様子: 位置は今の位置（データの位置か、1 で置いた位置）、大きさは前の大きさ。1 で置いた箱は前の大きさを持たない（今の大きさから始める）
  function priorFromData(): Snapshot {
    const now = snapshot();
    for (const b of allBoxes()) {
      const p = now.get(b.id);
      // 子を自由に置く箱（グループ）の大きさは子の並びから決まるので、前の大きさも今の大きさのまま（中の子は子ごとに押す）
      if (!p || !p.free || p.holds) continue;
      const size = ctx.priorSize?.(b);
      if (size) now.set(b.id, { ...p, w: size.w, h: size.h });
    }
    return now;
  }

  // 並べ直しの前の、箱ごとの位置と大きさ（id で引く。作り直し（graph.ts の rebuildWith）で箱が作り直されても引けるように）
  type Snapshot = Map<string, { x: number; y: number; w: number; h: number; ix: number; iy: number; px: number; py: number; parent: string | null; free: boolean; holds: boolean }>;
  const allBoxes = () => roots().flatMap(r => [r, ...descendants(r)]);
  function snapshot(): Snapshot {
    return new Map(allBoxes().map(b => [b.id, {
      x: b.x, y: b.y, w: b.w, h: b.h, ix: b.intendedX, iy: b.intendedY, px: b.placedX, py: b.placedY, parent: b.parent?.id ?? null,
      free: inNest(b) && b.hasPos, holds: kindOf(b).holdsChildren,
    }]));
  }
  // 作り直したあと、同じ親のまま残った箱を、作り直す前の位置（と本来いたい位置）に戻す（作り直しの並べ方で動いた分を取り消し、regrow に任せる）
  function restoreFrom(prior: Snapshot) {
    for (const b of allBoxes()) {
      const p = prior.get(b.id);
      if (!p || !p.free || p.parent !== (b.parent?.id ?? null) || !inNest(b)) continue;
      [b.x, b.y, b.intendedX, b.intendedY, b.placedX, b.placedY] = [p.x, p.y, p.ix, p.iy, p.px, p.py];
    }
  }
  // 押した所（今の n の位置）に置くときの、置ける所の候補（よい順。docs/PAPER-plan.md の 4.6 の追加）。今ある箱は動かさない:
  //   1. 押した所が空いていれば、そこ
  //   2. ふさがっていれば、入れ物の今の大きさの中（紙のワールドなら紙の中）で、押した所に一番近い空き（入れ物は広がらない）
  //   3. 中に空きが無ければ（グループ）、今ある子全体の右か下（入れ物は右だけか下だけに広がる）。広がりの小さい方を先に
  // 候補が無ければ空（紙のワールドに空きが無い）。紙に収まるかは呼ぶ側が regrow で順に確かめる
  function dropSpots(n: Box): [number, number][] {
    if (!inNest(n)) return [[n.x, n.y]];
    const c = containerOf(n), a = innerArea(c);
    const kids = siblings(n).filter(k => k !== n && k.hasPos);
    [n.x, n.y] = [Math.max(a.left, n.x), Math.max(a.top, n.y)];
    // 入れ物の今の中の範囲（グループは今ある子の広がりと最小の大きさ、紙のワールドは紙、紙の無いワールドは限りなし）
    const f = c.isWorld ? worldFixed() : { w: null, h: null };
    const floor = c.isWorld ? null : kindOf(c as Box).floor?.(c as Box);
    const right = c.isWorld ? (f.w != null ? f.w - a.right : Infinity)
      : Math.max((floor?.w ?? 0) - a.right, ...kids.map(k => k.x + k.w));
    const bottom = c.isWorld ? (f.h != null ? f.h - a.bottom : Infinity)
      : Math.max((floor?.h ?? 0) - a.bottom, ...kids.map(k => k.y + k.h));
    const inside = (x: number, y: number) => x >= a.left - 0.5 && y >= a.top - 0.5 && x + n.w <= right + 0.5 && y + n.h <= bottom + 0.5;
    if (!collides(n, n.x, n.y)) return [[n.x, n.y]];
    if (!Number.isFinite(right) || !Number.isFinite(bottom)) return [findFreeSpot(n, n.x, n.y)];
    // 中の空き: 置ける位置の候補は、中の端と、今ある子の端にそろう所・間隔の分だけ離れた所（ぴったりの隙間も取りこぼさず、ずらした先は並びにそろう）。
    // 押した所そのもの（そろっていない位置）は候補にしない。押した所に一番近いもの
    const xs = [a.left, right - n.w], ys = [a.top, bottom - n.h];
    for (const k of kids) {
      const g = gapBetween(n, k);
      xs.push(k.x + k.w + g, k.x - g - n.w, k.x);
      ys.push(k.y + k.h + g, k.y - g - n.h, k.y);
    }
    let best: [number, number] | null = null, bestD = Infinity;
    for (const x of xs) for (const y of ys) {
      if (!inside(x, y) || collides(n, x, y)) continue;
      const d = Math.hypot(x - n.x, y - n.y);
      if (d < bestD) [best, bestD] = [[x, y], d];
    }
    if (best) return [best];
    if (c.isWorld) return []; // 紙は広がれない
    // 今ある子全体の右か下（入れ物を片方の向きにだけ広げる）
    // 右なら今ある子の上端か中の上端に、下なら今ある子の左端か中の左端にそろえる（押した所に近い方。今の高さ・幅に収まる所）
    const g = Math.max(opt.gap, ...kids.map(k => gapBetween(n, k)));
    const near = (v: number, cands: number[], lo: number, hi: number) =>
      cands.filter(c => c >= lo - 0.5 && c <= hi + 0.5).sort((p, q) => Math.abs(p - v) - Math.abs(q - v))[0] ?? lo;
    const toRight: [number, number] = [Math.max(...kids.map(k => k.x + k.w)) + g, near(n.y, [a.top, ...kids.map(k => k.y)], a.top, bottom - n.h)];
    const below: [number, number] = [near(n.x, [a.left, ...kids.map(k => k.x)], a.left, right - n.w), Math.max(...kids.map(k => k.y + k.h)) + g];
    const grow = ([x, y]: [number, number]) => Math.max(0, x + n.w - right) + Math.max(0, y + n.h - bottom);
    return [toRight, below].sort((p, q) => grow(p) - grow(q));
  }

  // グループの子として入れる（貼り付け・一覧から戻す・移植・付け替え。docs/PAPER-plan.md の 4.7）: 中の左上に置く。
  // ふさがっていれば、ほかの子全体を並びを保ったまま、入るのに必要な分だけ下へずらす（当たらない子も一緒に）。
  // ずらした位置が子の新しい位置（本来いたい位置。このあとの regrow の adoptMoved）で、入れた箱を消しても戻さない
  function putTopLeft(n: Box) {
    const c = n.parent;
    if (!c || !inNest(n)) return;
    const a = innerArea(c);
    [n.x, n.y] = [a.left, a.top];
    const kids = c.children.filter(k => k !== n && k.hasPos);
    let d = 0;
    for (const k of kids) {
      const g = gapBetween(n, k);
      if (k.x < n.x + n.w + g && n.x < k.x + k.w + g) d = Math.max(d, n.y + n.h + g - k.y);
    }
    if (d <= 0) return;
    for (const k of kids) k.y += d;
  }

  // regrow が最後に断ったときの、入らなかった向き・端から端へつながった最上位の箱の列・足りない px（収まれば null）
  let refusal: { axis: "x" | "y"; chain: string[]; short: number } | null = null;

  // 大きさが変わったときの並べ直し（docs/PAPER-plan.md の 4.6）。設定変更（graph.ts の update）、作り直し（rebuildWith。追加・貼り付け・
  // 付け替え・戻す）、箱を消したとき、本文の幅・リストの幅と高さのつまみが通る。
  // 変わる前の大きさを覚えてから apply を呼び、新しい大きさを測って、試しに並べずに canSqueeze（squeeze.ts）で
  // ページの起点（growFrom）から押し込む。押すのは同じ向きだけで、段は変えない（折り返さない）。グループは中で詰めてから広がる。
  // 紙を越えるなら "refused"（位置は書き換えない。呼んだ側が断って、操作の前に戻す）。
  // 自由に置く箱に位置の無いものがあれば（見せ方を内包に戻した子に位置が無かった）、何もせず "unplaced"（呼んだ側が settle で空きに置く）
  // changed は設定を変えた箱。押されていた箱でも、今の位置が本来いたい位置になる（自分で変えたので、上や左が空いても戻らない）。
  // o.prior は変わる前の様子（無ければ apply の前に覚える。作り直しやつまみのように、呼ぶ側が先に覚えておくとき）。
  // o.placed は子を置いたばかりの入れ物（追加・貼り付けの先）: 置いた子を詰めずに、中身から決まる大きさから始める
  function regrow(apply: () => void, changed?: Box, o: { prior?: Snapshot; placed?: Box[] } = {}): "fits" | "refused" | "unplaced" {
    const all = allBoxes;
    const prior = o.prior ?? snapshot();
    apply();
    adoptMoved();
    // 前から自由に置かれていた箱（同じ親のまま）だけ、前の大きさを使う（新しく自由に置かれる箱は、今の位置と大きさから始める）。
    // 子を自由に置く箱になったばかりの箱（非表示・リストから内包に戻した）と、子を置いたばかりの入れ物も、子の位置から決まる大きさから始める
    const before = new Map<Box, { w: number; h: number; holds: boolean }>(); // holds: 子を自由に置く箱だったか
    const placed = new Set(o.placed ?? []);
    for (const b of all()) {
      const p = prior.get(b.id);
      if (!p || !p.free || p.parent !== (b.parent?.id ?? null)) continue;
      before.set(b, { w: p.w, h: p.h, holds: p.holds && !placed.has(b) });
    }
    if (all().some(b => inNest(b) && !b.hasPos)) return "unplaced";
    if (changed) [changed.intendedX, changed.intendedY] = [changed.x, changed.y];
    // 子から順に測る（子を自由に置く箱は、本文の高さが変わった分だけ子を上下に動かす。node-kinds.ts の nest）
    const measure = (n: Box) => { n.children.forEach(measure); fit(n); };
    roots().forEach(measure);
    // 文字の箱が同じ段の右の大きい兄弟にぶつかるなら、押す前にその手前で折り返す（どの場面でも同じ。D45。2026-10-19 ユーザー）。
    // 折り返しても入らない分は、このあと押す
    const rowFit = (n: Box) => { n.children.forEach(rowFit); fitToRow(n); };
    roots().forEach(rowFit);
    const byId = new Map<string, Box>();
    const toSq = (n: Box): SqBox => {
      byId.set(n.id, n);
      // 位置は今の位置（apply では動かない。親の本文の高さが変われば、measure がその分だけ動かしてある）。大きさは前の大きさ
      const kind = kindOf(n);
      const was = before.get(n);
      const o = { x: n.x, y: n.y, w: was?.w ?? n.w, h: was?.h ?? n.h };
      // 子を自由に置く箱になったばかり（非表示・リストから内包に戻した）なら、子を置き始める大きさは、子の位置から決まる今の大きさ
      // （前の小さな大きさから始めると、子を詰めてしまう）。兄弟との組の向きは前の大きさで決める
      const room = was && !was.holds ? { w: n.w, h: n.h } : { w: o.w, h: o.h };
      // 押された箱は、本来いたい位置（intendedX・intendedY）から押す。空けば押された向きに戻る（4.6 の 8）
      const home = { x: Number.isFinite(n.intendedX) ? n.intendedX : n.x, y: Number.isFinite(n.intendedY) ? n.intendedY : n.y };
      if (!kind.holdsChildren) return { id: n.id, ...o, nw: n.w, nh: n.h, home };
      const a = innerArea(n), min = kind.floor?.(n);
      return { id: n.id, ...o, home, room, kids: n.children.map(toSq), inner: { left: a.left, top: a.top, right: room.w - a.right, bottom: room.h - a.bottom }, minW: min?.w, minH: min?.h };
    };
    // 紙の決まっていない向きは、ワールドが中身に合わせて伸びるので限りが無い
    const f = worldFixed(), a = innerArea(world);
    const limit = (fixed: number | null, pad: number) => (fixed != null ? fixed - pad : Infinity);
    const r = canSqueeze(
      { kids: roots().map(toSq), inner: { left: a.left, top: a.top, right: limit(f.w, a.right), bottom: limit(f.h, a.bottom) }, fixed: true },
      { from: growFromOf(world), gapOf: (p, q) => gapBetween(byId.get(String(p))!, byId.get(String(q))!) },
    );
    if (!r.fits) {
      refusal = { axis: r.axis, chain: r.chain.map(String), short: r.short };
      return "refused";
    }
    refusal = null;
    // 子を描かない箱（非表示）の中にも、子を自由に置く箱があれば（位置はデータに持ち続ける）、その箱ごとに同じ決まりで押し込む。
    // 外の箱は中身で大きさが変わらないので、広さに限りは無い
    for (const n of all()) {
      if (byId.has(n.id) || !kindOf(n).holdsChildren) continue;
      const sub = canSqueeze({ kids: [toSq(n)], inner: { left: 0, top: 0, right: Infinity, bottom: Infinity }, fixed: true },
        { from: growFromOf(world), gapOf: (p, q) => gapBetween(byId.get(String(p))!, byId.get(String(q))!) });
      if (sub.fits) for (const [id, p] of sub.boxes) r.boxes.set(id, p);
    }
    // 押されて動いた箱の本来いたい高さは変えない（相手が縮めば、次の並べ直しで戻る）
    for (const [id, p] of r.boxes) [byId.get(String(id))!.x, byId.get(String(id))!.y] = [p.x, p.y];
    const refit = (n: Box) => { n.children.forEach(refit); if (kindOf(n).holdsChildren) fit(n); };
    roots().forEach(refit);
    syncWorld();
    markPlaced();
    return "fits";
  }

  // 開いたとき・読み直しの判定（docs/PAPER-plan.md の 4.6 の 7）: 紙の外にはみ出した最上位の箱（ファイルに紙の外の位置が書かれていた）を、
  // regrow と同じ決まりで、形を変えずに紙の内側へ押し込む（押すのは同じ向きだけ。折り返さない）。
  // 収まれば押し込んだ位置が本来いたい位置になり "moved"（呼んだ側がファイルに書き戻す）。はみ出した箱が無ければ "fits"。
  // 収まらなければ位置は変えずに、入らなかった列（refusal）を返す（呼んだ側がそのファイルを開かない）
  function fitPaper(): "fits" | "moved" | { axis: "x" | "y"; chain: string[]; short: number } {
    if (pushedIn) { pushedIn = false; return "moved"; } // 開いたときの並べ直し（settleFromData）で押し込んだ
    if (!roots().some(outsideFixed)) return "fits";
    if (regrow(() => {}) !== "fits") return refusal ?? { axis: "x", chain: [], short: 0 };
    for (const b of allBoxes()) [b.intendedX, b.intendedY] = [b.x, b.y];
    return "moved";
  }

  // 読み込んだ直後だけ、表示領域の右にはみ出した最上位のボックスを下へ移す（横スクロールより縦の方が見やすい）。
  // つながる相手が表示領域に収まっていれば、その真下に中心をそろえて置く。無ければ全体の一番下の左端に置く。
  // 表示の上だけで動かし、ファイルには次に編集したときに保存される。
  // ワールドの幅が指定されている、表示領域より大きい、または左端が表示領域の左半分にあるボックスは動かさない
  // （左から始まる大きなボックスが少しはみ出しただけなら、動かすと全体の並びが崩れる）
  function fitToViewport() {
    const limit = viewport().w - opt.padding;
    if (worldFixed().w != null || limit <= 0) return;
    const inside = (n: Box) => n.x + n.w <= limit;
    const centerOffset = (n: Box) => { const r = anchorRect(n); return r.x + r.w / 2; };
    const over = roots()
      .filter(n => !inside(n) && n.w <= limit - opt.padding && n.x >= limit / 2)
      .sort((a, b) => a.x - b.x);
    if (!over.length) return;
    for (const n of over) {
      const anchor = incident(n).map(e => other(e, n)).find(o => !o.parent && inside(o));
      const minX = opt.padding, maxX = limit - n.w;
      const x = anchor
        ? Math.max(minX, Math.min(maxX, anchor.x + centerOffset(anchor) - centerOffset(n)))
        : minX;
      const y = anchor
        ? anchor.y + anchor.h + opt.treeGapY
        : Math.max(...roots().filter(o => o !== n && inside(o)).map(o => o.y + o.h), 0) + opt.treeGapY;
      // ぶつかれば下へずらす
      [n.x, n.y] = slide(n, x, y)!;
      [n.intendedX, n.intendedY] = [n.x, n.y];
      ctx.fitted?.(n);
    }
    syncWorld();
  }

  // ---- 子の大きさをそろえる ----

  // そろえられる子（内包か文字の箱）。S は高さが固定で小さい、スティックマンは文字で幅が決まり、
  // ツリーや非表示で子を見せているボックスは子の並びで大きさが決まるので除く
  function sizable(n: Box): Box[] {
    if (!kindOf(n).holdsChildren) return [];
    return n.children.filter(k => {
      const kind = kindOf(k).name;
      return (kind === "nest" || kind === "text") && sizeRuleOf(k).alignable && !isIconShape(shapeOf(k));
    });
  }

  // 大きさの指定を外して、今の中身の配置のまま収まる大きさを測る（文字だけのボックスは既定の大きさ）
  function naturalSize(k: Box, dim: "w" | "h") {
    const [sw, sh] = [k.specW, k.specH];
    if (dim === "w") k.specW = 0;
    else k.specH = 0;
    fit(k);
    const v = dim === "w" ? k.w : k.h;
    [k.specW, k.specH] = [sw, sh];
    fit(k);
    return v;
  }

  // 中身を詰め直してもこれより小さくできない大きさ（一番大きい中身が入る大きさ）
  function minimumSize(k: Box, dim: "w" | "h") {
    if (!kindOf(k).holdsChildren) return naturalSize(k, dim);
    const a = innerArea(k);
    return dim === "w"
      ? Math.max(sizeRuleOf(k).min.w, a.left + a.right + Math.max(...k.children.map(g => g.w)))
      : Math.max(sizeRuleOf(k).min.h, a.top + a.bottom + Math.max(...k.children.map(g => g.h)));
  }

  // 内包している k の中身を、大きさ limit に収まるよう詰め直す。はみ出す中身を内側へ寄せ、
  // 重なったら dir の向き（場面の表の repack。幅なら下、高さなら右）へずらす
  function compress(k: Box, dim: "w" | "h", limit: number, dir: "down" | "right") {
    if (!kindOf(k).holdsChildren) return;
    const a = innerArea(k);
    const kids = [...k.children].sort((p, q) => (dim === "w" ? p.y - q.y || p.x - q.x : p.x - q.x || p.y - q.y));
    for (const g of kids) {
      if (dim === "w" && g.x + g.w > limit - a.right) g.x = Math.max(a.left, limit - a.right - g.w);
      if (dim === "h" && g.y + g.h > limit - a.bottom) g.y = Math.max(a.top, limit - a.bottom - g.h);
      unplaced.add(g);
    }
    for (const g of kids) {
      [g.x, g.y] = slide(g, g.x, g.y, dir)!; // 詰め直した位置が、本来いたい位置になる（settle の apply の中なので adoptMoved）
      unplaced.delete(g);
    }
    fit(k);
  }

  // 内包している n の子の幅や高さを、今いちばん小さい子に合わせてそろえる。縮める方向にしか働かない
  // （ボックスは中身に合わせた大きさが正解なので、そろえるために大きくはしない）。
  // 広い子は中身を詰め直して縮め、中身の都合で目標まで縮められない子は、縮められるところまで縮める。
  // グループに大きさの指定（width, height）を付けるのは、目標にぴったり合わせるのに要るときだけ。
  // 両方なら幅を先にそろえる。settle(SCENES.fitChildren, n, apply) の apply として呼ぶ。
  // そろえた子の数と、目標まで縮められなかった子があったかを返す
  function alignChildren(n: Box, what: "width" | "height" | "both", scene: Scene) {
    const kids = sizable(n);
    let partial = false;
    const align = (dim: "w" | "h") => {
      const cur = (k: Box) => (dim === "w" ? k.w : k.h);
      const target = Math.min(...kids.map(cur));
      for (const k of kids) {
        // 両方そろえるとき、グループの高さは詰め直さない（横へ並べ直すと、そろえた幅が崩れる。グループは大きさの指定で幅を保てない）
        if (dim === "h" && what === "both" && kindOf(k).holdsChildren) {
          if (k.h > target + 0.5) partial = true;
          continue;
        }
        const t = Math.round(Math.max(target, minimumSize(k, dim)));
        if (t > target + 0.5) partial = true;
        compress(k, dim, t, scene.repack![dim]);
        // 文字のボックスには大きさを指定する。グループは大きさの指定を使わない（中身を詰め直した大きさになる。docs/SIZE-plan.md）
        setSpec(k, dim, kindOf(k).holdsChildren ? 0 : t);
        fit(k);
      }
    };
    if (what !== "height") align("w");
    if (what !== "width") align("h");
    return { count: kids.length, partial };
  }

  return {
    containerOf, siblings, incident, innerArea, gapBetween, fixedSize, syncWorld, holdWorld, stretchWorld, outsideFixed,
    offset: () => offset, // ワールドを図の枠の中でずらしている量（sizeCanvas）
    kindOf, anchorRect, absAnchorRect, centerX, fit, refitAncestors,
    clamp, overlaps, collides, isPlaced,
    findGridSpot, findFreeSpot, placeGroup, settleNode, settleRoots, spotBelow,
    settle, regrow, fitPaper, snapshot, restoreFrom, hold, dropSpots, putTopLeft, fitToViewport, viewport, alignKids,
    sizable, alignChildren,
  };
}
