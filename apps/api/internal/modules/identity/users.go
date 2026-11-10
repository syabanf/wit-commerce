package identity

import (
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

// ErrEmailTaken refuses a second account on one email.
var ErrEmailTaken = kernel.Conflict{Code: "EMAIL_TAKEN", Reason: "Someone already signs in with this email."}

// CreateUser writes a new person and their password hash. The email must be normalised.
func CreateUser(t *kernel.Tx, u domain.User, passwordHash string) error {
	var taken bool
	if err := t.QueryRow(t.Ctx, `select exists (select 1 from users where email = $1)`, u.Email).Scan(&taken); err != nil {
		return err
	}
	if taken {
		return ErrEmailTaken
	}
	if err := t.Put("users", u.ID, u); err != nil {
		return err
	}
	_, err := t.Exec(t.Ctx, `insert into credentials (user_id, password_hash) values ($1, $2)`, u.ID, passwordHash)
	return err
}

// MarkEmailVerified records that the person proved their inbox; a second proof keeps the first date.
func MarkEmailVerified(t *kernel.Tx, userID, at string) error {
	u, err := kernel.Lock[domain.User](t, "users", userID, "user")
	if err != nil || u.EmailVerifiedAt != nil {
		return err
	}
	u.EmailVerifiedAt = &at
	return t.Put("users", u.ID, u)
}
