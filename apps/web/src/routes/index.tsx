import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import {
  Activity,
  ArrowRight,
  Bot,
  MessageCircle,
  Pill,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';

import { FeatureCard, StatCard } from '@/components/home';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { orpc } from '@/utils/orpc';

export const Route = createFileRoute('/')({
  component: HomeComponent,
});

function HomeComponent() {
  const healthCheck = useQuery(orpc.healthCheck.queryOptions());
  const { data: session } = authClient.useSession();
  const isSignedIn = !!session?.user;

  return (
    <div className="p-6">
      {/* Hero Section */}
      <div className="mb-8 rounded-lg border border-border bg-linear-to-br from-emerald-950/30 via-background to-background p-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
              <Sparkles className="h-3 w-3" />
              <span>AI-Powered Platform</span>
            </div>

            <h1 className="mb-2 text-3xl font-bold">
              {isSignedIn ? (
                <>
                  Welcome back,{' '}
                  <span className="text-emerald-500">
                    {session.user.name?.split(' ')[0] || 'User'}
                  </span>
                </>
              ) : (
                <>
                  Welcome to{' '}
                  <span className="text-emerald-500">PharmaBroker</span>
                </>
              )}
            </h1>

            <p className="mb-6 max-w-lg text-sm text-muted-foreground">
              Bridging medication supply and demand through intelligent
              automation. Connect pharmacies with patients seamlessly.
            </p>

            <div className="flex gap-2">
              {isSignedIn ? (
                <Link
                  to="/dashboard"
                  className="inline-flex h-8 items-center gap-2 rounded-md bg-emerald-600 px-4 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
                >
                  Go to Dashboard
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="inline-flex h-8 items-center gap-2 rounded-md bg-emerald-600 px-4 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
                  >
                    Get Started
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex h-8 items-center rounded-md border border-border bg-background px-4 text-xs font-medium transition-colors hover:bg-muted"
                  >
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
            <div
              className={`h-2 w-2 rounded-full ${
                healthCheck.data
                  ? 'animate-pulse bg-emerald-500'
                  : healthCheck.isLoading
                    ? 'animate-pulse bg-yellow-500'
                    : 'bg-red-500'
              }`}
            />
            <span className="text-xs text-muted-foreground">
              {healthCheck.isLoading
                ? 'Connecting...'
                : healthCheck.data
                  ? 'Online'
                  : 'Offline'}
            </span>
            {healthCheck.error && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => healthCheck.refetch()}
                className="h-5 px-1 text-xs"
              >
                Retry
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="mb-6">
        <h2 className="mb-4 text-sm font-semibold">Features</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<Bot className="h-4 w-4" />}
            title="AI Matching"
            description="Smart algorithms match requests with supply"
            color="emerald"
          />
          <FeatureCard
            icon={<MessageCircle className="h-4 w-4" />}
            title="WhatsApp"
            description="Seamless messaging integration"
            color="teal"
          />
          <FeatureCard
            icon={<Search className="h-4 w-4" />}
            title="Smart Search"
            description="Find medications with fuzzy matching"
            color="cyan"
          />
          <FeatureCard
            icon={<TrendingUp className="h-4 w-4" />}
            title="Analytics"
            description="Track trends and pricing insights"
            color="blue"
          />
          <FeatureCard
            icon={<Shield className="h-4 w-4" />}
            title="Secure"
            description="End-to-end encryption"
            color="indigo"
          />
          <FeatureCard
            icon={<Zap className="h-4 w-4" />}
            title="Real-time"
            description="Instant availability notifications"
            color="violet"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Pill className="h-4 w-4" />}
          value="10K+"
          label="Medications"
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          value="99.9%"
          label="Uptime"
        />
        <StatCard
          icon={<MessageCircle className="h-4 w-4" />}
          value="50K+"
          label="Messages"
        />
      </div>
    </div>
  );
}
