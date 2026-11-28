package engine

import (
	"encoding/json"
	"testing"
)

func TestUpdateCheckIsOnUnlessTheUserTurnedItOff(t *testing.T) {
	t.Parallel()
	e := newEngine(t)
	for _, c := range []struct {
		settings string
		want     bool
	}{
		{"", true},
		{`{}`, true},
		{`{"@matomezu/base:update-check": false}`, false},
		{`{"@matomezu/base:update-check": true}`, true},
	} {
		got, err := e.UpdateCheck(json.RawMessage(c.settings))
		if err != nil || got != c.want {
			t.Errorf("UpdateCheck(%s) = %v, %v; want %v", c.settings, got, err, c.want)
		}
	}
}
