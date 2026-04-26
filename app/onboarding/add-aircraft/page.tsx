"use client";

import { useRouter } from "next/navigation";
import { Plane } from "lucide-react";
import { AddAircraftForm } from "@/components/aircraft/add-aircraft-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import type { Aircraft } from "@/lib/types/database";

export default function OnboardingAddAircraftPage() {
  const router = useRouter();

  const handleCreated = (aircraft: Aircraft) => {
    router.push(`/aircraft/${aircraft.id}/dashboard`);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-sky-50/40 px-6 py-12">
      <div className="mx-auto max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-sm">
              <Plane className="size-4 -rotate-45" />
            </span>
            <span className="text-base font-semibold tracking-tight">
              Flight Recall
            </span>
          </div>
          <SignOutButton className="text-xs text-muted-foreground hover:text-foreground" />
        </div>

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Add your first aircraft
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            One quick step before you log a preflight.
          </p>
        </div>

        <AddAircraftForm
          onCreated={handleCreated}
          autoFocus
          ctaLabel="Continue"
        />
      </div>
    </div>
  );
}
