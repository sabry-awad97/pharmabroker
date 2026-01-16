/**
 * Session Switcher
 *
 * Dropdown component for quickly switching between WhatsApp sessions.
 * Displayed in the sidebar for easy access.
 */

import type { Session } from '@pharmabroker/schemas/whatsapp';

import {
  Check,
  ChevronDown,
  LogOut,
  Plus,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useWhatsappSessions,
  useCreateWhatsappSession,
} from '@/hooks/whatsapp';
import { cn } from '@/lib/utils';
import { getAvatarUrl } from '@/utils/avatar';
import {
  useActiveSession,
  useActiveSessionActions,
} from '@/stores/active-session.store';

interface SessionSwitcherProps {
  collapsed?: boolean;
}

export function SessionSwitcher({ collapsed = false }: SessionSwitcherProps) {
  const navigate = useNavigate();
  const activeSession = useActiveSession();
  const { setActiveSession, clearActiveSession } = useActiveSessionActions();
  const { data: sessions, isLoading } = useWhatsappSessions();
  const createSession = useCreateWhatsappSession();

  // New session dialog state
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');

  // Get live status from sessions data (activeSession.status may be stale)
  const liveSession = sessions?.find(s => s.id === activeSession?.id);
  const isConnected = liveSession?.status === 'connected';

  const handleSelectSession = (session: Session) => {
    setActiveSession({
      id: session.id,
      name: session.name,
      jid: session.jid,
      status: session.status,
    });
  };

  const handleSwitchProfile = () => {
    clearActiveSession();
    navigate({ to: '/sessions/pick' });
  };

  const handleAddSession = () => {
    setShowNewDialog(true);
  };

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionName.trim()) return;

    createSession.mutate(
      { name: newSessionName.trim() },
      {
        onSuccess: newSession => {
          setShowNewDialog(false);
          setNewSessionName('');
          // Auto-select the new session
          setActiveSession({
            id: newSession.id,
            name: newSession.name,
            jid: newSession.jid,
            status: newSession.status,
          });
        },
      },
    );
  };

  // Get initials
  const initials =
    activeSession?.name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';

  if (!activeSession) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: '/sessions/pick' })}
          className={cn(
            'w-full justify-start gap-2',
            collapsed && 'justify-center px-0',
          )}
        >
          <Plus className="h-4 w-4" />
          {!collapsed && <span className="text-xs">Select Session</span>}
        </Button>

        <NewSessionDialog
          open={showNewDialog}
          onOpenChange={setShowNewDialog}
          name={newSessionName}
          onNameChange={setNewSessionName}
          onSubmit={handleCreateSession}
          isPending={createSession.isPending}
        />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
            collapsed && 'justify-center px-0',
          )}
        >
          <div className="relative">
            <Avatar className="h-7 w-7">
              <AvatarImage
                src={getAvatarUrl(activeSession.jid || activeSession.name)}
                alt={activeSession.name}
              />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            {/* Status indicator */}
            <div
              className={cn(
                'border-background absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2',
                isConnected ? 'bg-emerald-500' : 'bg-slate-400',
              )}
            />
          </div>

          {!collapsed && (
            <>
              <div className="flex-1 text-left">
                <p className="truncate text-xs font-medium">
                  {activeSession.name}
                </p>
              </div>
              <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
            </>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-56">
          <div className="text-muted-foreground px-2 py-1.5 text-xs font-normal">
            Switch Session
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <RefreshCw className="text-muted-foreground h-4 w-4 animate-spin" />
            </div>
          ) : (
            sessions?.map(session => (
              <DropdownMenuItem
                key={session.id}
                onClick={() => handleSelectSession(session)}
                className="flex items-center gap-2"
              >
                <div className="relative">
                  <Avatar className="h-6 w-6">
                    <AvatarImage
                      src={getAvatarUrl(session.jid || session.name)}
                      alt={session.name}
                    />
                    <AvatarFallback className="text-[10px]">
                      {session.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      'border-background absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border',
                      session.status === 'connected'
                        ? 'bg-emerald-500'
                        : 'bg-slate-400',
                    )}
                  />
                </div>

                <div className="flex-1 truncate">
                  <p className="truncate text-xs font-medium">{session.name}</p>
                  <p className="text-muted-foreground flex items-center gap-1 text-[10px]">
                    {session.status === 'connected' ? (
                      <>
                        <Wifi className="h-2.5 w-2.5 text-emerald-500" />
                        Connected
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-2.5 w-2.5" />
                        {session.status}
                      </>
                    )}
                  </p>
                </div>

                {activeSession.id === session.id && (
                  <Check className="h-4 w-4 text-emerald-500" />
                )}
              </DropdownMenuItem>
            ))
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleAddSession}>
            <Plus className="mr-2 h-4 w-4 text-emerald-500" />
            <span className="text-xs">Add Session</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleSwitchProfile}>
            <LogOut className="mr-2 h-4 w-4" />
            <span className="text-xs">Switch Profile</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* New Session Dialog */}
      <NewSessionDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        name={newSessionName}
        onNameChange={setNewSessionName}
        onSubmit={handleCreateSession}
        isPending={createSession.isPending}
      />
    </>
  );
}

/**
 * New Session Dialog Component
 */
function NewSessionDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (name: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Session</DialogTitle>
            <DialogDescription>
              Create a new WhatsApp session to connect another device
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Label htmlFor="new-session-name" className="mb-2 block">
              Session Name
            </Label>
            <Input
              id="new-session-name"
              placeholder="e.g., Business Line, Personal"
              value={name}
              onChange={e => onNameChange(e.target.value)}
              maxLength={100}
              autoFocus
            />
            <p className="text-muted-foreground mt-1.5 text-xs">
              Give your session a memorable name to identify it later
            </p>
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={!name.trim() || isPending}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              {isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Session
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
