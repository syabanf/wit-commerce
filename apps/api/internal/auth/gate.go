package auth

import (
	"context"
	"errors"
	"runtime"
	"time"
)

// ErrBusy means every password slot stayed taken for the whole wait. The HTTP layer answers 503 with
// Retry-After, so a burst of sign-ins queues for a moment and then backs off instead of piling up.
var ErrBusy = errors.New("too many password checks at once")

// PasswordGate bounds how many PBKDF2 runs go at once. One run costs about a third of a second of
// CPU, so a burst of sign-ins without a bound takes every core and slows every other request. The
// gate keeps a fixed number of slots; a caller waits up to wait for one and then gets ErrBusy.
type PasswordGate struct {
	slots chan struct{}
	wait  time.Duration
}

// DefaultPasswordSlots leaves half the cores for everything else, and at least one slot.
func DefaultPasswordSlots() int { return max(1, runtime.NumCPU()/2) }

// DefaultPasswordWait is how long a sign-in queues for a slot before the answer is 503.
const DefaultPasswordWait = 5 * time.Second

// NewPasswordGate builds a gate; a slots or wait of zero or less takes the default.
func NewPasswordGate(slots int, wait time.Duration) *PasswordGate {
	if slots <= 0 {
		slots = DefaultPasswordSlots()
	}
	if wait <= 0 {
		wait = DefaultPasswordWait
	}
	return &PasswordGate{slots: make(chan struct{}, slots), wait: wait}
}

func (g *PasswordGate) acquire(ctx context.Context) error {
	timer := time.NewTimer(g.wait)
	defer timer.Stop()
	select {
	case g.slots <- struct{}{}:
		return nil
	case <-timer.C:
		return ErrBusy
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Hash is HashPassword inside a slot.
func (g *PasswordGate) Hash(ctx context.Context, password string) (string, error) {
	if err := g.acquire(ctx); err != nil {
		return "", err
	}
	defer func() { <-g.slots }()
	return HashPassword(password)
}

// Check is CheckPassword inside a slot. The error is ErrBusy or the context's; a wrong password is
// false with no error.
func (g *PasswordGate) Check(ctx context.Context, hash, password string) (bool, error) {
	if err := g.acquire(ctx); err != nil {
		return false, err
	}
	defer func() { <-g.slots }()
	return CheckPassword(hash, password), nil
}
