import { createFileRoute } from '@tanstack/react-router';
import { Pill } from 'lucide-react';
import { useState } from 'react';

import SignInForm from '@/components/sign-in-form';
import SignUpForm from '@/components/sign-up-form';

export const Route = createFileRoute('/login')({
  component: RouteComponent,
});

function RouteComponent() {
  const [showSignIn, setShowSignIn] = useState(false);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10">
            <Pill className="h-6 w-6 text-emerald-500" />
          </div>
          <h1 className="text-lg font-semibold">PharmaBroker</h1>
          <p className="text-xs text-muted-foreground">Sign in to continue</p>
        </div>

        {/* Form */}
        <div className="rounded-lg border border-border bg-card p-4">
          {showSignIn ? (
            <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
          ) : (
            <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          By continuing, you agree to our Terms and Privacy Policy
        </p>
      </div>
    </div>
  );
}
