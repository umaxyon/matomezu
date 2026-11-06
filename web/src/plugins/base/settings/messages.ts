// 設定の文言
import { defineMessages } from "../../../core/i18n/messages"

export const SETTINGS_MESSAGES = defineMessages({
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
