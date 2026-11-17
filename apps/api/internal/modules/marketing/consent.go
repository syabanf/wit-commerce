package marketing

import (
	"context"

	"github.com/syabanf/wit-commerce/apps/api/internal/clock"
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/crm"
	"github.com/syabanf/wit-commerce/apps/api/internal/rules"
)

// Recipients lists who a marketing message to a segment may go to: its customers with marketing
// consent. Skipped counts the rest. Transactional email about an order does not pass through here.
func Recipients(t *kernel.Tx, tenantID string, segmentID *string, now int64) (reach []domain.Customer, skipped int, err error) {
	if segmentID == nil {
		return nil, 0, nil
	}
	members, err := crm.SegmentAudience(t, tenantID, *segmentID, now)
	for _, c := range members {
		if rules.MarketingAllowed(c) {
			reach = append(reach, c)
		} else {
			skipped++
		}
	}
	return reach, skipped, err
}

// CampaignAudience is how many customers a campaign's segment holds now, and how many of them its
// messages reach.
type CampaignAudience struct {
	InSegment int `json:"inSegment"`
	Reach     int `json:"reach"`
	// Skipped have not agreed to marketing messages, or withdrew.
	Skipped int `json:"skipped"`
}

// Audience counts a campaign's audience at the given time.
func (s *Marketing) Audience(ctx context.Context, m kernel.Meta, id string) (CampaignAudience, error) {
	var out CampaignAudience
	_, err := s.Run(ctx, func(t *kernel.Tx) error {
		c, err := kernel.Get[domain.Campaign](t, "campaigns", id, "campaign")
		if err != nil {
			return err
		}
		if err := kernel.Access(m, c.TenantID); err != nil {
			return err
		}
		reach, skipped, err := Recipients(t, c.TenantID, c.SegmentID, clock.Ms(m.At))
		out = CampaignAudience{InSegment: len(reach) + skipped, Reach: len(reach), Skipped: skipped}
		return err
	})
	return out, err
}
