// Package crm owns customers, customer history, segments, leads and tickets. Other modules read them through this package's exported functions, and
// only this package writes them.
package crm

import (
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/kernel"
)

// CRM runs the crm actions.
type CRM struct {
	*kernel.Runtime
	// SegmentUsers lists the campaigns that may target a segment, so a segment in use stays.
	SegmentUsers SegmentUsers
}

// SegmentUsers is the part of marketing that crm calls. Marketing sits above crm, so crm declares
// the call it needs and service.New supplies the implementation.
type SegmentUsers interface {
	// SegmentCampaigns returns every campaign of the store, in store order.
	SegmentCampaigns(t *kernel.Tx, tenantID string) ([]domain.Campaign, error)
}
