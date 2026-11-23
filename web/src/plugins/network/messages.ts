// ネットワークの文言
import { defineMessages } from "../../plugin-api"

export const NETWORK_MESSAGES = defineMessages({
  "Network settings": { en: "Network settings", ja: "ネットワーク設定" },
  "Host name": { en: "Host name", ja: "ホスト名" },
  "Connect with other hosts": { en: "Connect with other hosts", ja: "ほかのホストとつなぐ" },
  "Listening at": { en: "Listening at", ja: "待っている所" },
  "Host key": { en: "Host key", ja: "このホストの鍵の印" },
  "Could not open the entrance for other hosts": {
    en: "Could not open the entrance for other hosts",
    ja: "ほかのホストを待つ入口を開けませんでした",
  },
  Copy: { en: "Copy", ja: "コピー" },
  Copied: { en: "Copied", ja: "コピーしました" },
  "Could not copy": { en: "Could not copy", ja: "コピーできませんでした" },
  "On WSL, other machines cannot reach this host until WSL is set up for it": {
    en: "On WSL, other machines cannot reach this host until WSL is set up for it",
    ja: "WSL では、設定するまでほかのマシンからこのホストに届きません",
  },
  "How to set up": { en: "How to set up", ja: "設定のしかた" },
  "In .wslconfig in your Windows user folder, add networkingMode=mirrored under [wsl2]": {
    en: "In .wslconfig in your Windows user folder, add networkingMode=mirrored under [wsl2]",
    ja: "Windows のユーザーのフォルダの .wslconfig の [wsl2] に networkingMode=mirrored を書く",
  },
  "Run wsl --shutdown in PowerShell (everything in WSL stops, AI sessions too), then start WSL again": {
    en: "Run wsl --shutdown in PowerShell (everything in WSL stops, AI sessions too), then start WSL again",
    ja: "PowerShell で wsl --shutdown を打ち、WSL を起動し直す（WSL の中の物は、AI のセッションも全部止まる）",
  },
  "In PowerShell as administrator, let the port in through the Hyper-V firewall:": {
    en: "In PowerShell as administrator, let the port in through the Hyper-V firewall:",
    ja: "管理者の PowerShell で、Hyper-V のファイアウォールにこのポートを通す:",
  },
})
