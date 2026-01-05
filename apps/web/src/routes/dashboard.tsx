import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  Activity,
  Bell,
  MessageCircle,
  MoreHorizontal,
  Pill,
  Search,
  TrendingUp,
} from 'lucide-react';

import {
  ActionButton,
  ActivityItem,
  DashboardStatCard,
  StatusRow,
} from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { orpc } from '@/utils/orpc';

export const Route = createFileRoute('/dashboard')({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        to: '/login',
        throw: true,
      });
    }
    return { session };
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const privateData = useQuery(orpc.privateData.queryOptions());

  const firstName = session.data?.user.name?.split(' ')[0] || 'User';

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Welcome back, {firstName}
          </p>
        </div>
        <Button variant="outline" size="sm">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats Row */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardStatCard
          icon={<Pill className="h-4 w-4" />}
          label="Active Listings"
          value="24"
          change="+3"
          trend="positive"
        />
        <DashboardStatCard
          icon={<Search className="h-4 w-4" />}
          label="Requests"
          value="156"
          change="+12%"
          trend="positive"
        />
        <DashboardStatCard
          icon={<MessageCircle className="h-4 w-4" />}
          label="Messages"
          value="89"
          change="5 new"
        />
        <DashboardStatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Match Rate"
          value="78%"
          change="+5%"
          trend="positive"
        />
      </div>

      {/* Content Grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Activity List */}
        <div className="lg:col-span-2">
          <div className="rounded-md border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <h2 className="text-sm font-medium">Recent Activity</h2>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                View All
              </Button>
            </div>
            <div className="divide-y divide-border">
              <ActivityItem
                icon={<Pill className="h-3.5 w-3.5 text-emerald-500" />}
                title="New medication match"
                description="Paracetamol 500mg • 3 pharmacies"
                time="2m"
                variant="emerald"
              />
              <ActivityItem
                icon={<MessageCircle className="h-3.5 w-3.5 text-blue-500" />}
                title="Message received"
                description="Cairo Pharmacy inquiry"
                time="15m"
                variant="blue"
              />
              <ActivityItem
                icon={<Activity className="h-3.5 w-3.5 text-violet-500" />}
                title="Price update"
                description="Amoxicillin • 12 listings"
                time="1h"
                variant="violet"
              />
              <ActivityItem
                icon={<Bell className="h-3.5 w-3.5 text-amber-500" />}
                title="Low stock alert"
                description="Insulin • Alexandria"
                time="3h"
                variant="amber"
              />
            </div>
          </div>
        </div>

        {/* Sidebar Panels */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="rounded-md border border-border bg-card p-3">
            <h2 className="mb-3 text-sm font-medium">Quick Actions</h2>
            <div className="space-y-1">
              <ActionButton icon={<Search />} label="Search Medications" />
              <ActionButton icon={<Pill />} label="Add Listing" />
              <ActionButton icon={<MessageCircle />} label="Messages" />
            </div>
          </div>

          {/* System Status */}
          <div className="rounded-md border border-border bg-card p-3">
            <h2 className="mb-3 text-sm font-medium">System Status</h2>
            <div className="space-y-2">
              <StatusRow
                label="API"
                status={privateData.data ? 'online' : 'checking'}
              />
              <StatusRow label="Database" status="online" />
              <StatusRow label="WhatsApp" status="online" />
              <StatusRow label="AI Engine" status="online" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
