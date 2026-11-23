import {
  ChartColumn, Calendar, Folder, House, Image, LayoutDashboard, Mail, Notebook, Settings, SquareCheck, Star, Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { IconName } from '../../domain/workspace/types'

/** The only icons configuration can select: a code-owned map from the persisted name to a component. */
export const NAV_ICONS: Record<IconName, LucideIcon> = {
  home: House,
  'layout-dashboard': LayoutDashboard,
  'check-square': SquareCheck,
  notebook: Notebook,
  image: Image,
  'bar-chart': ChartColumn,
  calendar: Calendar,
  settings: Settings,
  star: Star,
  folder: Folder,
  users: Users,
  mail: Mail,
}

export const ICON_LABELS: Record<IconName, string> = {
  home: 'Home',
  'layout-dashboard': 'Dashboard',
  'check-square': 'Checklist',
  notebook: 'Notebook',
  image: 'Image',
  'bar-chart': 'Chart',
  calendar: 'Calendar',
  settings: 'Settings',
  star: 'Star',
  folder: 'Folder',
  users: 'People',
  mail: 'Mail',
}

export const resolveIcon = (name: string): LucideIcon => (Object.hasOwn(NAV_ICONS, name) ? NAV_ICONS[name as IconName] : House)
