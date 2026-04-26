"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [oauthLoading, setOauthLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      toast.error("Couldn't sign up", { description: error.message });
      setLoading(false);
      return;
    }
    // Email confirmation is OFF in project config — user is signed in
    // immediately on success. Smart redirect on / handles next-step routing.
    router.push("/");
    router.refresh();
  };

  const handleGoogle = async () => {
    setOauthLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });
    if (error) {
      toast.error("Couldn't start Google sign-up", {
        description: error.message,
      });
      setOauthLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Start logging preflights.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading || oauthLoading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            disabled={loading || oauthLoading}
          />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={loading || oauthLoading}
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          Create account
        </Button>
      </form>

      <div className="relative text-center text-xs text-muted-foreground">
        <span className="bg-background px-2 relative z-10">or</span>
        <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleGoogle}
        disabled={loading || oauthLoading}
      >
        {oauthLoading && <Loader2 className="size-4 animate-spin" />}
        Continue with Google
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-sky-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
