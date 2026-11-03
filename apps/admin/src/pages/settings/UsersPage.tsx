import { ROLE_PERMISSIONS, ROLE_SUMMARY } from '@rc/fixtures'
import { ApiError, type IssuedStaff } from '@rc/api'
import { ROLE_LABEL, type Role, type User } from '@rc/types'
import {
  ActionMenu,
  Avatar,
  AvatarStack,
  Badge,
  Button,
  ConfirmDialog,
  type BadgeProps,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  type Column,
  DataTable,
  EmptyState,
  FilterChips,
  IconTile,
  NoMatch,
  PageHeader,
  TableFilters,
  cn,
  countBy,
  matchesQuery,
  toast,
} from '@rc/ui'
import {
  BriefcaseBusiness,
  Ellipsis,
  KeyRound,
  Pencil,
  Plus,
  UserX,
  Check,
  Headset,
  Lock,
  Megaphone,
  Minus,
  PackageCheck,
  ShieldCheck,
  Store,
} from 'lucide-react'
import { Fragment, type ReactNode, useMemo, useState } from 'react'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useScoped } from '../../state/scoped'
import { PERMISSION_COUNT, PERMISSION_GROUPS, PERMISSION_LABEL, ROLES } from './lib'
import { useAuth } from '../../auth/auth'
import { HTTP, api } from '../../lib/api'
import { useStore } from '../../state/store'
import { SecretDialog } from '../integrations/SecretDialog'
import { StaffDialog } from './StaffDialog'

const ROLE_ICON: Record<Role, ReactNode> = {
  platform_admin: <ShieldCheck />,
  tenant_admin: <Store />,
  marketing: <Megaphone />,
  operations: <PackageCheck />,
  service: <Headset />,
  sales: <BriefcaseBusiness />,
}

const ROLE_BADGE: Record<Role, BadgeProps['variant']> = {
  platform_admin: 'ink',
  tenant_admin: 'info',
  marketing: 'outline',
  operations: 'outline',
  service: 'outline',
  sales: 'outline',
}

export function UsersPage() {
  const s = useScoped()
  const { can } = useAuth()
  const { mergeUser } = useStore()
  // Staff changes need the server: the demo without an API stays read only.
  const manage = HTTP && can('user.manage')
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [issued, setIssued] = useState<IssuedStaff | null>(null)
  const [pending, setPending] = useState<{ kind: 'reset' | 'status'; user: User } | null>(null)
  const table = useTableHistory()
  const [query, setQuery] = useHistoryState('users.q', '')
  const [role, setRole] = useHistoryState<Role | null>('users.role', null)
  const searched = useMemo(
    () => s.users.filter((u) => matchesQuery(query, u.name, u.email, u.title)),
    [s.users, query],
  )
  const rows = role ? searched.filter((u) => u.role === role) : searched
  const activeCount = (query.trim() ? 1 : 0) + (role ? 1 : 0)
  const clear = () => {
    setQuery('')
    setRole(null)
  }
  const tenantName = useMemo(() => new Map(s.state.tenants.map((t) => [t.id, t.name])), [s.state.tenants])
  const members = useMemo(
    () => new Map(ROLES.map((r) => [r, s.users.filter((u) => u.role === r)])),
    [s.users],
  )

  // The server's rule: a platform admin manages anyone, others only people wholly within their brands.
  const mayManage = (u: User) =>
    u.id !== s.user.id &&
    (s.user.role === 'platform_admin' ||
      (u.role !== 'platform_admin' && u.tenantIds.every((id) => s.user.tenantIds.includes(id))))
  const act = async (run: () => Promise<void>) => {
    try {
      await run()
    } catch (err) {
      toast('The change was not saved', {
        tone: 'danger',
        description: err instanceof ApiError ? err.message : 'The server did not answer.',
      })
    }
  }
  const confirmed = () =>
    pending &&
    act(async () => {
      if (pending.kind === 'reset') setIssued(await api.staff.resetPassword(pending.user.id))
      else {
        const { user } = await api.staff.setDisabled(pending.user.id, !pending.user.disabled)
        mergeUser(user)
        toast(user.disabled ? 'Account disabled' : 'Account enabled', {
          tone: 'success',
          description: user.name,
        })
      }
    }).finally(() => setPending(null))

  const roleBadge = (u: User) =>
    u.disabled ? (
      <Badge variant="muted">Disabled</Badge>
    ) : (
      <Badge variant={ROLE_BADGE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
    )

  const columns: Column<User>[] = [
    {
      id: 'name',
      header: 'User',
      sortValue: (u) => u.name,
      cell: (u) => (
        <div className="min-w-0 gap-3 flex items-center">
          <Avatar name={u.name} color={u.color} size="sm" />
          <div className="min-w-0">
            <p className="font-medium truncate">
              {u.name}
              {u.id === s.user.id && <span className="ml-1.5 text-xs font-normal text-muted">You</span>}
            </p>
            <p className="text-xs truncate text-muted">{u.email}</p>
            <div className="mt-1 md:hidden">{roleBadge(u)}</div>
          </div>
        </div>
      ),
    },
    {
      id: 'title',
      header: 'Title',
      hideBelow: 'lg',
      sortValue: (u) => u.title,
      cell: (u) => <span className="text-sm">{u.title}</span>,
    },
    {
      id: 'role',
      header: 'Role',
      hideBelow: 'md',
      sortValue: (u) => ROLE_LABEL[u.role],
      cell: roleBadge,
    },
    {
      id: 'brands',
      header: 'Brands',
      hideBelow: 'md',
      cell: (u) =>
        u.role === 'platform_admin' ? (
          <span className="text-sm text-muted">Every brand</span>
        ) : (
          <span className="text-sm">
            {u.tenantIds.map((id) => tenantName.get(id) ?? 'Another brand').join(', ')}
          </span>
        ),
    },
    ...(manage
      ? [
          {
            id: 'actions',
            header: 'Actions',
            align: 'right',
            cell: (u: User) =>
              mayManage(u) ? (
                <ActionMenu
                  title={u.name}
                  trigger={
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${u.name}`}>
                      <Ellipsis />
                    </Button>
                  }
                  items={[
                    { key: 'edit', label: 'Edit', icon: <Pencil />, onSelect: () => setEditing(u) },
                    {
                      key: 'reset',
                      label: 'Reset password',
                      description: 'Signs them out everywhere',
                      icon: <KeyRound />,
                      onSelect: () => setPending({ kind: 'reset', user: u }),
                    },
                    {
                      key: 'status',
                      label: u.disabled ? 'Enable account' : 'Disable account',
                      icon: <UserX />,
                      destructive: !u.disabled,
                      onSelect: () => setPending({ kind: 'status', user: u }),
                    },
                  ]}
                />
              ) : null,
          } satisfies Column<User>,
        ]
      : []),
  ]

  return (
    <>
      <PageHeader
        title="Users & roles"
        description={`Who can sign in to ${s.tenant.name} and what each role may do.${manage ? '' : ' An admin adds staff and resets passwords.'}`}
        actions={
          manage ? (
            <Button onClick={() => setEditing('new')}>
              <Plus />
              Add staff
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              People with access to {s.tenant.name}, platform admins included.
            </CardDescription>
          </CardHeader>
          <TableFilters
            query={query}
            onQueryChange={setQuery}
            searchPlaceholder="Name, email or title"
            searchLabel="Search users"
            shown={rows.length}
            total={s.users.length}
            activeCount={activeCount}
            onClear={clear}
            chips={
              <FilterChips
                options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                value={role}
                onChange={setRole}
                counts={countBy(searched, (u) => u.role)}
                total={searched.length}
              />
            }
          />
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(u) => u.id}
            initialSort={{ id: 'name' }}
            resetPageKey={`${query}|${role}`}
            empty={
              activeCount ? (
                <NoMatch title="No users match" onClear={clear} />
              ) : (
                <EmptyState
                  compact
                  title="No users yet"
                  description="Users appear here once a platform admin adds them to this brand."
                />
              )
            }
            {...table}
          />
        </Card>

        <div className="gap-4 sm:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
          {ROLES.map((role) => {
            const people = members.get(role) ?? []
            const mine = role === s.user.role
            return (
              <Card key={role} className="p-5 flex flex-col">
                <div className="gap-3 flex items-start justify-between">
                  <IconTile tone={mine ? 'ink' : 'default'}>{ROLE_ICON[role]}</IconTile>
                  {mine && <Badge variant="info">Your role</Badge>}
                </div>
                <h2 className="mt-4 text-base font-semibold leading-tight">{ROLE_LABEL[role]}</h2>
                <p className="mt-1 text-sm flex-1 text-muted">{ROLE_SUMMARY[role]}</p>
                <div className="mt-4 gap-2 pt-4 text-xs flex flex-wrap items-center justify-between border-t border-border text-muted">
                  {people.length ? (
                    <AvatarStack
                      people={people.map((p) => ({ name: p.name, color: p.color }))}
                      max={4}
                      size="xs"
                    />
                  ) : (
                    <span>Nobody holds this role here</span>
                  )}
                  <span className="tabular-nums">
                    <span className="font-semibold text-foreground">{people.length}</span>{' '}
                    {people.length === 1 ? 'user' : 'users'} · {ROLE_PERMISSIONS[role].length} of{' '}
                    {PERMISSION_COUNT} permissions
                  </span>
                </div>
              </Card>
            )
          })}
        </div>

        <PermissionMatrix currentRole={s.user.role} />
      </div>
      {editing && (
        <StaffDialog
          person={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onIssued={setIssued}
        />
      )}
      {issued && (
        <SecretDialog
          title={`Temporary password for ${issued.user.name}`}
          description={`Give this to ${issued.user.email} in person or over a private channel. It shows only now. Ask them to change it from the account menu after signing in.`}
          secret={issued.temporaryPassword}
          onClose={() => setIssued(null)}
        />
      )}
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={
            pending.kind === 'reset'
              ? `Reset the password of ${pending.user.name}?`
              : `${pending.user.disabled ? 'Enable' : 'Disable'} ${pending.user.name}?`
          }
          description={
            pending.kind === 'reset'
              ? 'Their current password stops working and they sign out everywhere. You get a temporary one to pass on.'
              : pending.user.disabled
                ? 'They can sign in again with their current password.'
                : 'They sign out everywhere and cannot sign in until an admin enables the account.'
          }
          confirmLabel={
            pending.kind === 'reset'
              ? 'Reset password'
              : pending.user.disabled
                ? 'Enable account'
                : 'Disable account'
          }
          destructive={!(pending.kind === 'status' && pending.user.disabled)}
          onConfirm={() => void confirmed()}
        />
      )}
    </>
  )
}

const sticky = 'sticky left-0 z-10'
const rowBorder = 'border-b border-border'

function PermissionMatrix({ currentRole }: { currentRole: Role }) {
  return (
    <Card>
      <CardHeader
        action={
          <Badge variant="muted">
            <Lock />
            Read only
          </Badge>
        }
      >
        <CardTitle>Permissions by role</CardTitle>
        <CardDescription>Roles are fixed in this release, so the matrix is for reference.</CardDescription>
      </CardHeader>
      {/* Six role columns outgrow a phone: the table scrolls inside the card with the permission column pinned. */}
      <div className="pb-2 relative overflow-x-auto">
        <table className="border-spacing-0 text-sm w-full border-separate">
          <caption className="sr-only">Permissions per role</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className={cn(
                  sticky,
                  rowBorder,
                  'min-w-48 px-5 py-3 text-xs font-semibold bg-card text-left text-muted',
                )}
              >
                Permission
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className={cn(
                    rowBorder,
                    'min-w-24 px-2 py-3 text-xs font-semibold text-center align-bottom text-muted',
                  )}
                >
                  <span className={cn('block', role === currentRole && 'text-foreground')}>
                    {ROLE_LABEL[role]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((group) => (
              <Fragment key={group.area}>
                <tr>
                  <th
                    scope="rowgroup"
                    className={cn(
                      sticky,
                      'px-5 py-2 font-semibold tracking-wider bg-surface-2 text-left text-[0.6875rem] text-muted uppercase',
                    )}
                  >
                    {group.area}
                  </th>
                  <td colSpan={ROLES.length} className="bg-surface-2" />
                </tr>
                {group.permissions.map((permission) => (
                  <tr key={permission}>
                    <th
                      scope="row"
                      className={cn(sticky, rowBorder, 'px-5 py-2.5 font-medium bg-card text-left')}
                    >
                      {PERMISSION_LABEL[permission]}
                    </th>
                    {ROLES.map((role) => (
                      <td key={role} className={cn(rowBorder, 'px-2 py-2 text-center')}>
                        {ROLE_PERMISSIONS[role].includes(permission) ? (
                          <>
                            <IconTile size="sm" tone="success" shape="round" className="size-7 mx-auto">
                              <Check aria-hidden="true" />
                            </IconTile>
                            <span className="sr-only">Allowed</span>
                          </>
                        ) : (
                          <>
                            <Minus aria-hidden="true" className="size-4 mx-auto text-silver" />
                            <span className="sr-only">Not allowed</span>
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
