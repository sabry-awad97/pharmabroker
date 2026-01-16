import { Link, useRouterState } from '@tanstack/react-router';
import {
  ChevronLeft,
  ChevronRight,
  Home,
  LayoutDashboard,
  MessageCircle,
  Pill,
  Search,
  Settings,
  Smartphone,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { SessionSwitcher } from '@/components/session-picker';
import { cn } from '@/lib/utils';

import { Button } from '../ui/button';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const navItems: NavItem[] = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/whatsapp/groups', icon: Users, label: 'Groups' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/medications', icon: Pill, label: 'Medications' },
  { to: '/messages', icon: MessageCircle, label: 'Messages' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouterState();
  const currentPath = router.location.pathname;

  const isItemActive = (item: NavItem): boolean => {
    return currentPath === item.to || currentPath.startsWith(item.to + '/');
  };

  return (
    <aside
      className={cn(
        'border-border bg-card/50 flex h-full flex-col border-r transition-all duration-200',
        collapsed ? 'w-12' : 'w-48',
      )}
    >
      {/* Session Switcher */}
      <div className="border-border border-b p-2">
        <SessionSwitcher collapsed={collapsed} />
      </div>

      {/* Nav Items */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map(item => (
          <NavItemLink
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            collapsed={collapsed}
            active={isItemActive(item)}
          />
        ))}
      </nav>

      {/* Bottom Items */}
      <div className="border-border space-y-1 border-t p-2">
        {/* Sessions - Global management item */}
        <NavItemLink
          to="/whatsapp/sessions"
          icon={Smartphone}
          label="Manage Sessions"
          collapsed={collapsed}
          active={isItemActive({
            to: '/whatsapp/sessions',
            icon: Smartphone,
            label: 'Sessions',
          })}
          variant="special"
        />

        <div className="border-border my-1 border-t" />

        {/* Settings */}
        <NavItemLink
          to="/settings"
          icon={Settings}
          label="Settings"
          collapsed={collapsed}
          active={isItemActive({
            to: '/settings',
            icon: Settings,
            label: 'Settings',
          })}
        />

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
  variant = 'default',
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  collapsed: boolean;
  active: boolean;
  variant?: 'default' | 'special';
}) {
  const isSpecial = variant === 'special';

  return (
    <Link
      to={to}
      className={cn(
        'flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
        'text-muted-foreground hover:bg-muted hover:text-foreground',
        active && 'bg-primary/10 text-primary',
        collapsed && 'justify-center px-0',
        isSpecial &&
          !active &&
          'text-emerald-500/70 hover:bg-emerald-500/10 hover:text-emerald-500',
        isSpecial && active && 'bg-emerald-500/10 text-emerald-500',
      )}
      title={collapsed ? label : undefined}
    >
      <Icon
        className={cn('h-4 w-4 shrink-0', isSpecial && 'text-emerald-500')}
      />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}
