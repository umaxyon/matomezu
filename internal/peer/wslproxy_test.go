package peer

import (
	"bufio"
	"encoding/json"
	"io"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestReadWSLHeader(t *testing.T) {
	cases := []struct {
		name, in, want string
		ok             bool
	}{
		{"ok", "MZWP s3cret 192.168.1.5:50000\nrest", "192.168.1.5:50000", true},
		{"mapped", "MZWP s3cret [::ffff:192.168.1.5]:50000\n", "192.168.1.5:50000", true},
		{"wrong secret", "MZWP other 192.168.1.5:50000\n", "", false},
		{"no header", "\x16\x03\x01 tls hello\n", "", false},
		{"bad address", "MZWP s3cret somewhere\n", "", false},
		{"too long", "MZWP s3cret " + strings.Repeat("1", 300) + "\n", "", false},
		{"no newline", "MZWP s3cret 192.168.1.5:50000", "", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := bufio.NewReader(strings.NewReader(c.in))
			from, err := readWSLHeader(r, "s3cret")
			if (err == nil) != c.ok {
				t.Fatalf("err = %v, want ok %v", err, c.ok)
			}
			if c.ok && from.String() != c.want {
				t.Fatalf("from = %s, want %s", from, c.want)
			}
		})
	}
}

// inProcessProxy は、RunWSLProxy をこのプロセスの中で走らせる WSLProxyLaunch。done は RunWSLProxy が戻ったら閉じる
func inProcessProxy(done chan struct{}) WSLProxyLaunch {
	return func() (WSLProxyProcess, error) {
		inR, inW := io.Pipe()
		outR, outW := io.Pipe()
		go func() {
			_ = RunWSLProxy(inR, outW)
			_ = outW.Close()
			_ = inR.Close()
			close(done)
		}()
		return WSLProxyProcess{Stdin: inW, Stdout: outR}, nil
	}
}

func freePort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port
}

func waitState(t *testing.T, states chan WSLProxyState, want WSLProxyState) {
	t.Helper()
	select {
	case st := <-states:
		if st != want {
			t.Fatalf("state = %s, want %s", st, want)
		}
	case <-time.After(5 * time.Second):
		t.Fatalf("no state, want %s", want)
	}
}

// WSLプロキシの口へつないだ相手の番地が、WSL の受け口で RemoteAddr として見え、中身はそのまま両方の向きに流れる。閉じたら WSLプロキシも終わる
func TestWSLProxyForwards(t *testing.T) {
	port := freePort(t)
	states := make(chan WSLProxyState, 4)
	done := make(chan struct{})
	link, err := StartWSLProxy(WSLProxyOptions{Port: port, Launch: inProcessProxy(done), Loopback: true,
		OnState: func(st WSLProxyState, _ []string) { states <- st }})
	if err != nil {
		t.Fatal(err)
	}
	waitState(t, states, WSLProxyRunning)

	seen := make(chan string, 1)
	go func() {
		c, err := link.Listener().Accept()
		if err != nil {
			return
		}
		defer c.Close()
		seen <- c.RemoteAddr().String()
		_, _ = io.Copy(c, c)
	}()
	c, err := net.Dial("tcp", "127.0.0.1:"+strconv.Itoa(port))
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	if _, err := io.WriteString(c, "ping"); err != nil {
		t.Fatal(err)
	}
	_ = c.(*net.TCPConn).CloseWrite()
	got, err := io.ReadAll(c)
	if err != nil || string(got) != "ping" {
		t.Fatalf("echo = %q, %v", got, err)
	}
	if from := <-seen; from != c.LocalAddr().String() {
		t.Fatalf("RemoteAddr = %s, want %s", from, c.LocalAddr())
	}

	link.Close()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the WSL proxy did not stop when its stdin closed")
	}
}

// 頭の行の無い接続と合い言葉の違う接続は、受け口が渡さない
func TestWSLListenerRefuses(t *testing.T) {
	raw, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	l := newWSLListener(raw, "right")
	defer l.Close()
	accepted := make(chan net.Conn, 3)
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				return
			}
			accepted <- c
		}
	}()
	for _, head := range []string{"GET / HTTP/1.1\n", wslHeader("wrong", "10.0.0.1:1")} {
		c, err := net.Dial("tcp", raw.Addr().String())
		if err != nil {
			t.Fatal(err)
		}
		_, _ = io.WriteString(c, head)
		if _, err := c.Read(make([]byte, 1)); err == nil {
			t.Fatalf("%q: the connection was kept", head)
		}
		c.Close()
	}
	c, err := net.Dial("tcp", raw.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	_, _ = io.WriteString(c, wslHeader("right", "10.0.0.1:1"))
	select {
	case a := <-accepted:
		if a.RemoteAddr().String() != "10.0.0.1:1" {
			t.Fatalf("RemoteAddr = %s", a.RemoteAddr())
		}
		a.Close()
	case <-time.After(5 * time.Second):
		t.Fatal("the connection with the right secret was not handed over")
	}
	if len(accepted) != 0 {
		t.Fatal("a refused connection was handed over")
	}
}

// scriptedProxy は、決めた行を返す偽の WSLプロキシ。WSL が送った行は sent に入る
func scriptedProxy(lines []string, sent chan string, keep bool) WSLProxyLaunch {
	return func() (WSLProxyProcess, error) {
		inR, inW := io.Pipe()
		outR, outW := io.Pipe()
		go func() {
			sc := bufio.NewScanner(inR)
			for sc.Scan() {
				if sent != nil {
					sent <- sc.Text()
				}
			}
			_ = outW.Close()
		}()
		go func() {
			for _, l := range lines {
				_, _ = io.WriteString(outW, l+"\n")
			}
			if !keep {
				_ = outW.Close()
			}
		}()
		return WSLProxyProcess{Stdin: inW, Stdout: outR}, nil
	}
}

func TestWSLProxyStates(t *testing.T) {
	cases := []struct {
		name  string
		lines []string
		keep  bool
		want  WSLProxyState
	}{
		{"missing", []string{"'matomezu' is not recognized"}, false, WSLProxyUnavailable},
		{"old", nil, false, WSLProxyUnavailable},
		{"newer Windows", []string{`{"v":2,"failed":"version"}`}, true, WSLProxyUpdateThis},
		{"older Windows", []string{`{"v":0}`, `{"v":-1,"failed":"version"}`}, true, WSLProxyUpdateWindows},
		{"ended", []string{`{"v":1,"ready":true}`}, false, WSLProxyStopped},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			states := make(chan WSLProxyState, 4)
			link, err := StartWSLProxy(WSLProxyOptions{Port: 1, Launch: scriptedProxy(c.lines, nil, c.keep), Loopback: true,
				OnState: func(st WSLProxyState, _ []string) { states <- st }})
			if err != nil {
				t.Fatal(err)
			}
			defer link.Close()
			if c.want == WSLProxyStopped {
				waitState(t, states, WSLProxyRunning)
			}
			waitState(t, states, c.want)
		})
	}
}

// WSLプロキシが見つけたホストは Found に寿命つきで入り、「いなくなる」で消える。名乗りの替えと問いは行で WSLプロキシへ送る
func TestWSLProxySightings(t *testing.T) {
	seen := func(id string, gone bool) string {
		b, _ := json.Marshal(wslFromProxy{Sighting: &wslSeen{Sighting: Sighting{HostID: id, Name: id, Addr: "192.168.1.9", Port: 7300}, Life: 120, Gone: gone}})
		return string(b)
	}
	sent := make(chan string, 8)
	changes := make(chan bool, 4)
	lines := []string{`{"v":1,"ready":true}`, seen("mac", false), seen("pc", false), seen("pc", true)}
	link, err := StartWSLProxy(WSLProxyOptions{Port: 1, Loopback: true, Launch: scriptedProxy(lines, sent, true),
		OnChange: func(_ Sighting, gone bool) { changes <- gone }})
	if err != nil {
		t.Fatal(err)
	}
	defer link.Close()
	var start WSLProxyStart
	if err := json.Unmarshal([]byte(<-sent), &start); err != nil || start.V != WSLProxyVersion || start.Secret == "" || len(start.Targets) == 0 {
		t.Fatalf("start = %+v, %v", start, err)
	}
	for i, want := range []bool{false, false, true} {
		if gone := <-changes; gone != want {
			t.Fatalf("change %d: gone = %v", i, gone)
		}
	}
	if f := link.Found(); len(f) != 1 || f[0].HostID != "mac" || f[0].Port != 7300 {
		t.Fatalf("Found = %+v", f)
	}
	link.Query()
	link.Update(Advert{HostID: "wsl", Name: "renamed"})
	if l := <-sent; !strings.Contains(l, `"query":true`) {
		t.Fatalf("query line = %s", l)
	}
	if l := <-sent; !strings.Contains(l, `"renamed"`) {
		t.Fatalf("update line = %s", l)
	}
}

// WSLプロキシは、待つポートがほかに使われていれば port-in-use と言って終わる
func TestWSLProxyPortInUse(t *testing.T) {
	taken, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer taken.Close()
	states := make(chan WSLProxyState, 4)
	done := make(chan struct{})
	link, err := StartWSLProxy(WSLProxyOptions{Port: taken.Addr().(*net.TCPAddr).Port, Launch: inProcessProxy(done), Loopback: true,
		OnState: func(st WSLProxyState, _ []string) { states <- st }})
	if err != nil {
		t.Fatal(err)
	}
	defer link.Close()
	waitState(t, states, WSLProxyPortInUse)
	<-done
}

// WSLプロキシは、版の違う最初の行には自分の版と version を返して終わる
func TestWSLProxyRefusesAnotherVersion(t *testing.T) {
	var out strings.Builder
	if err := RunWSLProxy(strings.NewReader(`{"v":99,"port":1}`+"\n"), &out); err == nil {
		t.Fatal("no error")
	}
	var m wslFromProxy
	if err := json.Unmarshal([]byte(out.String()), &m); err != nil || m.V != WSLProxyVersion || m.Failed != "version" || m.Ready {
		t.Fatalf("answer = %q, %v", out.String(), err)
	}
}
