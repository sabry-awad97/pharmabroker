/**
 * Message Detail Sheet Component
 *
 * Displays full message details, metadata, and AI extractions.
 */

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Copy,
  Sparkles,
  RotateCcw,
  ExternalLink,
  Clock,
  Users,
  MessageSquare,
  FileJson,
  Brain,
  CheckCircle2,
  XCircle,
  Forward,
  Reply,
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

interface MessageDetailSheetProps {
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

export function MessageDetailSheet({
  open,
  onOpenChange,
  message,
  extractedData = [],
  rawPayload,
  isLoading = false,
  onProcessAI,
  onRetryAI,
  isProcessing = false,
}: MessageDetailSheetProps) {
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
      second: '2-digit',
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Message Details
          </SheetTitle>
          <SheetDescription>
            View message content, metadata, and AI extractions
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <MessageDetailSkeleton />
        ) : message ? (
          <ScrollArea className="h-[calc(100vh-120px)] pr-4">
            <div className="space-y-6 py-4">
              {/* Sender Info */}
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage
                    src={getAvatarUrl(
                      message.senderPushName || message.senderJid,
                    )}
                    alt={message.senderPushName || 'Unknown'}
                  />
                  <AvatarFallback>
                    {getInitials(
                      message.senderPushName || message.senderJid.split('@')[0],
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {message.senderPushName || message.senderJid.split('@')[0]}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {message.senderJid}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {message.isFromMe && (
                      <Badge variant="secondary" className="text-[10px]">
                        You
                      </Badge>
                    )}
                    {message.isForwarded && (
                      <Badge
                        variant="secondary"
                        className="gap-0.5 text-[10px]"
                      >
                        <Forward className="h-2.5 w-2.5" />
                        Forwarded
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleCopy(message.senderJid, 'JID')}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>

              <Separator />

              {/* Message Content */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Content</h4>
                  <MessageTypeBadge type={message.messageType as MessageType} />
                </div>

                {message.quotedMessageId && (
                  <div className="bg-muted/50 border-muted-foreground/30 rounded border-l-2 p-2 text-xs">
                    <div className="text-muted-foreground mb-1 flex items-center gap-1">
                      <Reply className="h-3 w-3" />
                      Reply to message
                    </div>
                    <p className="text-muted-foreground truncate">
                      {message.quotedMessageId}
                    </p>
                  </div>
                )}

                {message.text || message.caption ? (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-sm whitespace-pre-wrap">
                      {message.text || message.caption}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-7 text-xs"
                      onClick={() =>
                        handleCopy(
                          message.text || message.caption || '',
                          'Text',
                        )
                      }
                    >
                      <Copy className="mr-1.5 h-3 w-3" />
                      Copy text
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm italic">
                    No text content (media message)
                  </p>
                )}

                {message.filename && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Filename:</span>
                    <span className="font-mono text-xs">
                      {message.filename}
                    </span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Metadata */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Metadata</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <MetadataItem
                    icon={Clock}
                    label="Timestamp"
                    value={formatDate(message.messageTimestamp)}
                  />
                  <MetadataItem
                    icon={Users}
                    label="Group"
                    value={message.groupName}
                  />
                  <MetadataItem
                    label="Message ID"
                    value={message.messageId}
                    mono
                    copyable
                    onCopy={() => handleCopy(message.messageId, 'Message ID')}
                  />
                  <MetadataItem
                    label="Source"
                    value={
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[10px]',
                          message.source === 'realtime'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-blue-500/10 text-blue-600',
                        )}
                      >
                        {message.source === 'realtime'
                          ? 'Real-time'
                          : 'History Sync'}
                      </Badge>
                    }
                  />
                </div>
              </div>

              <Separator />

              {/* AI Processing */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 text-sm font-medium">
                    <Brain className="h-4 w-4" />
                    AI Processing
                  </h4>
                  <AIStatusBadge
                    status={message.aiStatus as AIStatus}
                    showLabel
                    model={message.aiModel}
                    error={message.aiError}
                  />
                </div>

                {message.aiStatus === 'pending' && onProcessAI && (
                  <Button
                    size="sm"
                    onClick={onProcessAI}
                    disabled={isProcessing}
                    className="w-full"
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

                {message.aiStatus === 'failed' && onRetryAI && (
                  <div className="space-y-2">
                    {message.aiError && (
                      <p className="text-destructive bg-destructive/10 rounded p-2 text-xs">
                        {message.aiError}
                      </p>
                    )}
                    <Button
                      size="sm"
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
                      {isProcessing ? 'Retrying...' : 'Retry Processing'}
                    </Button>
                  </div>
                )}

                {message.aiModel && (
                  <p className="text-muted-foreground text-xs">
                    Processed with{' '}
                    <span className="font-mono">{message.aiModel}</span>
                  </p>
                )}
              </div>

              {/* Extracted Data */}
              {extractedData.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Extracted Data
                    </h4>
                    <Accordion type="multiple" className="w-full">
                      {extractedData.map(extraction => (
                        <AccordionItem
                          key={extraction.id}
                          value={extraction.id}
                        >
                          <AccordionTrigger className="py-2 text-sm">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="capitalize">
                                {extraction.dataType}
                              </Badge>
                              <span className="text-muted-foreground text-xs">
                                {Math.round(extraction.confidence * 100)}%
                                confidence
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <pre className="bg-muted/50 overflow-x-auto rounded p-3 text-xs">
                              {JSON.stringify(extraction.data, null, 2)}
                            </pre>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                </>
              )}

              {/* Raw Payload */}
              {rawPayload && (
                <>
                  <Separator />
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="raw">
                      <AccordionTrigger className="py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <FileJson className="h-4 w-4" />
                          Raw Payload
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <pre className="bg-muted/50 max-h-64 overflow-x-auto rounded p-3 text-xs">
                          {JSON.stringify(rawPayload, null, 2)}
                        </pre>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-7 text-xs"
                          onClick={() =>
                            handleCopy(
                              JSON.stringify(rawPayload, null, 2),
                              'Raw payload',
                            )
                          }
                        >
                          <Copy className="mr-1.5 h-3 w-3" />
                          Copy JSON
                        </Button>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-muted-foreground flex h-64 items-center justify-center">
            No message selected
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MetadataItem({
  icon: Icon,
  label,
  value,
  mono = false,
  copyable = false,
  onCopy,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  copyable?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground flex items-center gap-1 text-xs">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <div className="flex items-center gap-1">
        <p className={cn('truncate text-xs', mono && 'font-mono')}>{value}</p>
        {copyable && onCopy && (
          <Button variant="ghost" size="icon-xs" onClick={onCopy}>
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

function MessageDetailSkeleton() {
  return (
    <div className="space-y-6 py-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <Separator />
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Separator />
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}
