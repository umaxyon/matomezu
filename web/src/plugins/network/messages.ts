// ネットワークの文言
import { defineMessages } from "../../plugin-api"

export const NETWORK_MESSAGES = defineMessages({
  Network: { en: "Network", ja: "ネットワーク" },
  "Host name": { en: "Host name", ja: "ホスト名" },
  "Connect with other hosts": { en: "Connect with other hosts", ja: "ホストとつなぐ" },
  "Listening at": { en: "Listening at", ja: "待っている所" },
  "Host key": { en: "Host key", ja: "このホストの鍵の印" },
  "Could not open the entrance for other hosts": {
    en: "Could not open the entrance for other hosts",
    ja: "ほかのホストを待つ入口を開けませんでした",
  },
  "Port {port} is used by another program": {
    en: "Port {port} is used by another program",
    ja: "ポート {port} がほかのプログラムに使われていて開けません",
  },
  "Use another port": { en: "Use another port", ja: "別のポートにする" },
  "With another port, firewall rules for port {port} and addresses typed in on other hosts stop working": {
    en: "With another port, firewall rules for port {port} and addresses typed in on other hosts stop working",
    ja: "別のポートにすると、ポート {port} に足したファイアウォールの規則と、ほかのホストで手で入れた待っている所が効かなくなります",
  },
  Cancel: { en: "Cancel", ja: "キャンセル" },
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
  pairedHost: { en: "Paired host", ja: "ペアリングしたホスト" },
  pairingRequest: { en: "Pairing request", ja: "ペアリングの頼み" },
  "Put a pairing request": { en: "Put a pairing request", ja: "ペアリングの頼みを載せる" },
  "Accept a pairing request": { en: "Accept a pairing request", ja: "ペアリングの頼みを受け入れる" },
  "Decline a pairing request": { en: "Decline a pairing request", ja: "ペアリングの頼みを断る" },
  "Put a paired host": { en: "Put a paired host", ja: "ペアリングしたホストを載せる" },
  "Unpair a host": { en: "Unpair a host", ja: "ペアリングを解く" },
})
