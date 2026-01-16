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
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useAISettings,
  useUpdateAISettings,
  useAutoProcessStats,
  useToggleAutoProcess,
} from '@/hooks/ai-settings';

interface AISettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AISettingsDialog({
  open,
  onOpenChange,
}: AISettingsDialogProps) {
  const { data: settings, isLoading } = useAISettings();
  const { data: stats } = useAutoProcessStats();
  const updateSettings = useUpdateAISettings();
  const toggleAutoProcess = useToggleAutoProcess();

  // Local state for form
  const [autoProcessEnabled, setAutoProcessEnabled] = useState(false);
  const [autoProcessRealtime, setAutoProcessRealtime] = useState(true);
  const [autoProcessHistory, setAutoProcessHistory] = useState(false);
  const [processTextOnly, setProcessTextOnly] = useState(true);
  const [minTextLength, setMinTextLength] = useState(10);
  const [excludeFromMe, setExcludeFromMe] = useState(true);
  const [maxProcessPerMinute, setMaxProcessPerMinute] = useState(10);
  const [maxProcessPerHour, setMaxProcessPerHour] = useState(100);

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
      });
      toast.success('AI settings saved successfully');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to save settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleQuickToggle = async () => {
    try {
      await toggleAutoProcess.mutateAsync();
      toast.success(
        autoProcessEnabled
          ? 'Auto-processing disabled'
          : 'Auto-processing enabled',
      );
    } catch (error) {
      toast.error('Failed to toggle auto-processing');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
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
                    Real-time AI Processing
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

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 p-6 pt-2">
            {/* Stats Panel */}
            {stats && autoProcessEnabled && (
              <div className="bg-muted/30 grid grid-cols-3 gap-3 rounded-lg border p-3">
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
                    Queued
                  </div>
                  <p className="text-lg font-semibold">{stats.queuedCount}</p>
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
                    <p className="text-sm font-medium">Real-time Messages</p>
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
                    <p className="text-sm font-medium">Text Messages Only</p>
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
                    <p className="text-sm font-medium">Exclude My Messages</p>
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
                    <p className="text-sm font-medium">Minimum Text Length</p>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {minTextLength} chars
                    </Badge>
                  </div>
                  <Slider
                    value={[minTextLength]}
                    onValueChange={values => {
                      const val = Array.isArray(values) ? values[0] : values;
                      setMinTextLength(val ?? 10);
                    }}
                    min={0}
                    max={100}
                    step={5}
                    disabled={!autoProcessEnabled}
                    className="w-full"
                  />
                  <p className="text-muted-foreground text-xs">
                    Skip messages shorter than this
                  </p>
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
                    <Badge variant="secondary" className="font-mono text-xs">
                      {maxProcessPerMinute}/min
                    </Badge>
                  </div>
                  <Slider
                    value={[maxProcessPerMinute]}
                    onValueChange={values => {
                      const val = Array.isArray(values) ? values[0] : values;
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
                    <Badge variant="secondary" className="font-mono text-xs">
                      {maxProcessPerHour}/hr
                    </Badge>
                  </div>
                  <Slider
                    value={[maxProcessPerHour]}
                    onValueChange={values => {
                      const val = Array.isArray(values) ? values[0] : values;
                      setMaxProcessPerHour(val ?? 100);
                    }}
                    min={10}
                    max={500}
                    step={10}
                    disabled={!autoProcessEnabled}
                    className="w-full"
                  />
                </div>

                <p className="text-muted-foreground text-xs">
                  Limits prevent API overload and control costs
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>

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
