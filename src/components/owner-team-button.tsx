"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendOwnerTeamRequest, type OwnerTeamRequest } from "./owner-team";

/** A team button for the platform owner while viewing as someone (role, remove, cancel invite). */
export function OwnerTeamButton({
  request,
  children,
  className,
}: {
  request: OwnerTeamRequest;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await sendOwnerTeamRequest(request);
          if ("error" in result) toast.error(result.error);
          else router.refresh();
        })
      }
    >
      {children}
    </Button>
  );
}
