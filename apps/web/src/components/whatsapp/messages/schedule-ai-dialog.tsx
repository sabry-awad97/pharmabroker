/**
 * Schedule AI Processing Dialog
 *
 * A beautiful dialog for scheduling AI processing of messages.
 * Features date/time picker, priority selection, and visual feedback.
 */

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Clock,
  Calendar as CalendarIcon,
  Sparkles,
  Zap,
  Timer,
  MessageSquare,
  Brain,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useScheduleAI } from '@/hooks/whatsapp-messages';

interface ScheduleAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageIds: string[];
  onSuccess?: () => void;
}

const QUICK_SCHEDULE_OPTIONS = [
  { label: 'In 15 minutes', minutes: 15, icon: Timer },
  { label: 'In 1 hour', minutes: 60, icon: Clock },
  { label: 'In 3 hours', minutes: 180, icon: Clock },
  { label: 'Tomorrow 9 AM', preset: 'tomorrow9am', icon: CalendarIcon },
] as const;

const PRIORITY_LABELS = [
  { value: 0, label: 'Low', color: 'text-muted-foreground' },
  { value: 3, label: 'Normal', color: 'text-blue-500' },
  { value: 5, label: 'Medium', color: 'text-amber-500' },
  { value: 7, label: 'High', color: 'text-orange-500' },
  { value: 10, label: 'Urgent', color: 'text-red-500' },
];

function getPriorityLabel(value: number) {
  const priority = PRIORITY_LABELS.reduce((prev, curr) =>
    Math.abs(curr.value - value) < Math.abs(prev.value - value) ? curr : prev,
  );
  return priority;
}

export function ScheduleAIDialog({
  open,
  onOpenChange,
  messageIds,
  onSuccess,
}: ScheduleAIDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>('09:00');
  const [priority, setPriority] = useState<number>(3);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const scheduleAI = useScheduleAI();

  const scheduledDateTime = useMemo(() => {
    if (!selectedDate) return null;
    const [hours, minutes] = selectedTime.split(':').map(Number);
    const date = new Date(selectedDate);
    date.setHours(hours, minutes, 0, 0);
    return date;
  }, [selectedDate, selectedTime]);

  const isValidSchedule = scheduledDateTime && scheduledDateTime > new Date();

  const handleQuickSchedule = (
    option: (typeof QUICK_SCHEDULE_OPTIONS)[number],
  ) => {
    const now = new Date();
    let date: Date;

    if ('minutes' in option) {
      date = new Date(now.getTime() + option.minutes * 60 * 1000);
    } else if (option.preset === 'tomorrow9am') {
      date = new Date(now);
      date.setDate(date.getDate() + 1);
      date.setHours(9, 0, 0, 0);
    } else {
      return;
    }

    setSelectedDate(date);
    setSelectedTime(
      `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`,
    );
  };

  const handleSchedule = async () => {
    if (!scheduledDateTime || messageIds.length === 0) return;

    try {
      const result = await scheduleAI.mutateAsync({
        messageIds,
        scheduledFor: scheduledDateTime,
        priority,
      });

      toast.success(
        `Scheduled ${result.scheduled} message${result.scheduled !== 1 ? 's' : ''} for AI processing`,
        {
          description: `Processing will start at ${scheduledDateTime.toLocaleString()}`,
        },
      );

      onOpenChange(false);
      onSuccess?.();

      // Reset state
      setSelectedDate(undefined);
      setSelectedTime('09:00');
      setPriority(3);
    } catch (error) {
      toast.error('Failed to schedule AI processing', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const priorityInfo = getPriorityLabel(priority);

  // Generate time options
  const timeOptions = useMemo(() => {
    const options: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        options.push(
          `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`,
        );
      }
    }
    return options;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        {/* Header with gradient */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-br from-violet-500/10 via-purple-500/5 to-transparent" />
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-linear-to-bl from-emerald-500/10 to-transparent blur-2xl" />

          <DialogHeader className="relative p-6 pb-4">
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-xl bg-linear-to-r from-violet-500 to-purple-500 p-2.5">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-lg">
                  Schedule AI Processing
                </DialogTitle>
                <DialogDescription className="mt-0.5">
                  Choose when to process {messageIds.length} message
                  {messageIds.length !== 1 ? 's' : ''} with AI
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-6 p-6 pt-2">
          {/* Quick Schedule Options */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Quick Schedule
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_SCHEDULE_OPTIONS.map(option => {
                const Icon = option.icon;
                return (
                  <Button
                    key={option.label}
                    variant="outline"
                    size="sm"
                    className="h-auto justify-start gap-2 px-3 py-2.5"
                    onClick={() => handleQuickSchedule(option)}
                  >
                    <Icon className="text-muted-foreground h-4 w-4" />
                    <span className="text-xs">{option.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Custom Date/Time */}
          <div className="space-y-3">
            <Label className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Custom Schedule
            </Label>
            <div className="flex gap-2">
              {/* Date Picker */}
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger>
                  <Button
                    variant="outline"
                    className={cn(
                      'flex-1 justify-start gap-2 text-left font-normal',
                      !selectedDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    {selectedDate ? (
                      selectedDate.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={date => {
                      setSelectedDate(date);
                      setCalendarOpen(false);
                    }}
                    disabled={date =>
                      date < new Date(new Date().setHours(0, 0, 0, 0))
                    }
                  />
                </PopoverContent>
              </Popover>

              {/* Time Picker */}
              <Select
                value={selectedTime}
                onValueChange={value => value && setSelectedTime(value)}
              >
                <SelectTrigger className="w-28">
                  <Clock className="text-muted-foreground mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(time => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Priority Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Priority
              </Label>
              <Badge
                variant="secondary"
                className={cn('text-xs font-medium', priorityInfo.color)}
              >
                {priorityInfo.label}
              </Badge>
            </div>
            <div className="px-1">
              <Slider
                value={[priority]}
                onValueChange={values => {
                  const val = Array.isArray(values) ? values[0] : values;
                  setPriority(val ?? 0);
                }}
                max={10}
                step={1}
                className="w-full"
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Higher priority messages are processed first when multiple are
              scheduled.
            </p>
          </div>

          {/* Preview */}
          {scheduledDateTime && (
            <div className="bg-muted/30 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-linear-to-r from-violet-500/20 to-purple-500/20 p-2">
                  <Brain className="h-4 w-4 text-violet-500" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">Processing Preview</p>
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    <MessageSquare className="h-3 w-3" />
                    <span>
                      {messageIds.length} message
                      {messageIds.length !== 1 ? 's' : ''}
                    </span>
                    <ChevronRight className="h-3 w-3" />
                    <CalendarIcon className="h-3 w-3" />
                    <span>
                      {scheduledDateTime.toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
                {!isValidSchedule && (
                  <Badge variant="destructive" className="text-xs">
                    Past time
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={!isValidSchedule || scheduleAI.isPending}
            className="gap-2 bg-linear-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600"
          >
            {scheduleAI.isPending ? (
              <>
                <Sparkles className="h-4 w-4 animate-pulse" />
                Scheduling...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Schedule Processing
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
