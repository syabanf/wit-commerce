package auth

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestPasswordGateQueuesThenAnswersBusy(t *testing.T) {
	g := NewPasswordGate(1, 20*time.Millisecond)
	if err := g.acquire(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := g.Hash(context.Background(), "pw"); !errors.Is(err, ErrBusy) {
		t.Fatalf("hash with every slot taken: %v, want ErrBusy", err)
	}
	if _, err := g.Check(context.Background(), "x", "pw"); !errors.Is(err, ErrBusy) {
		t.Fatalf("check with every slot taken: %v, want ErrBusy", err)
	}
	<-g.slots
	hash, err := g.Hash(context.Background(), "pw")
	if err != nil {
		t.Fatal(err)
	}
	if ok, err := g.Check(context.Background(), hash, "pw"); !ok || err != nil {
		t.Fatalf("check after the slot freed: %v %v", ok, err)
	}
	if len(g.slots) != 0 {
		t.Fatal("a hash or check kept its slot")
	}
}

func TestPasswordGateDefaults(t *testing.T) {
	g := NewPasswordGate(0, 0)
	if cap(g.slots) != DefaultPasswordSlots() || g.wait != DefaultPasswordWait || DefaultPasswordSlots() < 1 {
		t.Fatalf("defaults: %d slots, %s", cap(g.slots), g.wait)
	}
}
