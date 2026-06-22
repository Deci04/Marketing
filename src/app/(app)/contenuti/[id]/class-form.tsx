"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClassSelect, type SelectableClass } from "@/components/class-select";
import { setContentClassesAction } from "../actions";

export function ContentClassForm({
  contentId,
  allClasses,
  selected,
}: {
  contentId: string;
  allClasses: SelectableClass[];
  selected: string[];
}) {
  const router = useRouter();
  return (
    <form
      action={async (fd) => {
        await setContentClassesAction(fd);
        toast.success("Classi aggiornate");
        router.refresh();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="contentId" value={contentId} />
      <ClassSelect classes={allClasses} defaultSelected={selected} />
      <button className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Salva classi
      </button>
    </form>
  );
}
