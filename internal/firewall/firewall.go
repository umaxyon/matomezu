// Package firewall は、Windows のファイアウォールに、ホストどうしの入口の受けの規則を作り・消し・読む。
//
// 規則は入口の TCP のポートごとに 2 本と、mDNS の UDP 5353 の 1 本（どれもグループ matomezu、網の種類は全部）:
//   - matomezu-tcp-<ポート>-block: プライベートアドレス（10/8・172.16/12・192.168/16）の外から、そのポートへ届く物を止める
//   - matomezu-tcp-<ポート>: そのポートへ、相手を絞らずに通す
//   - matomezu-udp-5353: mDNS へ、プライベートアドレスから通す（同じ PC の入口どうしで 1 本を分け合う）
//
// 根拠（Windows 11 で確かめた物）:
//   - 許可のダイアログは、待ち始めた exe に、いまの網の種類で相手を絞らずに通す規則が無いと出る（exe でなくポートに付けた規則でもよい）。
//     TCP は、相手を絞った許可ではダイアログが出るので、相手を絞らない許可に、外を止める規則を同じポートに重ねて絞る。
//     止める規則は許可より強く効く。UDP 5353 は、相手を絞った許可でダイアログが出ない
//   - ダイアログで押した物は、exe の場所（版ごと）に付く規則になり、キャンセルなら止める規則になる。許可するときにそれらを消す
//   - 規則を変えるには OS の管理者の権限が要る（UAC）。グループや exe で絞れば、読むのは管理者なしでできる。
//     効いている規則（ActiveStore）に、保存した規則（PersistentStore）が無ければ、PC の設定でその PC の規則が効いていない
//   - New-NetFirewallRule は IPv6 の ::/0 を断る。入口は Windows では IPv4 だけで待つので、IPv6 は規則に入れない
package firewall

import (
	"fmt"
	"strings"
)

// State は、入口のポートについての規則の様子
type State string

const (
	Allowed     State = "allowed"     // 規則がそろって効いている
	Absent      State = "absent"      // matomezu の規則が無い（許可していない）
	Ineffective State = "ineffective" // 許可しようとしたが、つなげない（UAC が通らない・PC の設定で効かない・exe を止める規則がある など）
)

// Group は、matomezu が作る規則のグループ
const Group = "matomezu"

// MDNSPort は、mDNS の UDP のポート
const MDNSPort = 5353

// Rule は、読んだ規則 1 本（グループ matomezu の物）
type Rule struct {
	Name     string `json:"name"`
	Enabled  bool   `json:"enabled"`
	Action   string `json:"action"`   // Allow か Block
	Protocol string `json:"protocol"` // TCP か UDP
	Port     string `json:"port"`     // 受けるポート
}

// Reading は、管理者なしで読んだ規則の様子
type Reading struct {
	Active     []Rule `json:"active"`     // 効いている規則
	Persistent []Rule `json:"persistent"` // この PC に保存した規則
	ExeBlocked bool   `json:"exeBlocked"` // 動いている exe を止める規則がある（ダイアログでキャンセルした物）
}

// Rules は、規則を読み書きする物（Windows のほかは無い）。Allow・Deny・Move は UAC を出し、利用者が答えるまで返らない
type Rules interface {
	Read() (Reading, error)
	Allow(port int) error
	Deny(port int) error
	Move(from, to int) error // to の規則を作り、from の規則を消す（UAC 1 回）
}

// TCPRuleName・TCPBlockRuleName・MDNSRuleName は、規則の Name（ASCII。表示名は日本語なので、見分けには使わない）
func TCPRuleName(port int) string      { return fmt.Sprintf("matomezu-tcp-%d", port) }
func TCPBlockRuleName(port int) string { return fmt.Sprintf("matomezu-tcp-%d-block", port) }

const MDNSRuleName = "matomezu-udp-5353"

// Decide は、読んだ規則 r と入口のポート port から、様子を決める。failed は、直前に許可しようとして（付け替えも）、そろわなかった。
// exe を止める規則だけがあるときは、まだ許可を押していないので無い様子（許可すれば、その規則を消す）
func Decide(r Reading, port int, failed bool) State {
	if failed {
		return Ineffective
	}
	if !r.ExeBlocked && has(r.Active, TCPRuleName(port), "Allow") && has(r.Active, TCPBlockRuleName(port), "Block") && has(r.Active, MDNSRuleName, "Allow") {
		return Allowed
	}
	if has(r.Persistent, TCPRuleName(port), "") || has(r.Persistent, TCPBlockRuleName(port), "") || has(r.Active, TCPRuleName(port), "") {
		return Ineffective
	}
	return Absent
}

func has(rules []Rule, name, action string) bool {
	for _, r := range rules {
		if r.Name == name && r.Enabled && (action == "" || r.Action == action) {
			return true
		}
	}
	return false
}

// プライベートアドレスの外（止める規則の相手）と、プライベートアドレス（mDNS の許可の相手）
const (
	outsidePrivate = "'0.0.0.0-9.255.255.255','11.0.0.0-172.15.255.255','172.32.0.0-192.167.255.255','192.169.0.0-255.255.255.255'"
	private        = "'10.0.0.0/8','172.16.0.0/12','192.168.0.0/16'"
)

// 管理者として流す中身。受け取るのはポートの番号だけで、ValidPort で確かめてから埋める
const scriptHead = "$ProgressPreference='SilentlyContinue'\n$ErrorActionPreference='Stop'\n"

// exe を止める規則と、古い版の exe ごとの規則（ダイアログが作った物）。管理者として流すと $env:USERPROFILE が利用者のものとは限らないので、場所の形で探す
const dropExeRules = "Get-NetFirewallApplicationFilter | Where-Object { $_.Program -like '*\\.matomezu\\bin\\*\\matomezu.exe' } | Get-NetFirewallRule | Remove-NetFirewallRule\n"

func allowScript(port int) string {
	var b strings.Builder
	b.WriteString(dropExeRules)
	fmt.Fprintf(&b, "Remove-NetFirewallRule -Name '%s' -ErrorAction SilentlyContinue\n", TCPRuleName(port))
	fmt.Fprintf(&b, "Remove-NetFirewallRule -Name '%s' -ErrorAction SilentlyContinue\n", TCPBlockRuleName(port))
	// 止める規則を先に作る（許可だけができて、誰からでも届く間を作らない）
	fmt.Fprintf(&b, "New-NetFirewallRule -Name '%s' -DisplayName 'matomezu (TCP %d) LAN の外を止める' -Group '%s' -Direction Inbound -Action Block -Protocol TCP -LocalPort %d -RemoteAddress %s -Profile Any | Out-Null\n",
		TCPBlockRuleName(port), port, Group, port, outsidePrivate)
	fmt.Fprintf(&b, "New-NetFirewallRule -Name '%s' -DisplayName 'matomezu (TCP %d)' -Group '%s' -Direction Inbound -Action Allow -Protocol TCP -LocalPort %d -Profile Any | Out-Null\n",
		TCPRuleName(port), port, Group, port)
	fmt.Fprintf(&b, "if (-not (Get-NetFirewallRule -Name '%s' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -Name '%s' -DisplayName 'matomezu (UDP %d mDNS)' -Group '%s' -Direction Inbound -Action Allow -Protocol UDP -LocalPort %d -RemoteAddress %s -Profile Any | Out-Null }\n",
		MDNSRuleName, MDNSRuleName, MDNSPort, Group, MDNSPort, private)
	return b.String()
}

func denyScript(port int) string {
	var b strings.Builder
	// 許可を先に消す（止める規則だけが残る間はあっても、誰からでも届く間を作らない）
	fmt.Fprintf(&b, "Remove-NetFirewallRule -Name '%s' -ErrorAction SilentlyContinue\n", TCPRuleName(port))
	fmt.Fprintf(&b, "Remove-NetFirewallRule -Name '%s' -ErrorAction SilentlyContinue\n", TCPBlockRuleName(port))
	// mDNS の規則は、どのポートの許可も無くなったら消す（同じ PC のほかの入口が使っている間は残す）
	fmt.Fprintf(&b, "if (-not (Get-NetFirewallRule -Group '%s' -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'matomezu-tcp-*' })) { Remove-NetFirewallRule -Name '%s' -ErrorAction SilentlyContinue }\n",
		Group, MDNSRuleName)
	return b.String()
}

// ValidPort は、規則に埋めてよいポートの番号か
func ValidPort(port int) bool { return port > 0 && port < 65536 }

// AllowScript・DenyScript・MoveScript は、管理者として流す中身（ポートが番号の範囲の外なら error）
func AllowScript(port int) (string, error) {
	if !ValidPort(port) {
		return "", fmt.Errorf("firewall: not a port: %d", port)
	}
	return scriptHead + allowScript(port), nil
}

func DenyScript(port int) (string, error) {
	if !ValidPort(port) {
		return "", fmt.Errorf("firewall: not a port: %d", port)
	}
	return scriptHead + denyScript(port), nil
}

func MoveScript(from, to int) (string, error) {
	if !ValidPort(from) || !ValidPort(to) || from == to {
		return "", fmt.Errorf("firewall: cannot move the rules from %d to %d", from, to)
	}
	return scriptHead + allowScript(to) + denyScript(from), nil
}

// ElevateScript は、ps（PowerShell の場所）で、base64 にした中身を管理者として流し、終わるまで待つスクリプト。
// ps は SystemRoot から組むので引用符を逃がし、中身は base64 の文字だけと確かめる
func ElevateScript(ps, b64 string) string {
	for _, c := range b64 {
		if !(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '+' || c == '/' || c == '=') {
			return "exit 1\n"
		}
	}
	return "$ProgressPreference='SilentlyContinue'\n" +
		"$p = Start-Process -FilePath " + quote(ps) + " -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','" + b64 + "'\n" +
		"exit $p.ExitCode\n"
}

// quote は、PowerShell の単一引用符の文字列にする
func quote(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

// ReadScript は、管理者なしで規則を読む中身（JSON の Reading を出す）。exe は動いている exe の場所
func ReadScript(exe string) string {
	return "$ProgressPreference='SilentlyContinue'\n" +
		// 関数の名前は、PowerShell の別名（rd は Remove-Item など）と重ねない。別名は関数より先に効く
		"function Read-MatomezuRules($store) { Get-NetFirewallRule -Group '" + Group + "' -PolicyStore $store -ErrorAction SilentlyContinue | ForEach-Object { $f = $_ | Get-NetFirewallPortFilter; [pscustomobject]@{ name = $_.Name; enabled = ([string]$_.Enabled -eq 'True'); action = [string]$_.Action; protocol = [string]$f.Protocol; port = [string]$f.LocalPort } } }\n" +
		"$active = @(Read-MatomezuRules 'ActiveStore')\n" +
		"$persistent = @(Read-MatomezuRules 'PersistentStore')\n" +
		"$blocked = @(Get-NetFirewallApplicationFilter -Program " + quote(exe) + " -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object { [string]$_.Enabled -eq 'True' -and [string]$_.Action -eq 'Block' -and [string]$_.Direction -eq 'Inbound' }).Count -gt 0\n" +
		"[pscustomobject]@{ active = $active; persistent = $persistent; exeBlocked = $blocked } | ConvertTo-Json -Compress -Depth 4\n"
}
