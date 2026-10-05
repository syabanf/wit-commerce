// lib
export { cn } from './lib/cn'
export { AVATAR_PALETTE } from './lib/palette'
export { useMediaQuery, useIsPhone } from './lib/use-media-query'
export { useElementSize } from './lib/use-element-size'
export { useLazyList, type LazyList } from './lib/use-lazy-list'
export { LazySentinel, type LazySentinelProps } from './components/lazy-sentinel'

// primitives
export { Button, buttonVariants, type ButtonProps } from './components/button'
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  type CardProps,
  type CardHeaderProps,
} from './components/card'
export { IconTile, type IconTileProps, type Tone } from './components/icon-tile'
export { StatCard, type StatCardProps } from './components/stat-card'
export {
  Badge,
  CountBadge,
  StatusDot,
  type BadgeProps,
  type CountBadgeProps,
  type StatusDotProps,
} from './components/badge'

// form controls
export { Input, type InputProps } from './components/input'
export { Textarea, type TextareaProps } from './components/textarea'
export { FormField, type FormFieldProps } from './components/form-field'
export { NativeSelect, type NativeSelectProps } from './components/native-select'
export { Combobox, MultiCombobox, type ComboboxProps, type MultiComboboxProps } from './components/combobox'
export { Switch, type SwitchProps } from './components/switch'
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from './components/segmented-control'
export { PhotoInput, type PhotoInputProps } from './components/photo-input'
export { SignaturePad, type SignaturePadProps } from './components/signature-pad'

// navigation and filters
export { PillTabs, UnderlineTabs, SegmentedTabs, type TabItem, type TabsProps } from './components/tabs'
export { Chip, ChipRow, type ChipProps } from './components/chip'
export { Steps, type StepsProps, type StepState } from './components/steps'

// data display
export { Avatar, AvatarStack, type AvatarProps, type AvatarStackProps } from './components/avatar'
export { DataTable, type Column, type DataTableProps, type DataTableState } from './components/data-table'
export { KeyValue, type KeyValueItem, type KeyValueProps } from './components/key-value'
export { EmptyState, type EmptyStateProps } from './components/empty-state'
export { Banner, type BannerProps } from './components/banner'
export { SplitStats, type SplitStatsProps } from './components/split-stats'
export { ProgressBar, SegmentBar, type ProgressBarProps, type SegmentBarProps } from './components/progress'
export { PageHeader, Kicker, type PageHeaderProps } from './components/page-header'

// overlays
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  type DialogContentProps,
} from './components/dialog'
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
  type SheetContentProps,
} from './components/sheet'
export { ConfirmDialog, type ConfirmDialogProps } from './components/confirm-dialog'
export { Popover, PopoverTrigger, PopoverAnchor, PopoverClose, PopoverContent } from './components/popover'
export { TooltipProvider, Tooltip, type TooltipProps } from './components/tooltip'
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  type DropdownMenuItemProps,
} from './components/dropdown-menu'
export { ActionMenu, type ActionMenuItem, type ActionMenuProps } from './components/action-menu'
export { Toaster, toast, type ToastOptions } from './components/toast'

// shell
export {
  Rail,
  RailItem,
  RailAction,
  RailWorkspace,
  RailCollapse,
  type RailProps,
  type RailItemProps,
  type RailActionProps,
  type RailWorkspaceProps,
  type RailCollapseProps,
} from './components/rail'
export {
  BottomBar,
  BottomBarItem,
  BottomBarAction,
  type BottomBarItemProps,
  type BottomBarActionProps,
} from './components/bottom-bar'

// charts
export { Sparkline, type SparklineProps } from './components/charts/sparkline'
export { BarStrip, type BarStripProps } from './components/charts/bar-strip'
export { BarList, type BarListItem, type BarListProps } from './components/charts/bar-list'
export { ColumnChart, type ColumnChartProps } from './components/charts/column-chart'
export { LineChart, type LineChartProps } from './components/charts/line-chart'
export { Donut, type DonutProps } from './components/charts/donut'
