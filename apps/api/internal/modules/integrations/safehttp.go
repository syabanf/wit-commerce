package integrations

import (
	"errors"
	"net"
	"net/http"
	"syscall"
	"time"
)

var carrierNAT = &net.IPNet{IP: net.IPv4(100, 64, 0, 0), Mask: net.CIDRMask(10, 32)}

func internalIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() || carrierNAT.Contains(ip)
}

// OutboundClient calls addresses people typed in. It checks the IP at connect time, after DNS, so a
// webhook URL cannot reach this network, and it follows no redirects. allowInternal is for development.
func OutboundClient(allowInternal bool) *http.Client {
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	if !allowInternal {
		dialer.Control = func(_, address string, _ syscall.RawConn) error {
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				return err
			}
			if ip := net.ParseIP(host); ip == nil || internalIP(ip) {
				return errors.New("this address is not reachable from WIT Commerce")
			}
			return nil
		}
	}
	return &http.Client{
		Timeout:       10 * time.Second,
		Transport:     &http.Transport{DialContext: dialer.DialContext, TLSHandshakeTimeout: 5 * time.Second},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}
