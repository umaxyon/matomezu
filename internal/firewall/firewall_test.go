package firewall

import (
	"strings"
	"testing"
)

func rules(port int) []Rule {
	return []Rule{
		{Name: TCPBlockRuleName(port), Enabled: true, Action: "Block", Protocol: "TCP"},
		{Name: TCPRuleName(port), Enabled: true, Action: "Allow", Protocol: "TCP"},
		{Name: MDNSRuleName, Enabled: true, Action: "Allow", Protocol: "UDP"},
	}
}

func TestDecide(t *testing.T) {
	all := rules(47391)
	noBlock := all[1:]
	disabled := append([]Rule{{Name: TCPBlockRuleName(47391), Enabled: false, Action: "Block"}}, all[1:]...)
	cases := []struct {
		name   string
		r      Reading
		port   int
		failed bool
		want   State
	}{
		{"そろって効いている", Reading{Active: all, Persistent: all}, 47391, false, Allowed},
		{"規則が無い", Reading{}, 47391, false, Absent},
		{"ほかのポートの規則だけ", Reading{Active: rules(50000), Persistent: rules(50000)}, 47391, false, Absent},
		{"PC の設定で効いていない", Reading{Persistent: all}, 47391, false, Ineffective},
		{"止める規則が無い", Reading{Active: noBlock, Persistent: noBlock}, 47391, false, Ineffective},
		{"止める規則が切られた", Reading{Active: disabled, Persistent: disabled}, 47391, false, Ineffective},
		{"exe を止める規則がある", Reading{Active: all, Persistent: all, ExeBlocked: true}, 47391, false, Ineffective},
		{"exe を止める規則だけ（まだ許可を押していない）", Reading{ExeBlocked: true}, 47391, false, Absent},
		{"直前に許可しようとしてそろわなかった", Reading{}, 47391, true, Ineffective},
	}
	for _, c := range cases {
		if got := Decide(c.r, c.port, c.failed); got != c.want {
			t.Errorf("%s: got %s, want %s", c.name, got, c.want)
		}
	}
}

func TestScriptsTakeOnlyPorts(t *testing.T) {
	for _, p := range []int{0, -1, 65536} {
		if _, err := AllowScript(p); err == nil {
			t.Errorf("AllowScript(%d) took it", p)
		}
		if _, err := DenyScript(p); err == nil {
			t.Errorf("DenyScript(%d) took it", p)
		}
	}
	if _, err := MoveScript(47391, 47391); err == nil {
		t.Error("MoveScript took the same port")
	}
	// 許可は止める規則を先に作り、取り消しは許可の規則を先に消す（間に、LAN の外から受ける時を作らない）
	allow, _ := AllowScript(47391)
	if strings.Index(allow, "New-NetFirewallRule -Name 'matomezu-tcp-47391-block'") > strings.Index(allow, "New-NetFirewallRule -Name 'matomezu-tcp-47391'") {
		t.Error("AllowScript makes the allow rule before the block rule")
	}
	deny, _ := DenyScript(47391)
	if strings.Index(deny, "-Name 'matomezu-tcp-47391' ") > strings.Index(deny, "-Name 'matomezu-tcp-47391-block'") {
		t.Error("DenyScript removes the block rule before the allow rule")
	}
	s, err := MoveScript(47391, 50123)
	if err != nil {
		t.Fatal(err)
	}
	// 付け替えは、新しいポートの規則を作ってから古いポートの規則を消す
	if strings.Index(s, "New-NetFirewallRule -Name 'matomezu-tcp-50123-block'") > strings.Index(s, "-Name 'matomezu-tcp-47391'") {
		t.Error("MoveScript removes the old rules before it makes the new ones")
	}
}

func TestElevateScriptQuotesThePathAndTakesOnlyBase64(t *testing.T) {
	s := ElevateScript(`C:\Win'dows\powershell.exe`, "QUJD+/=")
	if !strings.Contains(s, `-FilePath 'C:\Win''dows\powershell.exe'`) || !strings.Contains(s, "'-EncodedCommand','QUJD+/='") {
		t.Errorf("the path or the content is not as given: %s", s)
	}
	if s := ElevateScript(`C:\Windows\powershell.exe`, "AB'; Remove-Item x"); strings.Contains(s, "Remove-Item") || strings.Contains(s, "RunAs") {
		t.Errorf("took a content that is not base64: %s", s)
	}
}

func TestReadScriptQuotesTheExe(t *testing.T) {
	s := ReadScript(`C:\Users\o'neil\.matomezu\bin\1.0.0\matomezu.exe`)
	if !strings.Contains(s, `-Program 'C:\Users\o''neil\.matomezu\bin\1.0.0\matomezu.exe'`) {
		t.Error("the exe is not quoted")
	}
}
