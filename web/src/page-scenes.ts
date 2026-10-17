// ページの縮図（四角と線だけ。preview-art.ts）のもとを用意する: リンクの箱の窓（ページ・マスターのブック）と、リストの子の中身の縮図（D13）。
// 描いたページは離れるときに配置の結果を覚え、描いていないページ・箱の中身は画面の外で並べて作る（offscreen-scene.ts）。
// 持たなければ（テスト）データだけの近似（data-scene.ts）
import { EMPTY_SCENE, dataScene } from "./data-scene";
import { t } from "./i18n";
import type { DEFAULTS, GraphOptions } from "./graph";
import type { Rect as ClipRect } from "./geom";
import { type Box, DEFAULT_VIEW, clipOf, dataLinkLookOf, isHidden, isLinkBox, linkBookOf, linkPageOf } from "./model";
import { pageMembers, pageNameOf, pageOf, pageWorld, subtreeIds } from "./pages";
import { type Scene, sceneOf } from "./preview-art";
import type { Geometry } from "./report";
import type { Diagram, LinkLook, PagePattern } from "./types";
import { isPattern, normalizeEdge } from "./validate";

// ページ p の中身（箱・線・world）の鍵。覚えた縮図を使えるか、Undo / Redo で変わったページはどれかを見分ける
export function sceneKey(d: Diagram, p: string | null): string {
  const members = new Set(pageMembers(d.nodes, p));
  const edgesIn = (d.edges ?? []).map(normalizeEdge).filter(e => members.has(String(e.from)));
  return JSON.stringify([pageWorld(d, p), d.nodes.filter(s => members.has(String(s.id))), edgesIn]);
}

export interface PageScenesContext {
  opt: Pick<GraphOptions, "bookWindow" | "sceneLayout"> & Pick<typeof DEFAULTS, "treeGapX" | "treeGapY" | "padding">;
  source(): Diagram;           // 読み込んだデータ（ブック全体）
  page(): string | null;       // 今のページ
  toJSON(): Diagram;           // 今の状態を書き出したもの
  geometry(): Geometry;        // 今のページの配置の結果
  background(): string | null; // 今のページの背景色
  redraw(): void;              // 窓と縮図の行を描き直す（縮図が届いた）
  alive(): boolean;            // 図を壊していないか（壊したあとに届いた縮図は使わない）
}

export function createPageScenes(ctx: PageScenesContext) {
  const pageName = (p: string | null) => pageNameOf(ctx.source(), p);
  // リンクの箱がのぞくページ（link-box.ts）: ページの名前とパターン（窓の札に出す）。リンクの箱でなければ null
  function linkOf(n: Box): { page: string; pageName: string; pattern: PagePattern; look: LinkLook; clip: ClipRect | null; book: string | null } | null {
    const book = linkBookOf(n);
    if (book != null) {
      const w = ctx.opt.bookWindow?.(book, false);
      return { page: "", pageName: w?.title ?? t("見つからないブック（{id}）", { id: book }), pattern: w?.pattern ?? DEFAULT_VIEW, look: dataLinkLookOf(n), clip: clipOf(n), book };
    }
    const page = linkPageOf(n);
    if (page == null) return null;
    const view = pageWorld(ctx.source(), page).childView;
    return { page, pageName: pageName(page), pattern: isPattern(view) ? view : DEFAULT_VIEW, look: dataLinkLookOf(n), clip: clipOf(n), book: null };
  }
  // 窓に映す縮図のもと。マスターの窓は、見えている窓だけ縮図を取りに行かせる（隠れた箱の中の窓は題名だけ）
  function windowScene(n: Box): Scene {
    if (!isLinkBox(n)) return boxScene(n);
    const book = linkBookOf(n);
    if (book == null) return pageScene(linkPageOf(n) ?? "");
    return ctx.opt.bookWindow?.(book, !isHidden(n))?.scene ?? EMPTY_SCENE;
  }

  // ページの縮図のもと（リンクの箱の窓に映す。preview-art.ts。D27 段階 4）。描いたページは、ページを離れるときに配置の結果を覚える（captureScene）。
  // 覚えたものは、そのページのデータ（箱・線・world）が変わっていない間だけ使い、変わっていれば（外部の変更など）描き直すまで近似で映す。
  // 近似は、そのページの最上位の箱をデータの位置（無ければ 0,0）と大きさの指定（無ければ M の最小）で置き、最上位どうしの線を中心で結ぶ
  const scenes = new Map<string, { key: string; scene: Scene }>();
  // 今のページの縮図を覚える。data は今の状態を書き出したもの（toJSON。配置で決まった位置も書いてあるので、次に読むデータと鍵が合う）
  function captureScene(data: Diagram) {
    const page = ctx.page();
    scenes.set(page ?? "", { key: sceneKey(data, page), scene: sceneOf(ctx.geometry(), ctx.background()) });
  }
  // 描いていないページは、画面の外で並べて作る（届くまでは空の絵。近似は線や子が合わないので出さない。2026-10-14 ユーザー）
  const layingOut = new Set<string>();
  function pageScene(p: string): Scene {
    const hit = scenes.get(p);
    if (hit && hit.key === sceneKey(ctx.source(), p)) return hit.scene;
    if (!ctx.opt.sceneLayout) return dataScene(ctx.source(), p, ctx.opt);
    if (!layingOut.has(p)) {
      layingOut.add(p);
      // 組み立ての途中（描きながら呼ばれる）でデータを書き出さないよう、次の番で始める
      setTimeout(() => {
        if (!ctx.alive()) return;
        const k = sceneKey(ctx.source(), p);
        void ctx.opt.sceneLayout!(ctx.toJSON(), p === "" ? null : p).then(scene => {
          layingOut.delete(p);
          if (!ctx.alive()) return;
          scenes.set(p, { key: k, scene });
          ctx.redraw();
        }, () => layingOut.delete(p));
      }, 0);
    }
    return hit?.scene ?? EMPTY_SCENE; // 変わる前の絵があれば、届くまでそれを出す
  }

  // リストの子の中身の縮図（D13。2026-10-14 ユーザー）: その箱と子孫を 1 ページの図にして画面の外で並べ、箱自身の枠を除いて映す。
  // 鍵はその図のデータで、中身が変わるまで使い回す。届くまでは前の絵（無ければ空の絵）
  const boxScenes = new Map<string, { key: string; scene: Scene }>();
  function boxData(id: string): Diagram {
    const source = ctx.source();
    const ids = subtreeIds(source.nodes, id);
    const nodes = source.nodes.filter(s => ids.has(String(s.id)))
      .map(s => (String(s.id) === id ? { ...s, parent: undefined, page: undefined, x: 0, y: 0 } : s));
    const edges = (source.edges ?? []).map(normalizeEdge).filter(e => ids.has(String(e.from)) && ids.has(String(e.to)));
    return { world: { ...pageWorld(source, pageOf(source.nodes, id)), childView: undefined, root: undefined }, nodes, edges };
  }
  function boxScene(n: Box): Scene {
    const hit = boxScenes.get(n.id);
    if (!ctx.opt.sceneLayout) return hit?.scene ?? EMPTY_SCENE;
    const data = boxData(n.id), k = JSON.stringify(data);
    if (hit && hit.key === k) return hit.scene;
    const job = "box:" + n.id;
    if (!layingOut.has(job)) {
      layingOut.add(job);
      setTimeout(() => {
        if (!ctx.alive()) return;
        void ctx.opt.sceneLayout!(data, null, n.id).then(scene => {
          layingOut.delete(job);
          if (!ctx.alive()) return;
          boxScenes.set(n.id, { key: k, scene });
          ctx.redraw();
        }, () => layingOut.delete(job));
      }, 0);
    }
    return hit?.scene ?? EMPTY_SCENE;
  }

  return { linkOf, windowScene, captureScene, pageScene };
}
