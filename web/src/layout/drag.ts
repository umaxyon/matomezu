// ドラッグ中の配置（設計は docs/DRAG-plan.md）。settle（場面の表）は使わず、ポインタが動くたびに compute で決め直す。決まり:
//   - つかんだボックスはポインタに追従する（親の固定された枠に収める分だけ寄せる）。兄弟とぶつかっても止まらない
//   - 進む向きの先にいた兄弟は、つかんだボックスが触れた瞬間に入れ替わる: つかんだボックスの大きさ + opt.gap だけ
//     開始位置の側へずれる（並べ替えのリストで、通り過ぎた項目が空いた枠へずれるのと同じ）。ずれた先でほかの箱と
//     ぶつかる、親の枠からはみ出すときはずらさず、重なったまま通す
//   - 手を離したとき、入れ替えた相手とまだ重なっていれば、つかんだボックスを相手の向こう側へ寄せる（入れ替えを
//     完成させる）。それでも残った重なりは、場面の表の drop で直す
//   - 中身を動かして広がった祖先は、前に下にいた相手を下へ、右にいた相手を右へ（無理なら下へ）押す
//   - 毎回、ドラッグを始めたときの位置（写し）から計算し直す。押した結果を次の計算の起点にしないので、
//     つかんだボックスが離れれば、どいた相手は元の位置へ戻る。手を離したら、そのときの位置で確定する
//   - 祖先が押した結果、祖先が親の固定された枠からはみ出すなら、その向きへは押さない（ほかの向きか、重なったまま）
//   - つかんだボックス自身が祖先を枠からはみ出させるときだけは、その位置へ動かさない（はみ出さない所で止める）
import type { Layout, LayoutOptions } from "./layout";
import { type Box, ancestors } from "../model";

export type Drag = ReturnType<typeof createDrag>;
export type DragSession = ReturnType<Drag["begin"]>;

type Dir = "down" | "up" | "right" | "left";
type Rect = { x: number; y: number; w: number; h: number };

export function createDrag(opt: LayoutOptions, L: Layout) {
  const { siblings, clamp, overlaps, collides, fit } = L;
  const g = opt.gap;

  // 親の中に収まる位置にあるか
  const clamped = (m: Box) => {
    const [cx, cy] = clamp(m, m.x, m.y);
    return Math.abs(cx - m.x) <= 0.5 && Math.abs(cy - m.y) <= 0.5;
  };

  // n をつかんで動かし始める。n と各祖先の兄弟（自分を含む）の位置と大きさを写しておく
  function begin(n: Box) {
    const origin = { x: n.x, y: n.y };
    const snap = new Map<Box, Rect>();
    for (const m of [n, ...ancestors(n)]) {
      for (const o of siblings(m)) snap.set(o, { x: o.x, y: o.y, w: o.w, h: o.h });
    }
    const at = (o: Box) => snap.get(o)!;
    let last: [number, number] = [n.x, n.y]; // 前に置けた位置
    let travel: Dir = "down";                 // 進む向き（開始位置から大きく動いた軸）
    let swapped: Box[] = [];                  // 入れ替えた兄弟

    // o を、by に重ならないよう dir の向きへ、by の端のちょうど gap 先へどける。
    // どいた先でぶつかる相手のうち、写しで o より dir の先にいたものを、同じ向きに続けてどける。
    // 動かした箱の動かす前の位置を undo に残す（失敗したら呼び出し側で戻す）
    function push(o: Box, dir: Dir, by: Box, mover: Box, undo: Map<Box, [number, number]>, depth: number): boolean {
      if (depth > 50) return false;
      if (!undo.has(o)) undo.set(o, [o.x, o.y]);
      if (dir === "down") o.y = by.y + by.h + g;
      else if (dir === "up") o.y = by.y - g - o.h;
      else if (dir === "right") o.x = by.x + by.w + g;
      else o.x = by.x - g - o.w;
      if (!clamped(o)) return false;
      const s = at(o);
      for (const p of siblings(o)) {
        if (p === o || p === mover || !overlaps(o, o.x, o.y, p)) continue;
        const q = at(p);
        const ahead = dir === "down" ? q.y >= s.y - 0.5
          : dir === "up" ? q.y <= s.y + 0.5
          : dir === "right" ? q.x >= s.x - 0.5
          : q.x <= s.x + 0.5;
        if (!ahead || !push(p, dir, o, mover, undo, depth + 1)) return false;
      }
      return true;
    }

    // mover の祖先が、親の枠に収まっているか（測り直してから確かめる）
    function ancestorsFit(mover: Box) {
      for (const m of ancestors(mover)) {
        fit(m);
        if (!clamped(m)) return false;
      }
      return true;
    }

    // mover に重なる兄弟を、dirsFor の向きを順に試してどける。order は処理する順（手前から）。
    // どいた結果、祖先が親の枠からはみ出すなら、その向きは無理とする（つかんだボックスを止めないため）。
    // どれも無理な相手は、その場に残す（重なったまま）
    function resolve(mover: Box, dirsFor: (o: Box) => Dir[], order: (a: Rect, b: Rect) => number) {
      const others = siblings(mover).filter(o => o !== mover).sort((a, b) => order(at(a), at(b)));
      for (const o of others) {
        if (!overlaps(mover, mover.x, mover.y, o)) continue;
        for (const dir of dirsFor(o)) {
          const undo = new Map<Box, [number, number]>();
          if (push(o, dir, mover, mover, undo, 0) && ancestorsFit(mover)) break;
          for (const [b, [bx, by]] of undo) { b.x = bx; b.y = by; }
        }
      }
    }

    // 進む向きの先にいて（写しで）、n が触れた兄弟を、n の大きさ + gap だけ開始位置の側へずらす
    function swap() {
      const vertical = travel === "down" || travel === "up";
      const shift = vertical ? n.h + g : n.w + g;
      const cands: Box[] = [];
      for (const o of siblings(n)) {
        if (o === n) continue;
        const r = at(o);
        // 横切る軸で n と重なっているか
        const across = vertical
          ? r.x < n.x + n.w + g && r.x + r.w + g > n.x
          : r.y < n.y + n.h + g && r.y + r.h + g > n.y;
        // 開始時に n より進む向きの先にいて、n がそこまで来たか
        const reached = travel === "down" ? r.y >= origin.y && r.y < n.y + n.h + g
          : travel === "up" ? r.y + r.h <= origin.y + n.h && r.y + r.h + g > n.y
          : travel === "right" ? r.x >= origin.x && r.x < n.x + n.w + g
          : r.x + r.w <= origin.x + n.w && r.x + r.w + g > n.x;
        if (!across || !reached) continue;
        if (travel === "down") o.y = r.y - shift;
        else if (travel === "up") o.y = r.y + shift;
        else if (travel === "right") o.x = r.x - shift;
        else o.x = r.x + shift;
        cands.push(o);
      }
      // ずれた先でほかの箱（n は除く）とぶつかる、枠からはみ出すものは戻す（戻したことでぶつかるものも続けて戻す）
      const moved = new Set(cands);
      for (let again = true; again;) {
        again = false;
        for (const o of moved) {
          if (clamped(o) && !siblings(n).some(p => p !== o && p !== n && overlaps(o, o.x, o.y, p))) continue;
          o.x = at(o).x; o.y = at(o).y;
          moved.delete(o);
          again = true;
        }
      }
      swapped = [...moved];
    }

    // 目標位置 (tx, ty) に置いて、全体を写しから決め直す
    function place(tx: number, ty: number) {
      for (const [o, r] of snap) { o.x = r.x; o.y = r.y; }
      [n.x, n.y] = clamp(n, tx, ty);
      const dx = n.x - origin.x, dy = n.y - origin.y;
      travel = Math.abs(dy) >= Math.abs(dx) ? (dy >= 0 ? "down" : "up") : (dx > 0 ? "right" : "left");
      swap();
      // 広がった祖先は、前に下にいた相手を下へ、右にいた相手を右へ（無理なら下へ）押す
      for (const m of ancestors(n)) {
        fit(m);
        if (!clamped(m)) return false;
        const before = at(m);
        resolve(m, o => {
          const r = at(o);
          if (r.y >= before.y + before.h - 0.5) return ["down"];
          if (r.x >= before.x + before.w - 0.5) return ["right", "down"];
          return [];
        }, (a, b) => a.y - b.y || a.x - b.x);
      }
      return true;
    }

    return {
      n,
      // 目標位置へ動かす。祖先が親の枠からはみ出して置けなければ、前に置けた位置から目標へ向かって置ける所まで
      // （二分探索で 1px 未満まで詰める）動かして false
      compute(tx: number, ty: number): boolean {
        if (place(tx, ty)) { last = [n.x, n.y]; return true; }
        const [lx, ly] = last;
        let lo = 0, hi = 1;
        while ((hi - lo) * Math.hypot(tx - lx, ty - ly) > 1) {
          const t = (lo + hi) / 2;
          if (place(lx + (tx - lx) * t, ly + (ty - ly) * t)) lo = t; else hi = t;
        }
        place(lx + (tx - lx) * lo, ly + (ty - ly) * lo);
        last = [n.x, n.y];
        return false;
      },
      // 手を離したとき: 入れ替えた相手とまだ重なっていれば、n を相手の向こう側へ寄せる。
      // 寄せた先でまた入れ替わる相手がいれば、それも越える（数回まで）。置けなければ寄せない
      finish() {
        for (let i = 0; i < 5; i++) {
          const hits = swapped.filter(o => overlaps(n, n.x, n.y, o));
          if (!hits.length) return;
          const [x, y] = [n.x, n.y];
          const tx = travel === "right" ? Math.max(...hits.map(o => o.x + o.w + g))
            : travel === "left" ? Math.min(...hits.map(o => o.x - g - n.w)) : x;
          const ty = travel === "down" ? Math.max(...hits.map(o => o.y + o.h + g))
            : travel === "up" ? Math.min(...hits.map(o => o.y - g - n.h)) : y;
          const [cx, cy] = clamp(n, tx, ty);
          if (Math.abs(cx - tx) > 0.5 || Math.abs(cy - ty) > 0.5 || !place(tx, ty)) { place(x, y); return; }
        }
      },
      // 重なりが残っているか（手を離したときに解決する）
      overlapping: () => [...snap.keys()].some(o => collides(o, o.x, o.y)),
      // 写しから位置が変わった箱（つかんだボックスは除く）
      displaced: () => [...snap].filter(([o, r]) => o !== n && (o.x !== r.x || o.y !== r.y)).map(([o]) => o),
    };
  }

  return { begin };
}
