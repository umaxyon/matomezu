package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/alecthomas/kong"
	"github.com/umaxyon/matomezu/internal/server"
)

// watch は SSE の wake の知らせの文だけを 1 行ずつ書き、ほかの知らせ（keep）は書かない
func TestReadWakesPrintsOnlyWakeLines(t *testing.T) {
	in := "event: keep\ndata: {}\n\nevent: wake\ndata: {\"text\":\"matomezu: the user accepted\"}\n\nevent: wake\ndata: {\"text\":\"\"}\n\n"
	var out bytes.Buffer
	p := printDeliverer{out: &out}
	if err := readWakes(strings.NewReader(in), func() bool { return true }, func(w wakeOut) { p.deliver(w) }); err != nil {
		t.Fatal(err)
	}
	if out.String() != "matomezu: the user accepted\n" {
		t.Fatalf("out = %q", out.String())
	}
}

// プロセス id のプロセスが居なければ、読むのをやめる。居るプロセス（自分）と、数でない id は居るとみなす
func TestProcessAliveAndReadWakesStops(t *testing.T) {
	if !server.ProcessAlive(strconv.Itoa(os.Getpid())) || !server.ProcessAlive("x") || server.ProcessAlive("999999999") {
		t.Fatal("processAlive")
	}
	called := false
	if err := readWakes(strings.NewReader("event: wake\ndata: {\"text\":\"a\"}\n\n"), func() bool { return false }, func(wakeOut) { called = true }); err != nil || called {
		t.Fatal("read after the host was gone")
	}
}

// 受け取る側の流し方は、名乗った物だけを常駐の口に渡す
func TestWatchQueryCarriesTheLimits(t *testing.T) {
	c := watchCmd{Host: "42", Session: "S", MaxLine: 480, MaxNotice: 2800, Gap: time.Second}
	if got := c.query(); got != "gap=1000&host=42&maxLine=480&maxNotice=2800&session=S" {
		t.Fatalf("query = %s", got)
	}
	if got := (&watchCmd{Host: "42"}).query(); got != "host=42&session=" {
		t.Fatalf("query = %s", got)
	}
}

// TestMain は、渡すコマンドの代わりに、このテストの実行ファイル自身を呼ぶ（MATOMEZU_TEST_DELIVER が付いたとき）
func TestMain(m *testing.M) {
	switch os.Getenv("MATOMEZU_TEST_DELIVER") {
	case "each":
		text, _ := io.ReadAll(os.Stdin)
		switch string(text) {
		case "absent":
			os.Exit(deliverAbsentExit)
		case "fail":
			os.Exit(1)
		}
		if os.Getenv("MATOMEZU_SESSION") != "S1" {
			os.Exit(1)
		}
		os.Exit(0)
	case "resident":
		scan := bufio.NewScanner(os.Stdin)
		for scan.Scan() {
			var in struct{ ID, Session, Text string }
			_ = json.Unmarshal(scan.Bytes(), &in)
			result := "delivered"
			if in.Text == "absent" {
				result = "absent"
			} else if in.Session != "S1" {
				result = "failed"
			}
			out, _ := json.Marshal(map[string]string{"id": in.ID, "result": result})
			fmt.Println(string(out))
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}

// 渡すコマンドは、知らせごとに起動するときも立てたままにするときも、本文とセッション id を受け、終わり方（答え）が結果の名前になる
func TestDeliverCommands(t *testing.T) {
	self, _ := os.Executable()
	for _, mode := range []string{"each", "resident"} {
		t.Setenv("MATOMEZU_TEST_DELIVER", mode)
		c := watchCmd{Deliver: []string{self}, Resident: mode == "resident"}
		d := c.deliverer(io.Discard)
		got := []string{
			d.deliver(wakeOut{ID: "1", Session: "S1", Text: "hello"}),
			d.deliver(wakeOut{ID: "2", Session: "S1", Text: "absent"}),
			d.deliver(wakeOut{ID: "3", Session: "S2", Text: "hello"}),
		}
		d.close()
		if strings.Join(got, ",") != "delivered,absent,failed" {
			t.Fatalf("%s: %v", mode, got)
		}
	}
}

// 渡すコマンドは、watch でも mcp でも、コマンドの行の -- のあとから受け、区切りの -- は含めない
func TestDeliverCommandFromTheCommandLine(t *testing.T) {
	var c cli
	p, err := kong.New(&c, kong.Vars{"addr": DefaultAddr})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := p.Parse([]string{"watch", "--host", "1", "--", "/bin/m", "codex", "deliver"}); err != nil {
		t.Fatal(err)
	}
	if got := deliverCommand(c.Watch.Deliver); strings.Join(got, " ") != "/bin/m codex deliver" {
		t.Fatalf("watch = %q", got)
	}
	if _, err := p.Parse([]string{"mcp", "--", "/bin/m", "codex", "deliver"}); err != nil {
		t.Fatal(err)
	}
	if got := deliverCommand(c.MCP.Deliver); strings.Join(got, " ") != "/bin/m codex deliver" {
		t.Fatalf("mcp = %q", got)
	}
}
