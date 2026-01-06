import { Link, useRouterState } from '@tanstack/react-router';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  Pill,
  Search,
  Settings,
  Smartphone,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { Button } from '../ui/button';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  {
    to: '/whatsapp/sessions',
    icon: MessageSquare,
    label: 'WhatsApp',
    children: [
      { to: '/whatsapp/sessions', icon: Smartphone, label: 'Sessions' },
      { to: '/whatsapp/groups', icon: Users, label: 'Groups' },
    ],
  },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/medications', icon: Pill, label: 'Medications' },
  { to: '/messages', icon: MessageCircle, label: 'Messages' },
];

const bottomItems: NavItem[] = [
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([
    '/whatsapp/sessions',
  ]);
  const router = useRouterState();
  const currentPath = router.location.pathname;

  const toggleExpanded = (to: string) => {
    setExpandedItems(prev =>
      prev.includes(to) ? prev.filter(item => item !== to) : [...prev, to],
    );
  };

  const isItemActive = (item: NavItem): boolean => {
    if (item.children) {
      return item.children.some(
        child =>
          currentPath === child.to || currentPath.startsWith(child.to + '/'),
      );
    }
    return currentPath === item.to;
  };

  const isChildActive = (to: string): boolean => {
    return currentPath === to || currentPath.startsWith(to + '/');
  };

  return (
    <aside
      className={cn(
        'border-border bg-card/50 flex h-full flex-col border-r transition-all duration-200',
        collapsed ? 'w-12' : 'w-48',
      )}
    >
      {/* Nav Items */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map(item =>
          item.children ? (
            <NavItemWithChildren
              key={item.to}
              item={item}
              collapsed={collapsed}
              expanded={expandedItems.includes(item.to)}
              onToggle={() => toggleExpanded(item.to)}
              isActive={isItemActive(item)}
              isChildActive={isChildActive}
            />
          ) : (
            <NavItemLink
              key={item.to}
              to={item.to}
              icon={item.icon}
              label={item.label}
              collapsed={collapsed}
              active={isItemActive(item)}
            />
          ),
        )}
      </nav>

      {/* Bottom Items */}
      <div className="border-border space-y-1 border-t p-2">
        {bottomItems.map(item => (
          <NavItemLink
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            collapsed={collapsed}
            active={isItemActive(item)}
          />
        ))}

        {/* Collapse Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'text-muted-foreground hover:bg-muted hover:text-foreground w-full justify-start gap-3',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}

function NavItemLink({
  to,
  icon: Icon,
  label,
  collapsed,
  active,
  indent = false,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  collapsed: boolean;
  active: boolean;
  indent?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
        'text-muted-foreground hover:bg-muted hover:text-foreground',
        active && 'bg-primary/10 text-primary',
        collapsed && 'justify-center px-0',
        indent && !collapsed && 'ml-4 pl-4',
      )}
      title={collapsed ? label : undefined}
    >
      <Icon className={cn('h-4 w-4 shrink-0', indent && 'h-3.5 w-3.5')} />
      {!collapsed && <span className={cn(indent && 'text-xs')}>{label}</span>}
    </Link>
  );
}

function NavItemWithChildren({
  item,
  collapsed,
  expanded,
  onToggle,
  isActive,
  isChildActive,
}: {
  item: NavItem;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  isActive: boolean;
  isChildActive: (to: string) => boolean;
}) {
  const Icon = item.icon;

  if (collapsed) {
    // When collapsed, show as a simple link to the parent route
    return (
      <Link
        to={item.to}
        className={cn(
          'flex h-9 items-center justify-center rounded-md text-sm font-medium transition-colors',
          'text-muted-foreground hover:bg-muted hover:text-foreground',
          isActive && 'bg-primary/10 text-primary',
        )}
        title={item.label}
      >
        <Icon className="h-4 w-4 shrink-0" />
      </Link>
    );
  }

  return (
    <div className="space-y-1">
      {/* Parent item with toggle */}
      <button
        onClick={onToggle}
        className={cn(
          'flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
          'text-muted-foreground hover:bg-muted hover:text-foreground',
          isActive && 'text-foreground',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* Children */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          expanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="border-border ml-3 space-y-0.5 border-l pl-2">
          {item.children?.map(child => (
            <Link
              key={child.to}
              to={child.to}
              className={cn(
                'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                'text-muted-foreground hover:bg-muted hover:text-foreground',
                isChildActive(child.to) && 'bg-primary/10 text-primary',
              )}
            >
              <child.icon className="h-3.5 w-3.5 shrink-0" />
              <span>{child.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
