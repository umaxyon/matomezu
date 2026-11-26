package launch

import (
	"bufio"
	"encoding/json"
	"io"
	"os"
	"strings"
)

// clearedHeadBytes と clearedHeadLines は、会話の記録の頭のうち、ClearedFrom が読む大きさと行の数
const (
	clearedHeadBytes = 64 << 10
	clearedHeadLines = 16
)

// derivedFrom は、Claude Code が会話の記録の頭に書く、その会話がどの会話から始まったかの行（type が derived-from）のうち、読む所
type derivedFrom struct {
	Type      string `json:"type"`
	V         int    `json:"v"`
	SessionID string `json:"sessionId"`
	Sessions  []struct {
		Type string  `json:"type"`
		ID   *string `json:"id"`
		Via  string  `json:"via"`
	} `json:"sessions"`
}

// ClearedFrom は、会話の記録 transcriptPath のセッション session が、/clear で置き換えた前の会話のセッション id（無ければ空）。
// Claude Code は、/clear で始まった会話の記録の頭（1 行目とは限らない）に derived-from の行を書き、sessions に via が clear の前の会話を並べる
// （CLI 2.1.330 の記録で確かめた。Desktop は /clear で CLI ごと起動し直すので、フックの source は startup で来る）。
// via が launch（起動した物）・subprocess（この CLI を立てた親の会話）・compact（自分）の物は取らない（親の会話の参加者を取り違える）。
// 形が違う・読めないときは空（常駐は、今までどおり結び直さない）
func ClearedFrom(transcriptPath, session string) []string {
	if transcriptPath == "" || session == "" {
		return nil
	}
	f, err := os.Open(transcriptPath)
	if err != nil {
		return nil
	}
	defer f.Close()
	lines := bufio.NewScanner(io.LimitReader(f, clearedHeadBytes))
	lines.Buffer(make([]byte, 0, 4096), clearedHeadBytes)
	for i := 0; i < clearedHeadLines && lines.Scan(); i++ {
		line := lines.Bytes()
		if !strings.Contains(string(line), `"derived-from"`) {
			continue
		}
		var d derivedFrom
		if json.Unmarshal(line, &d) != nil || d.Type != "derived-from" {
			continue
		}
		if d.V != 1 || d.SessionID != session {
			return nil
		}
		var out []string
		for _, s := range d.Sessions {
			if s.Type == "claude_code_session" && s.Via == "clear" && s.ID != nil && *s.ID != "" && *s.ID != session {
				out = append(out, *s.ID)
			}
		}
		return out
	}
	return nil
}
