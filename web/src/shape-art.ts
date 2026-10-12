// 絵の形の絵（スティックマン・DB・サーバー・パソコンなど）。形ごとの SVG の中身を、ここに 1 つずつ書く。
// 絵の大きさ（viewBox の幅と高さ。L・M ではこの px で描き、S は縮める）は形の表（shapes.ts の art）。
// 描き方（render.ts）は部品の役割のクラスで塗り分ける（色は箱の色から作る。塗りが無ければ全部を線だけにする）:
//   mz-art-body  … 箱の色で塗る
//   mz-art-light … 箱の色を明るくして塗る（立体の上面や、光るところ）
//   mz-art-dark  … 箱の色を暗くして塗る（立体の側面や、台座）
//   mz-art-line  … 塗らずに線だけ（溝やひげなど）
//   mz-art-dot   … 線の色で塗りつぶし、線は引かない（目やランプなどの小さな印）
// スティックマンだけは線の絵で、塗り分けを使わない（mz-figure。render.ts）
import type { Shape } from "./types";

export const SHAPE_ART: Partial<Record<Shape, string>> = {
  // スティックマン（36×52）
  person: '<g class="mz-figure"><circle cx="18" cy="8" r="6.5"/><path d="M18 14.5V33M5 21.5H31M18 33 7 50M18 33 29 50"/></g>',
  // DB（円柱を斜め上から見た立体。40×52）。胴と上面
  db: '<path class="mz-art-body" d="M3 9V43A17 6 0 0 0 37 43V9"/><ellipse class="mz-art-light" cx="20" cy="9" rx="17" ry="6"/>',
  // サーバー（タワー型の筐体を斜め上から見た立体。40×52）。前面・上面・側面と、前面のドライブの溝 2 本とランプ
  server:
    '<path class="mz-art-light" d="M3 10 11 3H37L29 10Z"/><path class="mz-art-dark" d="M29 10 37 3V43L29 50Z"/>' +
    '<path class="mz-art-body" d="M3 10H29V50H3Z"/><path class="mz-art-line" d="M7 16H25M7 21H25"/>' +
    '<circle class="mz-art-dot" cx="23" cy="28" r="2"/>',
  // パソコン（画面と台。52×46）
  pc:
    '<path class="mz-art-dark" d="M21 35H31L33 42H19Z"/><rect class="mz-art-body" x="13" y="41" width="26" height="4" rx="1.5"/>' +
    '<rect class="mz-art-body" x="2" y="2" width="48" height="34" rx="3"/><rect class="mz-art-light" x="6" y="6" width="40" height="25" rx="1"/>',
  // 工場（のこぎり屋根の建物と煙突。52×46）
  factory:
    '<rect class="mz-art-dark" x="38" y="3" width="8" height="24"/>' +
    '<path class="mz-art-body" d="M2 44V22L14 13V22L26 13V22L38 13V44Z"/>' +
    '<rect class="mz-art-light" x="7" y="29" width="7" height="6"/><rect class="mz-art-light" x="19" y="29" width="7" height="6"/>' +
    '<rect class="mz-art-light" x="31" y="29" width="7" height="6"/>',
  // 書類（右上を折った紙と文字の行。40×52）
  document:
    '<path class="mz-art-body" d="M4 2H27L36 11V50H4Z"/><path class="mz-art-light" d="M27 2V11H36Z"/>' +
    '<path class="mz-art-line" d="M10 20H30M10 27H30M10 34H30M10 41H22"/>',
  // ゴミ箱（ふたと取っ手、縦の筋。40×52）
  trash:
    '<path class="mz-art-line" d="M15 8V4H25V8"/><path class="mz-art-body" d="M6 13H34L31 49H9Z"/>' +
    '<rect class="mz-art-dark" x="3" y="8" width="34" height="5" rx="1.5"/><path class="mz-art-line" d="M14 19 15 43M20 19V43M26 19 25 43"/>',
  // ロボット（アンテナ・耳・目と口のある頭と、胴。44×52）
  robot:
    '<path class="mz-art-line" d="M22 4V9"/><circle class="mz-art-dot" cx="22" cy="3.5" r="2.5"/>' +
    '<rect class="mz-art-dark" x="2" y="16" width="5" height="10" rx="1.5"/><rect class="mz-art-dark" x="37" y="16" width="5" height="10" rx="1.5"/>' +
    '<rect class="mz-art-light" x="12" y="35" width="20" height="15" rx="3"/>' +
    '<rect class="mz-art-body" x="7" y="9" width="30" height="24" rx="5"/>' +
    '<circle class="mz-art-dot" cx="16" cy="19" r="3.5"/><circle class="mz-art-dot" cx="28" cy="19" r="3.5"/><path class="mz-art-line" d="M16 27H28"/>',
  // 猫の顔（耳・目・鼻・口・ひげ。48×46）
  cat:
    '<path class="mz-art-body" d="M7 22 8 2 21 13ZM41 22 40 2 27 13Z"/><path class="mz-art-light" d="M10.5 16 11 7 17 12.5ZM37.5 16 37 7 31 12.5Z"/>' +
    '<ellipse class="mz-art-body" cx="24" cy="28" rx="20" ry="16"/>' +
    '<ellipse class="mz-art-dot" cx="16.5" cy="25" rx="2.5" ry="3.5"/><ellipse class="mz-art-dot" cx="31.5" cy="25" rx="2.5" ry="3.5"/>' +
    '<path class="mz-art-dot" d="M21.5 31H26.5L24 34Z"/><path class="mz-art-line" d="M24 34V36.5M24 36.5C22.5 38.5 20 38.5 19 37M24 36.5C25.5 38.5 28 38.5 29 37"/>' +
    '<path class="mz-art-line" d="M2 30H12M3 36 12 34M46 30H36M45 36 36 34"/>',
  // ハート（48×44）。左上に光
  heart:
    '<path class="mz-art-body" d="M24 42C8 30 2 22 2 13 2 6 7 2 13 2 18 2 22 5 24 9 26 5 30 2 35 2 41 2 46 6 46 13 46 22 40 30 24 42Z"/>' +
    '<ellipse class="mz-art-light" cx="12" cy="12" rx="4" ry="3" transform="rotate(-35 12 12)"/>',
  // 電球（ひらめき。光の線と、ガラス・フィラメント・口金。48×52）
  bulb:
    '<path class="mz-art-line" d="M2 18H7M41 18H46M7 4 11 8M41 4 37 8"/>' +
    '<path class="mz-art-light" d="M24 2C33 2 40 9 40 18 40 25 35 29 33 34H15C13 29 8 25 8 18 8 9 15 2 24 2Z"/>' +
    '<path class="mz-art-line" d="M19 34V27L21 23 24 28 27 23 29 27V34"/>' +
    '<rect class="mz-art-dark" x="15" y="34" width="18" height="10" rx="2"/><path class="mz-art-line" d="M15 39H33"/>' +
    '<path class="mz-art-dark" d="M19 44H29L27 49H21Z"/>',
  // 犬の顔（猫の顔と同じく正面。垂れ耳・目・口元・鼻・口。48×46）
  dog:
    '<ellipse class="mz-art-body" cx="24" cy="25" rx="16" ry="17"/>' +
    '<path class="mz-art-dark" d="M12 8C4 9 1 20 4 31 6 34 10 32 12 27ZM36 8C44 9 47 20 44 31 42 34 38 32 36 27Z"/>' +
    '<ellipse class="mz-art-light" cx="24" cy="34" rx="8.5" ry="6.5"/>' +
    '<circle class="mz-art-dot" cx="17.5" cy="22" r="2.3"/><circle class="mz-art-dot" cx="30.5" cy="22" r="2.3"/>' +
    '<ellipse class="mz-art-dot" cx="24" cy="30.5" rx="3" ry="2.2"/>' +
    '<path class="mz-art-line" d="M24 32.7V35M24 35C22.5 37 20 37 19 35.5M24 35C25.5 37 28 37 29 35.5"/>',
  // 森（大小の木が 3 本。52×46）
  forest:
    '<rect class="mz-art-dark" x="11" y="34" width="4" height="10"/><rect class="mz-art-dark" x="37" y="34" width="4" height="10"/>' +
    '<rect class="mz-art-dark" x="24" y="32" width="4" height="12"/>' +
    '<path class="mz-art-body" d="M13 8 23 36H3Z"/><path class="mz-art-body" d="M39 8 49 36H29Z"/>' +
    '<path class="mz-art-light" d="M26 2 38 34H14Z"/>',
  // 家（三角の屋根・煙突・窓・戸。48×46）
  house:
    '<rect class="mz-art-dark" x="33" y="6" width="6" height="12"/>' +
    '<path class="mz-art-body" d="M7 22V44H41V22"/><path class="mz-art-dark" d="M2 24 24 4 46 24Z"/>' +
    '<rect class="mz-art-light" x="11" y="27" width="9" height="8"/><rect class="mz-art-light" x="27" y="29" width="9" height="15"/>',
  // 家族（大人ふたりと子ども。52×46）
  family:
    '<circle class="mz-art-body" cx="12" cy="8" r="6"/><path class="mz-art-body" d="M3 44V24C3 18 7 16 12 16S21 18 21 24V44Z"/>' +
    '<circle class="mz-art-body" cx="40" cy="8" r="6"/><path class="mz-art-body" d="M31 44V24C31 18 35 16 40 16S49 18 49 24V44Z"/>' +
    '<circle class="mz-art-light" cx="26" cy="22" r="4.5"/><path class="mz-art-light" d="M19 44V33C19 29 22 28 26 28S33 29 33 33V44Z"/>',
};
