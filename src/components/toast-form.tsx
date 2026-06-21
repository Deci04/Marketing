"use client";

import { useRef } from "react";
import { toast } from "sonner";

export function ToastForm({
  action,
  success,
  resetOnSuccess = false,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<void> | void;
  success: string;
  resetOnSuccess?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      className={className}
      action={async (fd) => {
        await action(fd);
        toast.success(success);
        if (resetOnSuccess) ref.current?.reset();
      }}
    >
      {children}
    </form>
  );
}
