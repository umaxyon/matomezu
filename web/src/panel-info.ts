// サイドバーの情報タブ。選んでいるもの（ボックス・ワールド・線）の情報と設定を出し、変更を図へ渡す（panel.ts から使う）

import { closeColorPicker, openColorPicker } from "./color-picker";
import { esc, keyOf } from "./dom";
import type { Graph } from "./graph";
import { helpIcon } from "./help";
import { THEMES, isPaletteName, themeById } from "./theme";
import type { Brief, ChildView, Dash, EdgeInfo, Info, Overflow, Route, Shape, Size, TreeDirection } from "./types";

const OVERFLOW_LABELS: Record<Overflow, string> = {
  wrap: "幅に合わせて折り返す",
  grow: "中身に合わせて伸ばす",
  clip: "サイズで切り詰める",
};
const KIND_LABELS = { group: "グループ", box: "ボックス" };
const ROUTE_OPTIONS: [string, string][] = [["straight", "直線"], ["elbow", "折れ線"]];
const SIZE_HELP = "L: 幅は文字に合わせて 400 まで。越えると折り返す\nM: 幅は文字に合わせて 240 まで。越えると折り返す\n" +
  "S: 10 文字まで表示。小さい文字で高さは固定\n押すと、中身に合わせた大きさに戻ります";
const VIEW_OPTIONS: [string, string][] = [["nest", "内包"], ["tree", "ツリー"], ["list", "リスト"], ["hidden", "非表示"]];
const TREE_DIR_OPTIONS: [string, string][] = [["down", "↓ 下"], ["up", "↑ 上"], ["left", "← 左"], ["right", "→ 右"]];
const SHAPE_OPTIONS: [string, string][] = [["box", "ボックス"], ["person", "スティックマン"], ["db", "DB"], ["diamond", "ひし形"]];
const VIEW_HELP = "内包: 子を親の中に入れて見せます\nツリー: 子を親の上下左右にぶら下げて見せます（子は自動で並びます）\n" +
  "リスト: 子を縦に並べ、幅をそろえます（子のサイズや形は使わず、孫は非表示になります）\n" +
  "非表示: 子を隠し、▼ で子がいることだけを示します";
// リストの子では使わない設定（データはそのまま。リストから出すと元に戻る。docs/LIST-plan.md）
const IN_LIST = "リストの中では使いません（リストから出すと元に戻ります）";
const allDisabled = (options: [string, string][]) => new Map(options.map(([v]) => [v, IN_LIST]));
// ワールドの背景によく使う色（明るい色と暗い色）
const BG_PRESETS = ["#ffffff", "#f8fafc", "#fefce8", "#f0fdf4", "#eff6ff", "#1e1e1e", "#0f172a", "#1c1917"];

const THEME_HELP = THEMES.map(t => `${t.label}: ${t.describe}`).join("\n");

// テーマの選択（セレクトボックス。テーマが増えても幅が変わらないように）。箱では「受け継ぐ」（書かない）も選べ、
// 今効いているテーマを添える。選んでいるテーマの説明も出す。背景色のボタン（color）も、テーマの上の上書きなのでこの枠に置く
function themeSection(own: string | null, used: string, inherit: boolean, color: string, unknown: string | null): string {
  const value = own ?? (inherit ? "" : used);
  const options = (inherit ? [["", "受け継ぐ"]] : []).concat(THEMES.map(t => [t.id, t.label]));
  const t = themeById(used);
  return `<div class="mzp-section"><h3>テーマ${helpIcon(THEME_HELP)}</h3>
    <select class="mzp-input" name="mzp-theme" aria-label="テーマ">${options.map(([v, label]) =>
      `<option value="${esc(v!)}"${v === value ? " selected" : ""}>${esc(label!)}</option>`).join("")}</select>
    ${unknown ? `<p class="mzp-hint">「${esc(unknown)}」というテーマはありません。${inherit ? "受け継いだテーマ" : "標準"}で描いています</p>` : ""}
    <p class="mzp-hint">${inherit && own == null ? `今は「${esc(t.label)}」を受け継いでいます。` : ""}${esc(t.describe)}</p>
    ${color}
  </div>`;
}

// 背景色のボタン。押すと色を選ぶポップアップ（color-picker.ts）を開く。今の色と、色の値を出す（名前は出さない）
function colorButton(paint: string | null, text: string, help: string): string {
  return `<div class="mzp-field"><span>背景色${helpIcon(help)}</span>
    <button type="button" class="mzp-input mzp-color-btn" data-color-open aria-haspopup="dialog" aria-label="背景色を選ぶ">
      <span class="mzp-swatch" style="background:${esc(paint ?? "transparent")}"></span><span>${esc(text)}</span>
    </button>
  </div>`;
}

function chips(list: Brief[]): string {
  if (!list.length) return '<span class="mzp-none">なし</span>';
  return '<div class="mzp-chips">' + list.map(x =>
    `<button type="button" class="mzp-chip" data-select="${esc(x.id)}" title="${esc(x.caption)}">${esc(keyOf(x.id, x.caption))}</button>`
  ).join("") + "</div>";
}

// disabled は選べない値と、その理由（ポインタを乗せると出る）
function segment(name: string, value: string, options: [string, string][], disabled: Map<string, string> = new Map()): string {
  return '<div class="mzp-seg">' + options.map(([v, label]) => {
    const why = disabled.get(v);
    return `<label${why ? ` class="mzp-disabled" title="${esc(why)}"` : ""}><input type="radio" name="${name}" value="${v}"` +
      `${v === value ? " checked" : ""}${why ? " disabled" : ""}>${label}</label>`;
  }).join("") + "</div>";
}

// 選んだ線の情報: ID とつなぐ箱（始点・終点。押すとその箱を選ぶ）、矢印、消すボタン
function edgeHtml(info: EdgeInfo): string {
  const has = (side: "start" | "end") => info.arrow === side || info.arrow === "both";
  return `<div class="mzp-head"><span class="mzp-title">線</span></div>
    <div class="mzp-section"><h3>情報</h3><dl class="mzp-dl">
      <dt>ID</dt><dd>${esc(info.id)}</dd>
      <dt>始点</dt><dd>${chips([info.from])}</dd>
      <dt>終点</dt><dd>${chips([info.to])}</dd>
    </dl></div>
    <div class="mzp-section"><h3>編集</h3>
      <label class="mzp-field"><span>キャプション</span>
        <input class="mzp-input" type="text" data-edit="edge-caption" data-target="${esc(info.id)}" value="${esc(info.caption ?? "")}" placeholder="なし"></label>
      ${info.caption && info.captionMoved ? `<button type="button" class="mzp-chip" data-caption-reset="${esc(info.id)}">キャプションの位置を自動に戻す</button>` : ""}
    </div>
    ${info.self ? `<div class="mzp-section"><p class="mzp-hint">自分に戻る線です。箱の角の空いている所に輪を描きます（通り方や向きの指定は使いません）</p></div>` : `<div class="mzp-section"><h3>通り方</h3>
      ${segment("mzp-route", info.route, ROUTE_OPTIONS)}
    </div>`}
    ${info.self ? "" : `<div class="mzp-section"><h3>端の位置${helpIcon("線の端は、つまんで動かすとその位置に固定されます。固定していない端は、ボックスの位置から自動で決めます")}</h3>
      <button type="button" class="mzp-chip" data-align="${esc(info.id)}"${info.aligned ? ` disabled title="整列済みです"` : ""}>整列</button>${helpIcon("今の形のまま、両端を辺の真ん中（向き合う辺どうしで、まっすぐ結べるならまっすぐ結ぶ位置）に固定します。動かした途中の区間は自動に戻します")}
      <button type="button" class="mzp-chip" data-at-reset="${esc(info.id)}"${info.endsMoved ? "" : ` disabled title="端は自動で選んでいます"`}>接辺の自動選択</button>${helpIcon("端を動かしたり整列したりすると、その位置に固定されます。押すと固定をやめて、ボックスの位置からつなぐ辺と位置を自動で選ぶようにします。動かした途中の区間も自動に戻します")}
    </div>`}
    ${!info.self && info.via ? `<div class="mzp-section">
      <button type="button" class="mzp-chip" data-via-reset="${esc(info.id)}">折れ線を自動に戻す</button>${helpIcon("途中の区間を動かした形をやめて、ボックスの位置から自動で決めた形に戻します（端の固定はそのまま）")}
    </div>` : ""}
    <div class="mzp-section"><h3>線の種類</h3>
      ${segment("mzp-dash", info.dash, [["solid", "実線"], ["dashed", "破線"]])}
    </div>
    <div class="mzp-section"><h3>矢印</h3>
      <label class="mzp-check"><input type="checkbox" data-arrow="start"${has("start") ? " checked" : ""}>始点</label>
      <label class="mzp-check"><input type="checkbox" data-arrow="end"${has("end") ? " checked" : ""}>終点</label>
    </div>
    <div class="mzp-section">
      <button type="button" class="mzp-chip mzp-danger" data-remove-edge="${esc(info.id)}">線を消す</button>
    </div>`;
}

function html(info: Info): string {
  if (info.kind === "edge") return edgeHtml(info);
  const parts: string[] = [];

  if (info.kind === "world") {
    parts.push(`<div class="mzp-head"><span class="mzp-title">${esc(info.caption)}</span></div>`);
    parts.push(`<div class="mzp-section"><h3>図の題名${helpIcon("タブの見出しに出ます。空ならファイル名を出します（ファイル名は変わりません）")}</h3>
      <input class="mzp-input" type="text" data-edit="title" value="${esc(info.title ?? "")}" placeholder="ファイル名" aria-label="図の題名">
    </div>`);
    // 図の背景色も、箱と同じくボタンから色を選ぶポップアップを開く（見本は背景によく使う色）
    parts.push(themeSection(info.theme, info.themeUsed, false, colorButton(info.backgroundPaint, info.background ?? "なし",
      "図の背景の色。書けばテーマの背景より優先します"), info.themeUnknown));
    parts.push(`<div class="mzp-section"><h3>線の通り方（既定）${helpIcon("通り方を決めていない線は、これに従います")}</h3>
      ${segment("mzp-world-route", info.route, ROUTE_OPTIONS)}
    </div>`);
  } else {
    parts.push(`<div class="mzp-head">
      <span class="mzp-swatch" style="background:${esc(info.paint)}"></span>
      <span class="mzp-title">${esc(info.caption)}</span>
      <span class="mzp-kind">${KIND_LABELS[info.kind]}</span>
    </div>`);

    parts.push(`<div class="mzp-section"><h3>編集</h3>
      <label class="mzp-field"><span>キャプション</span>
        <input class="mzp-input" type="text" data-edit="caption" data-target="${esc(info.id)}" value="${esc(info.caption)}"></label>
    </div>`);
    // 背景色（箱の塗り）はテーマの枠に置く（キャプションの下だと文字の色に見えるため。2026-10-10 ユーザー）
    const valued = !!info.color && !isPaletteName(info.color);
    parts.push(themeSection(info.theme, info.themeUsed, true, colorButton(info.paint, valued ? info.color : info.color ? "" : "なし",
      "見本の色は、どのテーマでもそのテーマに合った色で描きます。好きな色（灰色も）を選ぶと、どのテーマでもその色で描きます"), info.themeUnknown));

    if (info.canShape) {
      parts.push(`<div class="mzp-section"><h3>形</h3>
        ${segment("mzp-shape", info.shape, SHAPE_OPTIONS)}
      </div>`);
    }

    parts.push(`<div class="mzp-section"><h3>サイズ${helpIcon(SIZE_HELP)}</h3>
      ${segment("mzp-size", info.size, [["L", "L"], ["M", "M"], ["S", "S"]], info.inList ? allDisabled([["L", ""], ["M", ""], ["S", ""]]) : undefined)}
      ${info.inList ? `<p class="mzp-hint">${IN_LIST}。幅はリストがそろえます</p>` : ""}
    </div>`);

    if (info.children.length) {
      parts.push(`<div class="mzp-section"><h3>子の見せ方${helpIcon(VIEW_HELP)}</h3>
        ${segment("mzp-view", info.childView, VIEW_OPTIONS, info.inList ? allDisabled(VIEW_OPTIONS) : undefined)}
        ${info.inList ? `<p class="mzp-hint">リストの中では、子は非表示にします（リストから出すと元に戻ります）</p>` : ""}
        ${info.childView === "tree" ? `<div class="mzp-subhead">向き</div>${segment("mzp-treedir", info.treeDirection, TREE_DIR_OPTIONS)}` : ""}
      </div>`);
    }
  }

  const rows: [string, string][] = [];
  if (info.kind !== "world") {
    rows.push(["ID", esc(info.id)]);
    rows.push(["親", info.parent ? chips([info.parent]) : "ワールド"]);
    rows.push(["位置", `${info.x}, ${info.y}`]);
  }
  rows.push(["子", chips(info.children)]);
  if (info.kind !== "world") rows.push(["つながり", chips(info.links)]);
  parts.push(`<div class="mzp-section"><h3>情報</h3><dl class="mzp-dl">${
    rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")
  }</dl></div>`);

  if (info.kind !== "world") {
    if (info.sizableChildren >= 2) {
      parts.push(`<div class="mzp-section"><h3>子のサイズ${helpIcon("一番小さい子に合わせて縮めます。中身の都合で縮められない子はそのままで、大きくなる子はありません（S サイズ、スティックマン、ツリー・非表示の子は対象外）")}</h3>
        <div class="mzp-chips">
          <button type="button" class="mzp-chip" data-fit="width">幅をそろえる</button>
          <button type="button" class="mzp-chip" data-fit="height">高さをそろえる</button>
          <button type="button" class="mzp-chip" data-fit="both">両方</button>
        </div>
      </div>`);
    }
    parts.push(`<div class="mzp-section"><h3>見た目</h3>
      <label class="mzp-check"><input type="checkbox" data-field="fill"${info.fill ? " checked" : ""}>塗りつぶし</label>
      <label class="mzp-check"><input type="checkbox" data-field="border"${info.border ? " checked" : ""}>枠線</label>
    </div>`);
  }

  // S サイズや、内包していない親では中身の扱いを使わない
  if (!info.overflows.length) return parts.join("");
  const target = info.kind === "box" ? "文字" : "子ボックス";
  parts.push(`<div class="mzp-section"><h3>中身（${target}）の扱い</h3>${
    // ワールドでは伸ばすを選べない理由を見せる。文字のボックスには伸ばすを出さない
    (["wrap", "grow", "clip"] as const).filter(ov => info.kind === "world" || info.overflows.includes(ov)).map(ov => {
      const ok = info.overflows.includes(ov);
      return `<label class="mzp-radio${ok ? "" : " mzp-disabled"}">
        <input type="radio" name="mzp-overflow" value="${ov}"${ov === info.overflow ? " checked" : ""}${ok ? "" : " disabled"}>
        ${OVERFLOW_LABELS[ov]}</label>${ok ? "" : '<div class="mzp-note">ワールドより外には伸ばせません</div>'}`;
    }).join("")
  }</div>`);
  return parts.join("");
}

export interface InfoTab {
  show(info: Info, keepTyping?: boolean): void;
}

export function createInfoTab(pane: HTMLElement, graph: Graph): InfoTab {
  let info: Info = graph.info(graph.selected());

  // 選んでいるもの（info）の表示。選択の知らせ（onSelect）のたびに作り直す。
  // 同じものを選んだまま作り直すとき（外部の変更の読み直しなど）は、入力中の欄の打ちかけの文字とフォーカスを引き継ぐ
  // （確定前の入力を消さないため。docs/REVIEW-2026-10-09.md の B10）。keepTyping が false なら引き継がない（Esc の取り消し）
  // 色を選ぶポップアップを開いている相手（箱の id か、ワールド）。選ぶものが変わったら閉じる。同じもののまま描き直すときは開いたまま
  let pickerFor: string | null = null;
  const pickerKey = (i: Info) => (i.kind === "world" ? "\u0000world" : i.kind === "edge" ? null : i.id);

  function show(next: Info, keepTyping = true) {
    if (pickerFor != null && pickerKey(next) !== pickerFor) {
      closeColorPicker();
      pickerFor = null;
    }
    const a = document.activeElement;
    const typing = keepTyping && a instanceof HTMLInputElement && pane.contains(a) && a.dataset.edit &&
      next.kind === info.kind && next.id === info.id
      ? { edit: a.dataset.edit, value: a.value, start: a.selectionStart, end: a.selectionEnd } : null;
    info = next;
    pane.innerHTML = html(info);
    if (!typing) return;
    const input = pane.querySelector<HTMLInputElement>(`[data-edit="${typing.edit}"]`);
    if (!input) return;
    input.value = typing.value;
    input.focus();
    if (typing.start != null) input.setSelectionRange(typing.start, typing.end ?? typing.start);
  }

  pane.addEventListener("click", e => {
    if (!(e.target instanceof Element)) return;
    const atReset = e.target.closest<HTMLElement>("[data-at-reset]");
    if (atReset) return graph.updateEdge(atReset.dataset.atReset!, { exitAt: null, enterAt: null, via: null });
    const align = e.target.closest<HTMLElement>("[data-align]");
    if (align) return graph.alignEdge(align.dataset.align!);
    const capReset = e.target.closest<HTMLElement>("[data-caption-reset]");
    if (capReset) return graph.updateEdge(capReset.dataset.captionReset!, { captionAt: null, captionOffset: null });
    const viaReset = e.target.closest<HTMLElement>("[data-via-reset]");
    if (viaReset) return graph.updateEdge(viaReset.dataset.viaReset!, { via: null });
    const delEdge = e.target.closest<HTMLElement>("[data-remove-edge]");
    if (delEdge) return graph.removeEdge(delEdge.dataset.removeEdge!);
    const chip = e.target.closest<HTMLElement>("[data-select]");
    if (chip) return graph.select(chip.dataset.select!);
    const colorBtn = e.target.closest<HTMLElement>("[data-color-open]");
    const key = pickerKey(info);
    if (colorBtn && key != null) {
      if (pickerFor === key) return closeColorPicker(); // もう一度押したら閉じる
      const onClose = () => { if (pickerFor === key) pickerFor = null; };
      if (info.kind === "world") {
        openColorPicker({
          anchor: colorBtn, value: info.background ?? "", paint: info.backgroundPaint ?? "#ffffff",
          palette: BG_PRESETS.map(c => ({ name: c, color: c })),
          onPick: c => graph.update(null, { background: c }), onClose,
        });
      } else if (info.kind !== "edge") {
        const id = info.id;
        openColorPicker({
          anchor: colorBtn, value: info.color, paint: info.paint, palette: info.palette,
          onPick: c => graph.update(id, { color: c }), onClose,
        });
      }
      pickerFor = key; // 開いたあとに覚える（開くと前のポップアップが閉じ、その onClose が先に走るため）
      return;
    }
    // サイズはクリックで受け取る（選んでいるサイズをもう一度押しても、大きさを戻せるように）
    if (e.target instanceof HTMLInputElement && e.target.name === "mzp-size") {
      return graph.update(info.id, { size: e.target.value as Size });
    }
    const fit = e.target.closest<HTMLElement>("[data-fit]");
    if (fit && info.id != null) graph.fitChildren(info.id, fit.dataset.fit as "width" | "height" | "both");
  });

  // 文字入力は Enter で確定する（フォーカスが外れたときも確定する）
  pane.addEventListener("keydown", e => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.matches(".mzp-input")) return;
    if (e.key === "Enter") t.blur();
    if (e.key === "Escape") show(info, false); // 打ちかけを捨てて、元の値に戻す
  });

  pane.addEventListener("change", e => {
    const t = e.target;
    if (t instanceof HTMLSelectElement && t.name === "mzp-theme") {
      return graph.update(info.kind === "world" ? null : info.id, { theme: t.value || null });
    }
    if (!(t instanceof HTMLInputElement)) return;
    if (t.name === "mzp-dash" && info.kind === "edge") return graph.updateEdge(info.id, { dash: t.value as Dash });
    if (t.name === "mzp-route" && info.kind === "edge") return graph.updateEdge(info.id, { route: t.value as Route });
    if (t.name === "mzp-world-route") return graph.update(null, { route: t.value as Route });
    // 矢印は、始点と終点の 2 つの選択を合わせて 1 つの値にする
    if (t.dataset.arrow && info.kind === "edge") {
      const on = (side: string) => !!pane.querySelector<HTMLInputElement>(`[data-arrow="${side}"]`)?.checked;
      const start = on("start"), end = on("end");
      return graph.updateEdge(info.id, { arrow: start && end ? "both" : start ? "start" : end ? "end" : null });
    }
    // 文字入力は、打っていたときの箱・線へ書く（data-target）。別の箱をクリックしてフォーカスが外れると、選択が切り替わって
    // サイドバーを描き直したあとで確定（change）が届くため、今の info を宛先にすると別の箱に書いてしまう
    const edit = t.dataset.edit;
    if (edit === "edge-caption" && t.dataset.target) return graph.updateEdge(t.dataset.target, { caption: t.value });
    if (edit === "caption" && t.dataset.target) return graph.update(t.dataset.target, { caption: t.value });
    if (edit === "title") return graph.update(null, { title: t.value });
    if (t.dataset.field) return graph.update(info.id, { [t.dataset.field]: t.checked });
    if (t.name === "mzp-overflow") return graph.update(info.id, { overflow: t.value as Overflow });
    if (t.name === "mzp-shape") return graph.update(info.id, { shape: t.value as Shape });
    if (t.name === "mzp-treedir") return graph.update(info.id, { treeDirection: t.value as TreeDirection });
    if (t.name === "mzp-view") return graph.update(info.id, { childView: t.value as ChildView });
  });

  show(info);
  return { show };
}
