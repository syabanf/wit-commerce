import { fmtNumber, plural } from '@rc/fixtures'
import type { Page } from '@rc/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type Column,
  DataTable,
  EmptyState,
  IconTile,
  PageHeader,
  toast,
} from '@rc/ui'
import { ArrowRight, Copy, FileCode, Globe, Link2, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { PageStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useScoped } from '../../state/scoped'
import { DESCRIPTION_MAX, REDIRECTS, TITLE_MAX, dnsRecords, platformHost, primaryHost, seoFlags } from './lib'

const copy = (text: string) => {
  void navigator.clipboard?.writeText(text).catch(() => undefined)
  toast('Link copied', { tone: 'success', description: text })
}

export function DomainsPage() {
  const s = useScoped()
  const navigate = useNavigate()
  const host = primaryHost(s.tenant)
  const live = s.pages.filter((p) => p.status === 'published' || p.status === 'scheduled')
  const flagged = live.filter((p) => seoFlags(p).length).length
  const redirects = REDIRECTS[s.tenantId] ?? []

  const length = (value: string, max: number) => {
    const n = value.trim().length
    return (
      <span className={n > max ? 'font-semibold text-warning tabular-nums' : 'tabular-nums'}>
        {n ? `${n} / ${max}` : 'None'}
      </span>
    )
  }

  const columns: Column<Page>[] = [
    {
      id: 'page',
      header: 'Page',
      sortValue: (p) => p.title,
      cell: (p) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{p.title}</p>
          <p className="truncate font-mono text-[11px] text-muted">{p.slug}</p>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'lg',
      sortValue: (p) => p.status,
      cell: (p) => <PageStatusBadge status={p.status} />,
    },
    {
      id: 'title',
      header: 'Meta title',
      hideBelow: 'md',
      align: 'right',
      sortValue: (p) => p.seo.title.trim().length,
      cell: (p) => length(p.seo.title, TITLE_MAX),
    },
    {
      id: 'description',
      header: 'Description',
      hideBelow: 'md',
      align: 'right',
      sortValue: (p) => p.seo.description.trim().length,
      cell: (p) => length(p.seo.description, DESCRIPTION_MAX),
    },
    {
      id: 'flags',
      header: 'Checks',
      sortValue: (p) => seoFlags(p).length,
      cell: (p) => {
        const flags = seoFlags(p)
        return (
          <div className="gap-1.5 flex flex-wrap">
            {flags.length ? (
              flags.map((f) => (
                <Badge key={f.label} variant={f.tone}>
                  {f.label}
                </Badge>
              ))
            ) : (
              <Badge variant="success">Good</Badge>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <>
      <PageHeader
        title="Domains & SEO"
        description="Where shoppers reach your store, the redirects in front of it, and how its pages show up in search."
      />
      <div className="space-y-4">
        <div className="gap-4 xl:grid-cols-2 grid grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>Domains</CardTitle>
              <CardDescription>
                Shoppers land on {host}. Every domain serves the same store over HTTPS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="gap-3 rounded-2xl p-3 flex flex-wrap items-center bg-surface-2">
                <IconTile size="sm" className="bg-card">
                  <Globe />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate font-mono">{platformHost(s.tenant)}</p>
                  <p className="text-xs text-muted">Platform subdomain, always on</p>
                </div>
                <Badge variant="success">
                  <ShieldCheck />
                  SSL active
                </Badge>
              </div>
              <CustomDomain />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Redirects</CardTitle>
              <CardDescription>Short and retired links that forward to a live page.</CardDescription>
            </CardHeader>
            <CardContent>
              {redirects.length ? (
                <ul className="space-y-2">
                  {redirects.map((r) => (
                    <li
                      key={r.from}
                      className="gap-x-3 gap-y-1 rounded-2xl p-3 flex flex-wrap items-center bg-surface-2"
                    >
                      <span className="min-w-0 gap-2 text-xs flex flex-1 items-center font-mono">
                        <span className="font-semibold truncate">{r.from}</span>
                        <ArrowRight className="size-3.5 shrink-0 text-muted" aria-label="redirects to" />
                        <span className="truncate">{r.to}</span>
                      </span>
                      <Badge variant={r.code === 301 ? 'default' : 'info'}>
                        {r.code === 301 ? '301 permanent' : '302 temporary'}
                      </Badge>
                      <span className="text-xs text-muted tabular-nums">
                        {fmtNumber(r.hits30d)} hits in 30 days
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  compact
                  icon={<Link2 />}
                  title="No redirects yet"
                  description="Redirects appear here when a page slug changes or a campaign link retires."
                />
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>SEO health</CardTitle>
            <CardDescription>
              {plural(live.length, 'live or scheduled page')} ·{' '}
              {flagged ? `${flagged} need attention` : 'all pass the checks'}. Titles fit in {TITLE_MAX}{' '}
              characters and descriptions in {DESCRIPTION_MAX}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              rows={live}
              getRowKey={(p) => p.id}
              onRowClick={(p) => navigate(paths.page(p.id))}
              initialSort={{ id: 'flags', desc: true }}
              pageSize={8}
              empty={
                <EmptyState
                  compact
                  title="No live pages yet"
                  description="Published and scheduled pages are checked here."
                />
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Crawler files</CardTitle>
            <CardDescription>
              Generated from your published pages. Search engines read them from the primary domain.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              {
                file: 'sitemap.xml',
                hint: `Lists ${plural(s.pages.filter((p) => p.status === 'published').length, 'published page')}`,
              },
              { file: 'robots.txt', hint: 'Allows every page, blocks cart and checkout' },
            ].map((row) => {
              const url = `https://${host}/${row.file}`
              return (
                <div
                  key={row.file}
                  className="gap-3 rounded-2xl p-3 flex flex-wrap items-center bg-surface-2"
                >
                  <IconTile size="sm" className="bg-card">
                    <FileCode />
                  </IconTile>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate font-mono">{url}</p>
                    <p className="text-xs text-muted">{row.hint}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Copy ${row.file} link`}
                    onClick={() => copy(url)}
                  >
                    <Copy />
                  </Button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function CustomDomain() {
  const { tenant } = useScoped()
  const [checking, setChecking] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  const check = () => {
    if (!tenant.domain) return
    const domain = tenant.domain
    setChecking(true)
    timer.current = window.setTimeout(() => {
      setChecking(false)
      if (tenant.domainVerified)
        toast('DNS verified', {
          tone: 'success',
          description: `${domain} points at Commerce OS and SSL is active.`,
        })
      else
        toast('DNS still pending', {
          description: `${domain} does not point at Commerce OS yet. DNS changes can take up to 24 hours.`,
        })
    }, 800)
  }

  const records = dnsRecords(tenant)
  return (
    <div className="rounded-2xl p-3 bg-surface-2">
      <div className="gap-3 flex flex-wrap items-center">
        <IconTile size="sm" className="bg-card">
          <Link2 />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate font-mono">{tenant.domain ?? 'No custom domain'}</p>
          <p className="text-xs text-muted">
            {tenant.domain ? 'Custom domain' : 'Point your own domain at the store with the records below.'}
          </p>
        </div>
        {tenant.domain &&
          (tenant.domainVerified ? (
            <Badge variant="success">
              <ShieldCheck />
              Verified
            </Badge>
          ) : (
            <Badge variant="warning">Not verified</Badge>
          ))}
      </div>
      {!tenant.domainVerified && (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl overflow-x-auto bg-card">
            <table className="text-xs w-full text-left">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="px-3 py-2 font-semibold tracking-wide uppercase">Type</th>
                  <th className="px-3 py-2 font-semibold tracking-wide uppercase">Name</th>
                  <th className="px-3 py-2 font-semibold tracking-wide uppercase">Value</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {records.map((r) => (
                  <tr key={r.type} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-semibold">{r.type}</td>
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 break-all">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!tenant.domain && (
            <p className="text-xs text-muted">
              Then ask platform support to attach the domain to {tenant.name}.
            </p>
          )}
        </div>
      )}
      {tenant.domain && (
        <div className="mt-3 gap-2 flex flex-wrap items-center justify-between">
          <p className="text-xs text-muted">
            {tenant.domainVerified
              ? 'SSL renews on its own.'
              : 'Add both records at your domain registrar, then check.'}
          </p>
          <Button variant="outline" size="sm" loading={checking} onClick={check}>
            <RefreshCw />
            Check DNS
          </Button>
        </div>
      )}
    </div>
  )
}
