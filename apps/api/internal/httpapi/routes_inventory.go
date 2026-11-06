package httpapi

// inventoryRoutes registers stock adjustments and receipts.
func (s *Server) inventoryRoutes(rt *router) {
	rt.add("POST", "/stock/{id}/adjust", "stock/adjust", "inventory.manage", "Adjust a stock level", adjust(s, s.svc.AdjustStock))
	rt.add("POST", "/stock/receive", "stock/receive", "inventory.manage", "Receive units of a variant", receive(s, s.svc.ReceiveStock))
	rt.add("POST", "/modifier-stock/{id}/adjust", "modifierStock/adjust", "inventory.manage", "Adjust a modifier stock level", adjust(s, s.svc.AdjustModifierStock))
	rt.add("POST", "/modifier-stock/receive", "modifierStock/receive", "inventory.manage", "Receive units of a modifier option", receive(s, s.svc.ReceiveModifierStock))
}
