import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="space-y-3">
        <Skeleton className="h-16 w-3/4 rounded-2xl" />
        <Skeleton className="h-16 w-2/3 self-end rounded-2xl" />
        <Skeleton className="h-16 w-3/4 rounded-2xl" />
      </div>
    </div>
  );
}
