import Image from "next/image";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background via-background to-sky-50/40 px-6">
      <div className="mb-8 flex items-center justify-center">
        <Image
          src="/flight-recall-logo.png"
          alt="Flight Recall"
          width={240}
          height={192}
          priority
          className="h-32 sm:h-40 w-auto"
        />
      </div>
      <SignupForm />
    </div>
  );
}
