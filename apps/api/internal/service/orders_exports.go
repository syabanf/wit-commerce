package service

import (
	"github.com/syabanf/wit-commerce/apps/api/internal/domain"
	"github.com/syabanf/wit-commerce/apps/api/internal/modules/orders"
)

// The orders module's inputs under the names the HTTP layer uses.
type (
	ReturnRequest = orders.ReturnRequest
	ReturnItem    = domain.ReturnItem
	ReturnRefund  = orders.ReturnRefund
)
