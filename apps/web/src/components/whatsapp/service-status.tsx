import { Activity, CheckCircle2, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  useWhatsappHealth,
  useWhatsappReady,
  healthStatus,
  readyStatus,
} from '@/hooks/whatsapp';

interface WhatsappServiceStatusProps {
  className?: string;
}

export function WhatsappServiceStatus({
  className,
}: WhatsappServiceStatusProps) {
  const health = useWhatsappHealth();
  const ready = useWhatsappReady();

  const isHealthy = health.data?.status === healthStatus.enum.ok;
  const isReady = ready.data?.status === readyStatus.enum.ready;
  // Only show loading on initial load, not on refetch
  const isInitialLoading =
    (health.isLoading && !health.data) || (ready.isLoading && !ready.data);

  return (
    <div
      className={cn(
        'border-border bg-card flex items-center justify-between rounded-md border p-3 transition-all duration-200',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200',
            isInitialLoading && 'bg-muted',
            !isInitialLoading && isHealthy && isReady && 'bg-emerald-500/10',
            !isInitialLoading && (!isHealthy || !isReady) && 'bg-red-500/10',
          )}
        >
          {isInitialLoading ? (
            <Activity className="text-muted-foreground h-4 w-4 animate-pulse" />
          ) : isHealthy && isReady ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium">WhatsApp Service</p>
          <p className="text-muted-foreground text-xs">
            {isInitialLoading
              ? 'Checking status...'
              : isHealthy && isReady
                ? 'All systems operational'
                : 'Service unavailable'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <StatusIndicator
          label="API"
          status={
            isInitialLoading ? 'loading' : isHealthy ? 'online' : 'offline'
          }
        />
        <StatusIndicator
          label="Ready"
          status={isInitialLoading ? 'loading' : isReady ? 'online' : 'offline'}
        />
      </div>
    </div>
  );
}

function StatusIndicator({
  label,
  status,
}: {
  label: string;
  status: 'online' | 'offline' | 'loading';
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'h-2 w-2 rounded-full transition-colors duration-200',
          status === 'loading' && 'animate-pulse bg-amber-500',
          status === 'online' && 'bg-emerald-500',
          status === 'offline' && 'bg-red-500',
        )}
      />
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}
