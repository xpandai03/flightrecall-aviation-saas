import { Suspense } from "react";
import { Plane } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background via-background to-sky-50/40 px-6">
      <div className="mb-8 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-sm">
          <Plane className="size-4 -rotate-45" />
        </span>
        <span className="text-base font-semibold tracking-tight">
          Flight Recall
        </span>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
