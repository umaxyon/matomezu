// サイドバーの情報タブ。選んでいるもの（ボックス・ワールド・線）の情報と設定を出し、変更を図へ渡す（panel.ts から使う）

import { esc, keyOf, toHex } from "./dom";
import type { Graph } from "./graph";
import { helpIcon } from "./help";
import { THEMES, themeById } from "./theme";
import type { Axis, Brief, ChildView, Dash, EdgeInfo, Info, Overflow, Route, Shape, Size, TreeDirection } from "./types";

const OVERFLOW_LABELS: Record<Overflow, string> = {
  wrap: "幅に合わせて折り返す",
  grow: "中身に合わせて伸ばす",
  clip: "サイズで切り詰める",
};
const KIND_LABELS = { group: "グループ", box: "ボックス" };
const ROUTE_OPTIONS: [string, string][] = [["straight", "直線"], ["elbow", "折れ線"]];
const AXIS_OPTIONS: [string, string][] = [["auto", "自動"], ["horizontal", "左右"], ["vertical", "上下"]];
const SIZE_HELP = "L: 幅は文字に合わせて 400 まで。越えると折り返す\nM: 幅は文字に合わせて 240 まで。越えると折り返す\n" +
  "S: 10 文字まで表示。小さい文字で高さは固定\n押すと、中身に合わせた大きさに戻ります";
const VIEW_OPTIONS: [string, string][] = [["nest", "内包"], ["tree", "ツリー"], ["list", "リスト"], ["hidden", "非表示"]];
const TREE_DIR_OPTIONS: [string, string][] = [["down", "↓ 下"], ["up", "↑ 上"], ["left", "← 左"], ["right", "→ 右"]];
const SHAPE_OPTIONS: [string, string][] = [["box", "ボックス"], ["person", "スティックマン"], ["db", "DB"]];
const VIEW_HELP = "内包: 子を親の中に入れて見せます\nツリー: 子を親の上下左右にぶら下げて見せます（子は自動で並びます）\n" +
  "リスト: 子を縦に並べ、幅をそろえます（子のサイズや形は使わず、孫は非表示になります）\n" +
  "非表示: 子を隠し、▼ で子がいることだけを示します";
// リストの子では使わない設定（データはそのまま。リストから出すと元に戻る。docs/LIST-plan.md）
const IN_LIST = "リストの中では使いません（リストから出すと元に戻ります）";
const allDisabled = (options: [string, string][]) => new Map(options.map(([v]) => [v, IN_LIST]));
const PRESETS = ["#ffffff", "#3b82f6", "#22c55e", "#eab308", "#f97316", "#ef4444", "#a855f7", "#64748b"];
// ワールドの背景によく使う色（明るい色と暗い色）
const BG_PRESETS = ["#ffffff", "#f8fafc", "#fefce8", "#f0fdf4", "#eff6ff", "#1e1e1e", "#0f172a", "#1c1917"];

const THEME_OPTIONS: [string, string][] = THEMES.map(t => [t.id, t.label]);
const THEME_HELP = THEMES.map(t => `${t.label}: ${t.describe}`).join("\n");

// テーマの選択。箱では「受け継ぐ」（書かない）も選べ、今効いているテーマを添える
function themeSection(own: string | null, used: string, inherit: boolean): string {
  const options: [string, string][] = inherit ? [["", "受け継ぐ"], ...THEME_OPTIONS] : THEME_OPTIONS;
  return `<div class="mzp-section"><h3>テーマ${helpIcon(THEME_HELP)}</h3>
    ${segment("mzp-theme", own ?? (inherit ? "" : used), options)}
    ${inherit && own == null ? `<p class="mzp-hint">今は「${esc(themeById(used).label)}」を受け継いでいます</p>` : ""}
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

// 向きの指定で選べない値。横か縦に並ぶ箱どうしは、始点と終点の向きをそろえないと素直に引けない（妙な線を引かせない）
function axisDisabled(info: EdgeInfo, other: Axis | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!other || (info.arrangement !== "side" && info.arrangement !== "stack")) return out;
  const why = `${info.arrangement === "side" ? "横" : "縦"}に並ぶボックスどうしは、始点と終点の向きをそろえます`;
  for (const v of ["horizontal", "vertical"]) if (v !== other) out.set(v, why);
  return out;
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
        <input class="mzp-input" type="text" data-edit="edge-caption" value="${esc(info.caption ?? "")}" placeholder="なし"></label>
      ${info.caption && info.captionMoved ? `<button type="button" class="mzp-chip" data-caption-reset="${esc(info.id)}">キャプションの位置を自動に戻す</button>` : ""}
    </div>
    ${info.self ? `<div class="mzp-section"><p class="mzp-hint">自分に戻る線です。箱の角の空いている所に輪を描きます（通り方や向きの指定は使いません）</p></div>` : `<div class="mzp-section"><h3>通り方</h3>
      ${segment("mzp-route", info.route, ROUTE_OPTIONS)}
    </div>`}
    ${!info.self && info.route === "elbow" ? `<div class="mzp-section"><h3>向きの指定${helpIcon("左右・上下にすると、その端はその辺から出入りします。横や縦に並ぶボックスどうしは、両端の向きをそろえたときだけ選べます（ボックスを動かしてそろわなくなったら、自動に戻ります）")}</h3>
      <div class="mzp-subhead">始点</div>
      ${segment("mzp-exit", info.exit ?? "auto", AXIS_OPTIONS, axisDisabled(info, info.enter))}
      <div class="mzp-subhead">終点</div>
      ${segment("mzp-enter", info.enter ?? "auto", AXIS_OPTIONS, axisDisabled(info, info.exit))}
    </div>` : ""}
    ${info.endsMoved ? `<div class="mzp-section">
      <button type="button" class="mzp-chip" data-at-reset="${esc(info.id)}">端の位置を自動に戻す</button>${helpIcon("線の両端を、ボックスの中心どうしを結ぶ位置に戻します")}
    </div>` : ""}
    ${!info.self && info.via ? `<div class="mzp-section">
      <button type="button" class="mzp-chip" data-via-reset="${esc(info.id)}">折れ線を自動に戻す</button>${helpIcon("途中の区間を動かした形と、向きの指定をやめて、ボックスの位置から自動で決めた形に戻します")}
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
    const bg = info.background;
    const hex = bg ? toHex(bg) : "#ffffff";
    parts.push(`<div class="mzp-section"><h3>背景</h3>
      <div class="mzp-field"><span>色</span>
        <div class="mzp-color">
          <input class="mzp-picker" type="color" data-edit="bg-picker" value="${hex}" aria-label="背景の色を選ぶ">
          <input class="mzp-input" type="text" data-edit="background" value="${esc(bg ?? "")}" placeholder="なし" aria-label="背景の色の値">
        </div>
      </div>
      <div class="mzp-presets">${BG_PRESETS.map(c =>
        `<button type="button" class="mzp-preset" data-bg="${c}" style="background:${c}" title="${c}" aria-pressed="${bg != null && c === hex}"></button>`
      ).join("")}<button type="button" class="mzp-chip" data-bg="" aria-pressed="${bg == null}">なし</button></div>
    </div>`);
    parts.push(themeSection(info.theme, info.themeUsed, false));
    parts.push(`<div class="mzp-section"><h3>線の通り方（既定）${helpIcon("通り方を決めていない線は、これに従います")}</h3>
      ${segment("mzp-world-route", info.route, ROUTE_OPTIONS)}
    </div>`);
  } else {
    parts.push(`<div class="mzp-head">
      <span class="mzp-swatch" style="background:${esc(info.color)}"></span>
      <span class="mzp-title">${esc(info.caption)}</span>
      <span class="mzp-kind">${KIND_LABELS[info.kind]}</span>
    </div>`);

    const hex = toHex(info.color);
    parts.push(`<div class="mzp-section"><h3>編集</h3>
      <label class="mzp-field"><span>キャプション</span>
        <input class="mzp-input" type="text" data-edit="caption" value="${esc(info.caption)}"></label>
      <div class="mzp-field"><span>色</span>
        <div class="mzp-color">
          <input class="mzp-picker" type="color" data-edit="picker" value="${hex}" aria-label="色を選ぶ">
          <input class="mzp-input" type="text" data-edit="color" value="${esc(info.color)}" aria-label="色の値">
        </div>
      </div>
      <div class="mzp-presets">${PRESETS.map(c =>
        `<button type="button" class="mzp-preset" data-color="${c}" style="background:${c}" title="${c}" aria-pressed="${c === hex}"></button>`
      ).join("")}</div>
      ${info.usesColor ? "" : `<p class="mzp-hint">このテーマ（${esc(themeById(info.themeUsed).label)}）では、箱ごとの色は使いません。色はデータに残り、テーマを「標準」にすると効きます</p>`}
    </div>`);
    parts.push(themeSection(info.theme, info.themeUsed, true));

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
  function show(next: Info, keepTyping = true) {
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
    if (atReset) return graph.updateEdge(atReset.dataset.atReset!, { exitAt: null, enterAt: null });
    const capReset = e.target.closest<HTMLElement>("[data-caption-reset]");
    if (capReset) return graph.updateEdge(capReset.dataset.captionReset!, { captionAt: null, captionOffset: null });
    const viaReset = e.target.closest<HTMLElement>("[data-via-reset]");
    if (viaReset) return graph.updateEdge(viaReset.dataset.viaReset!, { via: null, exit: null, enter: null });
    const delEdge = e.target.closest<HTMLElement>("[data-remove-edge]");
    if (delEdge) return graph.removeEdge(delEdge.dataset.removeEdge!);
    const chip = e.target.closest<HTMLElement>("[data-select]");
    if (chip) return graph.select(chip.dataset.select!);
    const preset = e.target.closest<HTMLElement>("[data-color]");
    if (preset) return graph.update(info.id, { color: preset.dataset.color! });
    const bg = e.target.closest<HTMLElement>("[data-bg]");
    if (bg) return graph.update(null, { background: bg.dataset.bg || null });
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
    if (!(t instanceof HTMLInputElement)) return;
    if (t.name === "mzp-dash" && info.kind === "edge") return graph.updateEdge(info.id, { dash: t.value as Dash });
    if (t.name === "mzp-route" && info.kind === "edge") return graph.updateEdge(info.id, { route: t.value as Route });
    if ((t.name === "mzp-exit" || t.name === "mzp-enter") && info.kind === "edge") {
      return graph.updateEdge(info.id, { [t.name === "mzp-exit" ? "exit" : "enter"]: t.value === "auto" ? null : t.value as Axis });
    }
    if (t.name === "mzp-world-route") return graph.update(null, { route: t.value as Route });
    if (t.name === "mzp-theme") return graph.update(info.kind === "world" ? null : info.id, { theme: t.value || null });
    // 矢印は、始点と終点の 2 つの選択を合わせて 1 つの値にする
    if (t.dataset.arrow && info.kind === "edge") {
      const on = (side: string) => !!pane.querySelector<HTMLInputElement>(`[data-arrow="${side}"]`)?.checked;
      const start = on("start"), end = on("end");
      return graph.updateEdge(info.id, { arrow: start && end ? "both" : start ? "start" : end ? "end" : null });
    }
    const edit = t.dataset.edit;
    if (edit === "edge-caption" && info.kind === "edge") return graph.updateEdge(info.id, { caption: t.value });
    if (edit === "caption") return graph.update(info.id, { caption: t.value });
    if (edit === "title") return graph.update(null, { title: t.value });
    if (edit === "picker" || edit === "color" || edit === "bg-picker" || edit === "background") {
      const color = t.value.trim();
      // 解釈できない色の文字列は受け付けずに元へ戻す
      if (color && !CSS.supports("color", color)) return show(info);
      if (edit.startsWith("bg") || edit === "background") return graph.update(null, { background: color || null });
      return graph.update(info.id, { color });
    }
    if (t.dataset.field) return graph.update(info.id, { [t.dataset.field]: t.checked });
    if (t.name === "mzp-overflow") return graph.update(info.id, { overflow: t.value as Overflow });
    if (t.name === "mzp-shape") return graph.update(info.id, { shape: t.value as Shape });
    if (t.name === "mzp-treedir") return graph.update(info.id, { treeDirection: t.value as TreeDirection });
    if (t.name === "mzp-view") return graph.update(info.id, { childView: t.value as ChildView });
  });

  show(info);
  return { show };
}
