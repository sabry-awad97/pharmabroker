/**
 * Message Detail Dialog Component
 *
 * A beautiful, creative dialog for viewing message details.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Copy,
  Sparkles,
  RotateCcw,
  Clock,
  Users,
  MessageSquare,
  FileJson,
  Brain,
  CheckCircle2,
  Forward,
  Reply,
  Zap,
  Database,
  ArrowRight,
  Hash,
  Calendar,
  User,
  Image,
  Video,
  Mic,
  File,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { getAvatarUrl, getInitials } from '@/utils/avatar';
import { MessageTypeBadge, type MessageType } from './message-type-badge';
import { AIStatusBadge, type AIStatus } from './ai-status-badge';
import type { WhatsAppMessage } from './messages-data-table';

interface ExtractedData {
  id: string;
  dataType: string;
  data: Record<string, unknown>;
  confidence: number;
  model: string | null;
  createdAt: Date;
}

interface MessageDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: WhatsAppMessage | null;
  extractedData?: ExtractedData[];
  rawPayload?: Record<string, unknown>;
  isLoading?: boolean;
  onProcessAI?: () => void;
  onRetryAI?: () => void;
  isProcessing?: boolean;
}

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  text: MessageSquare,
  image: Image,
  video: Video,
  audio: Mic,
  document: File,
  location: MapPin,
};

export function MessageDetailDialog({
  open,
  onOpenChange,
  message,
  extractedData = [],
  rawPayload,
  isLoading = false,
  onProcessAI,
  onRetryAI,
  isProcessing = false,
}: MessageDetailDialogProps) {
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const TypeIcon = message
    ? typeIcons[message.messageType] || MessageSquare
    : MessageSquare;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        {isLoading ? (
          <MessageDetailSkeleton />
        ) : message ? (
          <>
            {/* Hero Header */}
            <div className="relative overflow-hidden">
              {/* Gradient Background */}
              <div className="absolute inset-0 bg-linear-to-br from-violet-500/10 via-purple-500/5 to-transparent" />
              <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-linear-to-bl from-emerald-500/10 to-transparent blur-3xl" />

              <div className="relative p-6 pb-4">
                <div className="flex items-start gap-4">
                  {/* Avatar with status ring */}
                  <div className="relative">
                    <div
                      className={cn(
                        'absolute -inset-1 rounded-full bg-linear-to-r',
                        message.isFromMe
                          ? 'from-emerald-500 to-teal-500'
                          : 'from-violet-500 to-purple-500',
                        'opacity-75 blur-sm',
                      )}
                    />
                    <Avatar className="border-background relative h-16 w-16 border-2">
                      <AvatarImage
                        src={getAvatarUrl(
                          message.senderPushName || message.senderJid,
                        )}
                        alt={message.senderPushName || 'Unknown'}
                      />
                      <AvatarFallback className="text-lg font-semibold">
                        {getInitials(
                          message.senderPushName ||
                            message.senderJid.split('@')[0],
                        )}
                      </AvatarFallback>
                    </Avatar>
                    {/* Type indicator */}
                    <div
                      className={cn(
                        'border-background absolute -right-1 -bottom-1 rounded-full border-2 p-1.5',
                        'bg-linear-to-r from-violet-500 to-purple-500',
                      )}
                    >
                      <TypeIcon className="h-3 w-3 text-white" />
                    </div>
                  </div>

                  {/* Sender Info */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h2 className="truncate text-xl font-semibold">
                        {message.senderPushName ||
                          message.senderJid.split('@')[0]}
                      </h2>
                      {message.isFromMe && (
                        <Badge className="border-emerald-500/30 bg-emerald-500/20 text-emerald-600">
                          You
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground mb-2 truncate text-sm">
                      {message.senderJid}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <MessageTypeBadge
                        type={message.messageType as MessageType}
                      />
                      <AIStatusBadge
                        status={message.aiStatus as AIStatus}
                        showLabel
                        model={message.aiModel}
                        error={message.aiError}
                      />
                      {message.isForwarded && (
                        <Badge variant="secondary" className="gap-1">
                          <Forward className="h-3 w-3" />
                          Forwarded
                        </Badge>
                      )}
                      {message.quotedMessageId && (
                        <Badge variant="secondary" className="gap-1">
                          <Reply className="h-3 w-3" />
                          Reply
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex flex-col gap-2">
                    {(message.aiStatus === 'pending' ||
                      message.aiStatus === 'failed') && (
                      <Button
                        size="sm"
                        onClick={
                          message.aiStatus === 'failed'
                            ? onRetryAI
                            : onProcessAI
                        }
                        disabled={isProcessing}
                        className={cn(
                          'gap-1.5',
                          message.aiStatus === 'failed'
                            ? 'bg-orange-500 hover:bg-orange-600'
                            : 'bg-linear-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600',
                        )}
                      >
                        {message.aiStatus === 'failed' ? (
                          <>
                            <RotateCcw
                              className={cn(
                                'h-3.5 w-3.5',
                                isProcessing && 'animate-spin',
                              )}
                            />
                            Retry
                          </>
                        ) : (
                          <>
                            <Sparkles
                              className={cn(
                                'h-3.5 w-3.5',
                                isProcessing && 'animate-pulse',
                              )}
                            />
                            Process
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleCopy(
                          message.text || message.caption || '',
                          'Text',
                        )
                      }
                      disabled={!message.text && !message.caption}
                      className="gap-1.5"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs Content */}
            <Tabs defaultValue="content" className="flex-1 overflow-hidden">
              <div className="overflow-x-auto border-b px-6">
                <TabsList
                  variant="line"
                  className="h-12 w-full min-w-max justify-start gap-4 bg-transparent p-0"
                >
                  <TabsTrigger
                    value="content"
                    className="h-12 shrink-0 rounded-none px-2 text-sm"
                  >
                    <MessageSquare className="mr-1.5 h-4 w-4" />
                    Content
                  </TabsTrigger>
                  <TabsTrigger
                    value="metadata"
                    className="h-12 shrink-0 rounded-none px-2 text-sm"
                  >
                    <Database className="mr-1.5 h-4 w-4" />
                    Metadata
                  </TabsTrigger>
                  <TabsTrigger
                    value="ai"
                    className="h-12 shrink-0 rounded-none px-2 text-sm"
                  >
                    <Brain className="mr-1.5 h-4 w-4" />
                    AI Insights
                    {extractedData.length > 0 && (
                      <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
                        {extractedData.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="raw"
                    className="h-12 shrink-0 rounded-none px-2 text-sm"
                  >
                    <FileJson className="mr-1.5 h-4 w-4" />
                    Raw
                  </TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="h-[400px]">
                {/* Content Tab */}
                <TabsContent value="content" className="m-0 p-6">
                  {message.quotedMessageId && (
                    <div className="bg-muted/50 mb-4 rounded-r-lg border-l-4 border-violet-500/50 p-3">
                      <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs">
                        <Reply className="h-3 w-3" />
                        Replying to
                      </div>
                      <p className="text-muted-foreground truncate text-sm">
                        Message ID: {message.quotedMessageId}
                      </p>
                    </div>
                  )}

                  {message.text || message.caption ? (
                    <div className="group relative">
                      <div className="absolute -inset-2 rounded-xl bg-linear-to-r from-violet-500/5 to-purple-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="bg-muted/30 relative rounded-xl border p-4">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {message.text || message.caption}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="bg-muted/50 mb-4 rounded-full p-4">
                        <TypeIcon className="text-muted-foreground h-8 w-8" />
                      </div>
                      <p className="text-muted-foreground">
                        This is a {message.messageType} message without text
                        content
                      </p>
                      {message.filename && (
                        <p className="text-muted-foreground mt-2 text-sm">
                          File:{' '}
                          <span className="font-mono">{message.filename}</span>
                        </p>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* Metadata Tab */}
                <TabsContent value="metadata" className="m-0 p-6">
                  <div className="grid grid-cols-2 gap-4">
                    <MetadataCard
                      icon={Hash}
                      label="Message ID"
                      value={message.messageId}
                      mono
                      copyable
                      onCopy={() => handleCopy(message.messageId, 'Message ID')}
                    />
                    <MetadataCard
                      icon={Users}
                      label="Group"
                      value={message.group.name}
                    />
                    <MetadataCard
                      icon={Calendar}
                      label="Timestamp"
                      value={formatDate(message.messageTimestamp)}
                    />
                    <MetadataCard
                      icon={Zap}
                      label="Source"
                      value={
                        <Badge
                          variant="secondary"
                          className={cn(
                            message.source === 'realtime'
                              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
                              : 'border-blue-500/20 bg-blue-500/10 text-blue-600',
                          )}
                        >
                          {message.source === 'realtime'
                            ? 'Real-time'
                            : 'History Sync'}
                        </Badge>
                      }
                    />
                    <MetadataCard
                      icon={User}
                      label="Sender JID"
                      value={message.senderJid}
                      mono
                      copyable
                      onCopy={() => handleCopy(message.senderJid, 'Sender JID')}
                      className="col-span-2"
                    />
                  </div>
                </TabsContent>

                {/* AI Insights Tab */}
                <TabsContent value="ai" className="m-0 p-6">
                  {extractedData.length > 0 ? (
                    <div className="space-y-4">
                      {extractedData.map((extraction, index) => (
                        <div key={extraction.id} className="group relative">
                          <div className="absolute -inset-2 rounded-xl bg-linear-to-r from-violet-500/5 to-purple-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
                          <div className="relative overflow-hidden rounded-xl border">
                            <div className="bg-muted/30 flex items-center justify-between border-b p-3">
                              <div className="flex items-center gap-2">
                                <div className="rounded-lg bg-linear-to-r from-violet-500 to-purple-500 p-1.5">
                                  <Brain className="h-3.5 w-3.5 text-white" />
                                </div>
                                <span className="font-medium capitalize">
                                  {extraction.dataType}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="secondary"
                                  className="font-mono text-xs"
                                >
                                  {Math.round(extraction.confidence * 100)}%
                                  confidence
                                </Badge>
                                {extraction.model && (
                                  <Badge
                                    variant="outline"
                                    className="font-mono text-xs"
                                  >
                                    {extraction.model}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <pre className="bg-muted/10 overflow-x-auto p-4 text-xs">
                              {JSON.stringify(extraction.data, null, 2)}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="mb-4 rounded-full bg-linear-to-r from-violet-500/10 to-purple-500/10 p-4">
                        <Brain className="h-8 w-8 text-violet-500" />
                      </div>
                      <h3 className="mb-1 font-medium">No AI insights yet</h3>
                      <p className="text-muted-foreground mb-4 text-sm">
                        Process this message with AI to extract structured data
                      </p>
                      {message.aiStatus === 'pending' && onProcessAI && (
                        <Button
                          onClick={onProcessAI}
                          disabled={isProcessing}
                          className="bg-linear-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600"
                        >
                          <Sparkles
                            className={cn(
                              'mr-2 h-4 w-4',
                              isProcessing && 'animate-pulse',
                            )}
                          />
                          {isProcessing ? 'Processing...' : 'Process with AI'}
                        </Button>
                      )}
                      {message.aiStatus === 'failed' && (
                        <div className="w-full max-w-md space-y-3">
                          {message.aiError && (
                            <div className="bg-destructive/10 rounded-lg p-3">
                              <p className="text-destructive mb-2 text-xs font-medium">
                                AI Processing Error
                              </p>
                              <pre className="text-destructive/90 max-h-48 overflow-y-auto font-mono text-[10px] wrap-break-word whitespace-pre-wrap">
                                {message.aiError}
                              </pre>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-2 h-6 text-[10px]"
                                onClick={() =>
                                  handleCopy(
                                    message.aiError || '',
                                    'Error details',
                                  )
                                }
                              >
                                <Copy className="mr-1 h-3 w-3" />
                                Copy error
                              </Button>
                            </div>
                          )}
                          {onRetryAI && (
                            <Button
                              variant="outline"
                              onClick={onRetryAI}
                              disabled={isProcessing}
                              className="w-full"
                            >
                              <RotateCcw
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  isProcessing && 'animate-spin',
                                )}
                              />
                              {isProcessing
                                ? 'Retrying...'
                                : 'Retry Processing'}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                {/* Raw Tab */}
                <TabsContent value="raw" className="m-0 p-6">
                  {rawPayload ? (
                    <div className="group relative">
                      <div className="absolute top-2 right-2 z-10">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            handleCopy(
                              JSON.stringify(rawPayload, null, 2),
                              'Raw payload',
                            )
                          }
                        >
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                          Copy
                        </Button>
                      </div>
                      <pre className="bg-muted/30 max-h-80 overflow-x-auto rounded-xl border p-4 text-xs">
                        {JSON.stringify(rawPayload, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="bg-muted/50 mb-4 rounded-full p-4">
                        <FileJson className="text-muted-foreground h-8 w-8" />
                      </div>
                      <p className="text-muted-foreground">
                        Raw payload not available
                      </p>
                    </div>
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </>
        ) : (
          <div className="text-muted-foreground flex h-64 items-center justify-center">
            No message selected
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetadataCard({
  icon: Icon,
  label,
  value,
  mono = false,
  copyable = false,
  onCopy,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  copyable?: boolean;
  onCopy?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('bg-muted/20 group rounded-xl border p-4', className)}>
      <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className={cn('truncate text-sm', mono && 'font-mono text-xs')}>
          {value}
        </p>
        {copyable && onCopy && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onCopy}
            className="opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

function MessageDetailSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
