"use client";

import { LogOut } from "lucide-react";

export function SignOutButton({
  className,
}: {
  className?: string;
}) {
  return (
    <form action="/auth/logout" method="post" className="contents">
      <button
        type="submit"
        className={
          className ??
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground"
        }
      >
        <LogOut className="size-3.5" />
        Sign out
      </button>
    </form>
  );
}
