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
} from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { Button } from '../ui/button';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/medications', icon: Pill, label: 'Medications' },
  { to: '/messages', icon: MessageCircle, label: 'Messages' },
] as const;

const bottomItems = [
  { to: '/settings', icon: Settings, label: 'Settings' },
] as const;

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouterState();
  const currentPath = router.location.pathname;

  return (
    <aside
      className={cn(
        'border-border bg-card/50 flex h-full flex-col border-r transition-all duration-200',
        collapsed ? 'w-12' : 'w-48',
      )}
    >
      {/* Nav Items */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map(item => (
          <NavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            collapsed={collapsed}
            active={currentPath === item.to}
          />
        ))}
      </nav>

      {/* Bottom Items */}
      <div className="border-border space-y-1 border-t p-2">
        {bottomItems.map(item => (
          <NavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            collapsed={collapsed}
            active={currentPath === item.to}
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

function NavItem({
  to,
  icon: Icon,
  label,
  collapsed,
  active,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
        'text-muted-foreground hover:bg-muted hover:text-foreground',
        active && 'bg-muted text-foreground',
        collapsed && 'justify-center px-0',
      )}
      title={collapsed ? label : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}
