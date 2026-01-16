/**
 * AI Settings Dialog
 *
 * A beautiful dialog for configuring real-time AI processing settings.
 * Allows users to enable/disable auto-processing and configure filters.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Zap,
  Brain,
  Clock,
  MessageSquare,
  Filter,
  Gauge,
  Settings2,
  Sparkles,
  Activity,
  TrendingUp,
  History,
  Layers,
  Timer,
  ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useAISettings,
  useUpdateAISettings,
  useAutoProcessStats,
} from '@/hooks/ai-settings';

interface AISettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AISettingsDialog({
  open,
  onOpenChange,
}: AISettingsDialogProps) {
  const { data: settings } = useAISettings();
  const { data: stats } = useAutoProcessStats();
  const updateSettings = useUpdateAISettings();

  // Local state for form - Basic settings
  const [autoProcessEnabled, setAutoProcessEnabled] = useState(false);
  const [autoProcessRealtime, setAutoProcessRealtime] = useState(true);
  const [autoProcessHistory, setAutoProcessHistory] = useState(false);
  const [processTextOnly, setProcessTextOnly] = useState(true);
  const [minTextLength, setMinTextLength] = useState(10);
  const [excludeFromMe, setExcludeFromMe] = useState(true);
  const [maxProcessPerMinute, setMaxProcessPerMinute] = useState(10);
  const [maxProcessPerHour, setMaxProcessPerHour] = useState(100);

  // Local state for form - Advanced settings
  const [idleProcessingEnabled, setIdleProcessingEnabled] = useState(false);
  const [idleTimeoutSeconds, setIdleTimeoutSeconds] = useState(30);
  const [idleMaxBatchSize, setIdleMaxBatchSize] = useState(5);
  const [historyParallelEnabled, setHistoryParallelEnabled] = useState(true);
  const [historyParallelCount, setHistoryParallelCount] = useState(3);
  const [historyProcessDelay, setHistoryProcessDelay] = useState(5);
  const [prioritizeLatest, setPrioritizeLatest] = useState(true);

  // Sync local state with fetched settings
  useEffect(() => {
    if (settings) {
      setAutoProcessEnabled(settings.autoProcessEnabled);
      setAutoProcessRealtime(settings.autoProcessRealtime);
      setAutoProcessHistory(settings.autoProcessHistory);
      setProcessTextOnly(settings.processTextOnly);
      setMinTextLength(settings.minTextLength);
      setExcludeFromMe(settings.excludeFromMe);
      setMaxProcessPerMinute(settings.maxProcessPerMinute);
      setMaxProcessPerHour(settings.maxProcessPerHour);
      setIdleProcessingEnabled(settings.idleProcessingEnabled);
      setIdleTimeoutSeconds(settings.idleTimeoutSeconds);
      setIdleMaxBatchSize(settings.idleMaxBatchSize);
      setHistoryParallelEnabled(settings.historyParallelEnabled);
      setHistoryParallelCount(settings.historyParallelCount);
      setHistoryProcessDelay(settings.historyProcessDelay);
      setPrioritizeLatest(settings.prioritizeLatest);
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        autoProcessEnabled,
        autoProcessRealtime,
        autoProcessHistory,
        processTextOnly,
        minTextLength,
        excludeFromMe,
        maxProcessPerMinute,
        maxProcessPerHour,
        idleProcessingEnabled,
        idleTimeoutSeconds,
        idleMaxBatchSize,
        historyParallelEnabled,
        historyParallelCount,
        historyProcessDelay,
        prioritizeLatest,
      });
      toast.success('AI settings saved successfully');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to save settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case 'syncing':
        return 'text-amber-500';
      case 'processing':
        return 'text-blue-500';
      case 'completed':
        return 'text-emerald-500';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
        {/* Header with gradient */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-br from-emerald-500/10 via-teal-500/5 to-transparent" />
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-linear-to-bl from-violet-500/10 to-transparent blur-2xl" />

          <DialogHeader className="relative p-6 pb-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-linear-to-r from-emerald-500 to-teal-500 p-2.5">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg">
                    AI Processing Settings
                  </DialogTitle>
                  <DialogDescription className="mt-0.5">
                    Configure automatic message processing
                  </DialogDescription>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={cn(
                  'gap-1.5',
                  autoProcessEnabled
                    ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-600'
                    : 'border-slate-500/30 bg-slate-500/20 text-slate-500',
                )}
              >
                <Activity
                  className={cn(
                    'h-3 w-3',
                    autoProcessEnabled && 'animate-pulse',
                  )}
                />
                {autoProcessEnabled ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </DialogHeader>
        </div>

        <Tabs defaultValue="general" className="w-full">
          <div className="border-b px-6">
            <TabsList className="h-10 w-full justify-start rounded-none border-none bg-transparent p-0">
              <TabsTrigger
                value="general"
                className="data-[state=active]:border-primary text-muted-foreground data-[state=active]:text-foreground relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 pt-2 pb-3 font-medium shadow-none transition-none data-[state=active]:shadow-none"
              >
                <Settings2 className="mr-2 h-4 w-4" />
                General
              </TabsTrigger>
              <TabsTrigger
                value="advanced"
                className="data-[state=active]:border-primary text-muted-foreground data-[state=active]:text-foreground relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 pt-2 pb-3 font-medium shadow-none transition-none data-[state=active]:shadow-none"
              >
                <Layers className="mr-2 h-4 w-4" />
                Advanced
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="max-h-[55vh]">
            <TabsContent value="general" className="mt-0 p-6 pt-4">
              <div className="space-y-6">
                {/* Stats Panel */}
                {stats && autoProcessEnabled && (
                  <div className="bg-muted/30 grid grid-cols-4 gap-3 rounded-lg border p-3">
                    <div className="text-center">
                      <div className="text-muted-foreground mb-1 flex items-center justify-center gap-1 text-xs">
                        <Clock className="h-3 w-3" />
                        Last Min
                      </div>
                      <p className="text-lg font-semibold">
                        {stats.processedLastMinute}
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground mb-1 flex items-center justify-center gap-1 text-xs">
                        <TrendingUp className="h-3 w-3" />
                        Last Hour
                      </div>
                      <p className="text-lg font-semibold">
                        {stats.processedLastHour}
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground mb-1 flex items-center justify-center gap-1 text-xs">
                        <MessageSquare className="h-3 w-3" />
                        Pending
                      </div>
                      <p className="text-lg font-semibold">
                        {stats.pendingCount}
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground mb-1 flex items-center justify-center gap-1 text-xs">
                        <History
                          className={cn(
                            'h-3 w-3',
                            getSyncStatusColor(stats.historySyncStatus),
                          )}
                        />
                        Sync
                      </div>
                      <p
                        className={cn(
                          'text-sm font-medium capitalize',
                          getSyncStatusColor(stats.historySyncStatus),
                        )}
                      >
                        {stats.historySyncStatus}
                      </p>
                    </div>
                  </div>
                )}

                {/* Main Toggle */}
                <div className="bg-muted/20 flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'rounded-lg p-2',
                        autoProcessEnabled ? 'bg-emerald-500/20' : 'bg-muted',
                      )}
                    >
                      <Brain
                        className={cn(
                          'h-5 w-5',
                          autoProcessEnabled
                            ? 'text-emerald-500'
                            : 'text-muted-foreground',
                        )}
                      />
                    </div>
                    <div>
                      <p className="font-medium">Enable Auto-Processing</p>
                      <p className="text-muted-foreground text-xs">
                        Automatically process incoming messages with AI
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={autoProcessEnabled}
                    onCheckedChange={setAutoProcessEnabled}
                  />
                </div>

                <Separator />

                {/* Source Filters */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Filter className="text-muted-foreground h-4 w-4" />
                    <Label className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      Message Sources
                    </Label>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Real-time Messages
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Process messages as they arrive
                        </p>
                      </div>
                      <Switch
                        checked={autoProcessRealtime}
                        onCheckedChange={setAutoProcessRealtime}
                        disabled={!autoProcessEnabled}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">History Sync</p>
                        <p className="text-muted-foreground text-xs">
                          Process messages from history sync
                        </p>
                      </div>
                      <Switch
                        checked={autoProcessHistory}
                        onCheckedChange={setAutoProcessHistory}
                        disabled={!autoProcessEnabled}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Content Filters */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Settings2 className="text-muted-foreground h-4 w-4" />
                    <Label className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      Content Filters
                    </Label>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Text Messages Only
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Skip media and other message types
                        </p>
                      </div>
                      <Switch
                        checked={processTextOnly}
                        onCheckedChange={setProcessTextOnly}
                        disabled={!autoProcessEnabled}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Exclude My Messages
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Don't process messages you sent
                        </p>
                      </div>
                      <Switch
                        checked={excludeFromMe}
                        onCheckedChange={setExcludeFromMe}
                        disabled={!autoProcessEnabled}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">
                          Minimum Text Length
                        </p>
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs"
                        >
                          {minTextLength} chars
                        </Badge>
                      </div>
                      <Slider
                        value={[minTextLength]}
                        onValueChange={values => {
                          const val = Array.isArray(values)
                            ? values[0]
                            : values;
                          setMinTextLength(val ?? 10);
                        }}
                        min={0}
                        max={100}
                        step={5}
                        disabled={!autoProcessEnabled}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Rate Limits */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Gauge className="text-muted-foreground h-4 w-4" />
                    <Label className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      Rate Limits
                    </Label>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Per Minute</p>
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs"
                        >
                          {maxProcessPerMinute}/min
                        </Badge>
                      </div>
                      <Slider
                        value={[maxProcessPerMinute]}
                        onValueChange={values => {
                          const val = Array.isArray(values)
                            ? values[0]
                            : values;
                          setMaxProcessPerMinute(val ?? 10);
                        }}
                        min={1}
                        max={50}
                        step={1}
                        disabled={!autoProcessEnabled}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Per Hour</p>
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs"
                        >
                          {maxProcessPerHour}/hr
                        </Badge>
                      </div>
                      <Slider
                        value={[maxProcessPerHour]}
                        onValueChange={values => {
                          const val = Array.isArray(values)
                            ? values[0]
                            : values;
                          setMaxProcessPerHour(val ?? 100);
                        }}
                        min={10}
                        max={500}
                        step={10}
                        disabled={!autoProcessEnabled}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="mt-0 p-6 pt-4">
              <div className="space-y-6">
                {/* Idle Processing */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Timer className="text-muted-foreground h-4 w-4" />
                    <Label className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      Idle Processing
                    </Label>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Process pending messages when no real-time messages are
                    incoming
                  </p>

                  <div className="bg-muted/20 space-y-4 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Enable Idle Processing
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Automatically process pending messages during idle
                          time
                        </p>
                      </div>
                      <Switch
                        checked={idleProcessingEnabled}
                        onCheckedChange={setIdleProcessingEnabled}
                        disabled={!autoProcessEnabled}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Idle Timeout</p>
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs"
                        >
                          {idleTimeoutSeconds}s
                        </Badge>
                      </div>
                      <Slider
                        value={[idleTimeoutSeconds]}
                        onValueChange={values => {
                          const val = Array.isArray(values)
                            ? values[0]
                            : values;
                          setIdleTimeoutSeconds(val ?? 30);
                        }}
                        min={5}
                        max={120}
                        step={5}
                        disabled={!autoProcessEnabled || !idleProcessingEnabled}
                        className="w-full"
                      />
                      <p className="text-muted-foreground text-xs">
                        Wait time before processing pending messages
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Batch Size</p>
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs"
                        >
                          {idleMaxBatchSize} msgs
                        </Badge>
                      </div>
                      <Slider
                        value={[idleMaxBatchSize]}
                        onValueChange={values => {
                          const val = Array.isArray(values)
                            ? values[0]
                            : values;
                          setIdleMaxBatchSize(val ?? 5);
                        }}
                        min={1}
                        max={20}
                        step={1}
                        disabled={!autoProcessEnabled || !idleProcessingEnabled}
                        className="w-full"
                      />
                      <p className="text-muted-foreground text-xs">
                        Max messages to process per idle batch
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Priority Settings */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="text-muted-foreground h-4 w-4" />
                    <Label className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      Priority Settings
                    </Label>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        Prioritize Latest Messages
                      </p>
                      <p className="text-muted-foreground text-xs">
                        When a new message arrives during processing, process it
                        first
                      </p>
                    </div>
                    <Switch
                      checked={prioritizeLatest}
                      onCheckedChange={setPrioritizeLatest}
                      disabled={!autoProcessEnabled}
                    />
                  </div>
                </div>

                <Separator />

                {/* History Sync Processing */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <History className="text-muted-foreground h-4 w-4" />
                    <Label className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      History Sync Processing
                    </Label>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Configure how history messages are processed after sync
                    completes
                  </p>

                  <div className="bg-muted/20 space-y-4 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Parallel Processing
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Process multiple history messages simultaneously
                        </p>
                      </div>
                      <Switch
                        checked={historyParallelEnabled}
                        onCheckedChange={setHistoryParallelEnabled}
                        disabled={!autoProcessEnabled || !autoProcessHistory}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Parallel Workers</p>
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs"
                        >
                          {historyParallelCount}
                        </Badge>
                      </div>
                      <Slider
                        value={[historyParallelCount]}
                        onValueChange={values => {
                          const val = Array.isArray(values)
                            ? values[0]
                            : values;
                          setHistoryParallelCount(val ?? 3);
                        }}
                        min={1}
                        max={10}
                        step={1}
                        disabled={
                          !autoProcessEnabled ||
                          !autoProcessHistory ||
                          !historyParallelEnabled
                        }
                        className="w-full"
                      />
                      <p className="text-muted-foreground text-xs">
                        Number of messages to process in parallel
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Processing Delay</p>
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs"
                        >
                          {historyProcessDelay}s
                        </Badge>
                      </div>
                      <Slider
                        value={[historyProcessDelay]}
                        onValueChange={values => {
                          const val = Array.isArray(values)
                            ? values[0]
                            : values;
                          setHistoryProcessDelay(val ?? 5);
                        }}
                        min={0}
                        max={60}
                        step={1}
                        disabled={!autoProcessEnabled || !autoProcessHistory}
                        className="w-full"
                      />
                      <p className="text-muted-foreground text-xs">
                        Wait time after sync completes before processing
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="border-t p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateSettings.isPending}
            className="gap-2 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
          >
            {updateSettings.isPending ? (
              <>
                <Sparkles className="h-4 w-4 animate-pulse" />
                Saving...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
