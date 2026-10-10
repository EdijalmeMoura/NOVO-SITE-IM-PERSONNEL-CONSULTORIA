import { BriefcaseBusiness, Compass, Search, Settings2, UsersRound, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ServiceItem } from '../data';

const icons: Record<string, LucideIcon> = {
  search: Search,
  briefcase: BriefcaseBusiness,
  settings: Settings2,
  compass: Compass,
  users: UsersRound,
  workflow: Workflow,
};

export function ServiceIcon({ service, size = 23 }: { service: ServiceItem; size?: number }) {
  const Icon = icons[service.icon] || Search;
  return <Icon size={size} strokeWidth={1.65} aria-hidden="true" />;
}
