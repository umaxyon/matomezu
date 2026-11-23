// 設定の文言
import { defineMessages } from "../../../core/i18n/messages"

export const SETTINGS_MESSAGES = defineMessages({
  // 設定カテゴリ「ユーザー設定」（categories.tsx）
  "User settings": { en: "User settings", ja: "ユーザー設定" },
  "User name": { en: "User name", ja: "ユーザー名" },
  You: { en: "You", ja: "あなた" },
  // コーナーステータスの並びの設定（CornerStatusOrderSetting.tsx）
  "Move {name} up": { en: "Move {name} up", ja: "{name}を前へ" },
  "Move {name} down": { en: "Move {name} down", ja: "{name}を後ろへ" },
  // 追加プラグインの有効・無効の設定（EnabledPluginsSetting.tsx）
  "Enabled plugins": { en: "Enabled plugins", ja: "有効なプラグイン" },
  "No added plugins": { en: "No plugins have been added", ja: "追加したプラグインはありません" },
  "Disable the plugin?": { en: "Disable the plugin?", ja: "プラグインを無効にしますか？" },
  "Disabling {plugin} makes these unreadable. They move to the unreadable folder": {
    en: "Disabling {plugin} makes these unreadable. They move to the unreadable folder",
    ja: "{plugin} を無効にすると、次の物が読めなくなり、読めない物のフォルダへ移ります",
  },
  "{count} pages": { en: "{count} pages", ja: "ページ {count} 枚" },
  "{count} items": { en: "{count} items", ja: "{count} 件" },
  'Book "{place}": {count} pages': { en: 'Book "{place}": {count} pages', ja: "・ブック「{place}」 {count} 枚" },
  'Book "{place}": {count} items': { en: 'Book "{place}": {count} items', ja: "・ブック「{place}」 {count} 件" },
  'Folder "{place}": {count} pages': {
    en: 'Folder "{place}": {count} pages',
    ja: "・フォルダ「{place}」のページ {count} 枚",
  },
  'Folder "{place}": {count} items': { en: 'Folder "{place}": {count} items', ja: "・フォルダ「{place}」 {count} 件" },
  "Enable it again and they go back where they were": {
    en: "Enable it again and they go back where they were",
    ja: "有効に戻すと、元の場所へ戻ります",
  },
  "{count} more places": { en: "{count} more places", ja: "・ほか {count} か所" },
  Disable: { en: "Disable", ja: "無効にする" },
  "Could not check what will move": { en: "Could not check what will move", ja: "移る物を確かめられませんでした" },
  Plugins: { en: "Plugins", ja: "プラグイン" },
  Language: { en: "Language", ja: "言語" },
  Skin: { en: "Skin", ja: "スキン" },
  "Shortcut keys": { en: "Shortcut keys", ja: "ショートカットキー" },
  Settings: { en: "Settings", ja: "設定" },
  Auto: { en: "Auto", ja: "自動" },
  "Open settings": { en: "Open settings", ja: "設定を開く" },
  General: { en: "General", ja: "全体" },
  Close: { en: "Close", ja: "閉じる" },
  "Search shortcut keys": { en: "Search shortcut keys", ja: "ショートカットキーを探す" },
  "Reset all": { en: "Reset all", ja: "全部を既定に戻す" },
  Reset: { en: "Reset", ja: "既定に戻す" },
  "Remove {key} from {command}": { en: "Remove {key} from {command}", ja: "「{command}」から {key} を外す" },
  "Add a key to {command}": { en: "Add a key to {command}", ja: "「{command}」にキーを足す" },
  "Press a key": { en: "Press a key", ja: "キーを押してください" },
  "Press a key for {command}": { en: "Press a key for {command}", ja: "「{command}」に足すキーを押す" },
  "{key} is used by {other}. It will stop working there": {
    en: "{key} is used by {other}. It will stop working there",
    ja: "{key} は「{other}」で使っています。付けるとそちらでは効かなくなります",
  },
  Assign: { en: "Assign", ja: "付ける" },
  "{key} is not working: {other} uses it first": {
    en: "{key} is not working: {other} uses it first",
    ja: "{key} は効いていません（「{other}」が先に使っています）",
  },
  "No shortcut keys match": { en: "No shortcut keys match", ja: "当てはまるショートカットキーはありません" },
  "Reset all shortcut keys to the defaults?": {
    en: "Reset all shortcut keys to the defaults?",
    ja: "ショートカットキーを全部、既定に戻しますか",
  },
})
