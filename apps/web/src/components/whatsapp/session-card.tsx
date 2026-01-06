import type { Session } from '@/hooks/whatsapp';

import { useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  MoreVertical,
  QrCode,
  Trash2,
  Wifi,
  WifiOff,
  Clock,
  AlertCircle,
  Radio,
  Smartphone,
  Loader2,
  LogOut,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn, formatRelativeTime, extractPhoneNumber } from '@/lib/utils';
import { useDeleteWhatsappSession } from '@/hooks/whatsapp';
import { WhatsappQRDialog } from './qr-dialog';

const statusVariants = cva('', {
  variants: {
    status: {
      connected: '',
      connecting: '',
      pending: '',
      disconnected: '',
      logged_out: '',
      expired: '',
    },
  },
  defaultVariants: {
    status: 'disconnected',
  },
});

const avatarVariants = cva(
  'flex h-12 w-12 items-center justify-center rounded-full',
  {
    variants: {
      status: {
        connected: 'bg-emerald-500/10',
        connecting: 'bg-blue-500/10',
        pending: 'bg-amber-500/10',
        disconnected: 'bg-muted',
        logged_out: 'bg-orange-500/10',
        expired: 'bg-red-500/10',
      },
    },
    defaultVariants: {
      status: 'disconnected',
    },
  },
);

const iconVariants = cva('h-6 w-6', {
  variants: {
    status: {
      connected: 'text-emerald-500',
      connecting: 'text-blue-500',
      pending: 'text-amber-500',
      disconnected: 'text-muted-foreground',
      logged_out: 'text-orange-500',
      expired: 'text-red-500',
    },
  },
  defaultVariants: {
    status: 'disconnected',
  },
});

const borderVariants = cva(
  'group relative border-l-4 transition-all duration-200 hover:shadow-md',
  {
    variants: {
      status: {
        connected: 'border-l-emerald-500',
        connecting: 'border-l-blue-500',
        pending: 'border-l-amber-500',
        disconnected: 'border-l-muted-foreground',
        logged_out: 'border-l-orange-500',
        expired: 'border-l-red-500',
      },
    },
    defaultVariants: {
      status: 'disconnected',
    },
  },
);

const pulseVariants = cva('', {
  variants: {
    status: {
      connected: 'bg-emerald-500',
      connecting: 'bg-blue-500',
      pending: 'bg-amber-500',
      disconnected: 'bg-muted-foreground',
      logged_out: 'bg-orange-500',
      expired: 'bg-red-500',
    },
  },
  defaultVariants: {
    status: 'disconnected',
  },
});

type SessionStatus =
  | 'connected'
  | 'connecting'
  | 'pending'
  | 'disconnected'
  | 'logged_out'
  | 'expired';

const statusConfig: Record<
  SessionStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'outline' | 'destructive';
    icon: typeof Wifi;
  }
> = {
  connected: { label: 'Connected', variant: 'default', icon: Wifi },
  connecting: { label: 'Connecting', variant: 'secondary', icon: Loader2 },
  pending: { label: 'Pending', variant: 'secondary', icon: Clock },
  disconnected: { label: 'Disconnected', variant: 'outline', icon: WifiOff },
  logged_out: { label: 'Logged Out', variant: 'outline', icon: LogOut },
  expired: { label: 'Expired', variant: 'destructive', icon: AlertCircle },
};

interface WhatsappSessionCardProps extends VariantProps<typeof statusVariants> {
  session: Session;
}

export function WhatsappSessionCard({ session }: WhatsappSessionCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const deleteSession = useDeleteWhatsappSession();

  const status = (session.status as SessionStatus) || 'disconnected';
  const config = statusConfig[status];
  const StatusIcon = config.icon;

  const handleDelete = () => {
    deleteSession.mutate(
      { id: session.id },
      { onSuccess: () => setShowDeleteDialog(false) },
    );
  };

  const needsAuth =
    status === 'pending' ||
    status === 'disconnected' ||
    status === 'logged_out';
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <>
      <Card className={borderVariants({ status })}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={avatarVariants({ status })}>
                <Smartphone className={iconVariants({ status })} />
              </div>
              {isConnected && (
                <span className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4">
                  <span
                    className={cn(
                      'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                      pulseVariants({ status }),
                    )}
                  />
                  <span
                    className={cn(
                      'relative inline-flex h-4 w-4 rounded-full border-2 border-white dark:border-gray-900',
                      pulseVariants({ status }),
                    )}
                  />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <CardTitle className="truncate">{session.name}</CardTitle>
              {session.jid && (
                <p className="text-muted-foreground mt-0.5 text-xs font-medium">
                  +{extractPhoneNumber(session.jid)}
                </p>
              )}
            </div>
          </div>

          <CardAction>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger>
                  <Badge
                    variant={config.variant}
                    className="gap-1.5 rounded-full px-2.5 py-1"
                  >
                    <StatusIcon className="h-3 w-3" />
                    <span className="hidden sm:inline">{config.label}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Status: {config.label}</p>
                </TooltipContent>
              </Tooltip>

              <DropdownMenu>
                <DropdownMenuTrigger className="hover:border-border hover:bg-accent flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-transparent opacity-0 transition-all group-hover:opacity-100 focus:opacity-100">
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-52 rounded-lg p-1"
                >
                  {needsAuth && (
                    <>
                      <DropdownMenuItem
                        onClick={() => setShowQRDialog(true)}
                        className="gap-3 rounded-md px-3 py-2.5"
                      >
                        <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-md">
                          <QrCode className="text-primary h-4 w-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium">Scan QR Code</span>
                          <span className="text-muted-foreground text-[10px]">
                            Authenticate session
                          </span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="my-1" />
                    </>
                  )}
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive gap-3 rounded-md px-3 py-2.5"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <div className="bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-md">
                      <Trash2 className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium">Delete Session</span>
                      <span className="text-destructive/70 text-[10px]">
                        Remove permanently
                      </span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardAction>
        </CardHeader>

        <CardContent>
          {needsAuth ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => setShowQRDialog(true)}
            >
              <QrCode className="h-4 w-4" />
              Authenticate with QR
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger>
                <div className="bg-muted/50 flex items-center gap-2 rounded-md px-3 py-2">
                  <Radio className="h-4 w-4 animate-pulse text-emerald-500" />
                  <span className="text-muted-foreground text-xs">
                    Listening...
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Monitoring groups</p>
              </TooltipContent>
            </Tooltip>
          )}
        </CardContent>

        <CardFooter className="bg-muted/30">
          <div className="text-muted-foreground flex w-full items-center justify-between text-xs">
            <span>Created {formatRelativeTime(session.created_at)}</span>
            <span className="text-muted-foreground/60">
              ID: {session.id.slice(0, 8)}
            </span>
          </div>
        </CardFooter>
      </Card>

      <WhatsappQRDialog
        sessionId={session.id}
        sessionName={session.name}
        open={showQRDialog}
        onOpenChange={setShowQRDialog}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{session.name}"? This will
              disconnect the WhatsApp account and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteSession.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSession.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
