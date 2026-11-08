package main

// 話しかけのフック（talked）: AI の UserPromptSubmit のフックが標準入力に渡す JSON（session_id・transcript_path）から、
// 話しかけを常駐に知らせ、会話の記録から使い捨ての uuid を拾って参加者にセッション id を結ばせ、結べた参加者を利用者に伝える。
// 伝えるのはフックの JSON の出力（systemMessage が利用者に見え、sessionTitle が Claude Code のセッション名になり、additionalContext が AI に届く）

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"
)

// hookInput はフックの標準入力の JSON のうち、使う所
type hookInput struct {
	SessionID      string `json:"session_id"`
	TranscriptPath string `json:"transcript_path"`
}

func readHookInput(r io.Reader) hookInput {
	var in hookInput
	b, err := io.ReadAll(io.LimitReader(r, 1<<20))
	if err == nil {
		_ = json.Unmarshal(b, &in)
	}
	return in
}

// talkAPI は常駐の POST /api/ai/talked を呼ぶ口（常駐が立っていなければ nil）
type talkAPI func(body []byte) ([]byte, error)

// talkReply は、常駐の /api/ai/talked の答え（server.SessionTalk と同じ形）
type talkReply struct {
	Welcomes []struct {
		Workroom string `json:"workroom"`
		Message  string `json:"message"`
		ForAI    string `json:"forAi"`
	} `json:"welcomes"`
	Unbound bool `json:"unbound"`
}

const (
	// chunkBytes は、会話の記録を後ろから読む 1 度の大きさ
	chunkBytes = 256 << 10
	// scanBytes は、会話の記録を後ろから読む合計の上限
	scanBytes = 8 << 20
)

var uuidShape = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)

// talked は話しかけを常駐に知らせ、out に出すものを書く。context は、フックが AI に添える文（annotations の出力など）。
// 伝えることがあるときは 1 つの JSON を書き、無ければ context だけをそのまま書く（フックの出力は JSON か文のどちらか 1 つ）
func talked(out io.Writer, hook hookInput, context string, api talkAPI) {
	var reply talkReply
	if api != nil {
		reply = askTalked(hook, api)
	}
	if len(reply.Welcomes) == 0 {
		if strings.TrimSpace(context) != "" {
			fmt.Fprintln(out, strings.TrimRight(context, "\n"))
		}
		return
	}
	var say, ai []string
	for _, w := range reply.Welcomes {
		say = append(say, w.Message)
		ai = append(ai, w.ForAI)
	}
	special := map[string]any{
		"hookEventName": "UserPromptSubmit",
		// 参加者が 1 人なら、その名前をセッション名にする（元のセッション名は常駐の参加者が持っている）
		"additionalContext": strings.TrimSpace(strings.Join(append(ai, context), "\n")),
	}
	if len(reply.Welcomes) == 1 {
		special["sessionTitle"] = reply.Welcomes[0].Workroom
	}
	_ = json.NewEncoder(out).Encode(map[string]any{
		"systemMessage":      strings.Join(say, "\n"),
		"hookSpecificOutput": special,
	})
}

// askTalked は、話しかけを知らせ、結ばれていない参加者がいるなら会話の記録を後ろから調べて結ばせる。常駐の答えが読めなければ空を返す
func askTalked(hook hookInput, api talkAPI) talkReply {
	var reply talkReply
	body, _ := json.Marshal(map[string]any{"sessionId": hook.SessionID})
	out, err := api(body)
	if err != nil || json.Unmarshal(out, &reply) != nil {
		return talkReply{}
	}
	if !reply.Unbound || hook.SessionID == "" || hook.TranscriptPath == "" {
		return reply
	}
	f, err := os.Open(hook.TranscriptPath)
	if err != nil {
		return reply
	}
	defer f.Close()
	end, err := f.Seek(0, io.SeekEnd)
	if err != nil {
		return reply
	}
	seen := map[string]bool{}
	var tail []byte // 1 つ後ろの塊の頭（塊の境目で切れた uuid を拾い直す）
	for read := int64(0); end > 0 && read < scanBytes && reply.Unbound; {
		size := min(int64(chunkBytes), end)
		buf := make([]byte, size)
		if _, err := f.ReadAt(buf, end-size); err != nil && err != io.EOF {
			break
		}
		end -= size
		read += size
		text := append(buf, tail...)
		var found []string
		for _, u := range uuidShape.FindAllString(string(text), -1) {
			if !seen[u] {
				seen[u] = true
				found = append(found, u)
			}
		}
		if len(buf) >= 36 {
			tail = append([]byte(nil), buf[:35]...)
		}
		if len(found) == 0 {
			continue
		}
		body, _ := json.Marshal(map[string]any{"sessionId": hook.SessionID, "candidates": found})
		out, err := api(body)
		var next talkReply
		if err != nil || json.Unmarshal(out, &next) != nil {
			break
		}
		reply.Unbound = next.Unbound
		reply.Welcomes = append(reply.Welcomes, next.Welcomes...)
	}
	return reply
}
