package integrations

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

// ToggleIntegration is integrations/toggle.
func (s *Integrations) ToggleIntegration(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		i, err := kernel.Lock[domain.Integration](t, "integrations", id, "integration")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, i.TenantID); err != nil {
			return err
		}
		if i.Enabled {
			i.Health = "off"
		} else {
			i.Health = "connected"
		}
		i.Enabled = !i.Enabled
		return t.Put("integrations", i.ID, i)
	})
}

// SyncIntegration is integrations/sync.
func (s *Integrations) SyncIntegration(ctx context.Context, m kernel.Meta, id string) (*kernel.Delta, error) {
	return s.Run(ctx, func(t *kernel.Tx) error {
		i, err := kernel.Lock[domain.Integration](t, "integrations", id, "integration")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, i.TenantID); err != nil {
			return err
		}
		if !i.Enabled {
			return nil
		}
		i.LastSyncAt = kernel.Ptr(m.At)
		if i.Health == "failing" {
			i.Health = "degraded"
		}
		return t.Put("integrations", i.ID, i)
	})
}
