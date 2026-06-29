import { Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-40 rounded-full" />
      </div>
      <Skeleton className="h-5 w-72" />
      <Skeleton className="h-[28rem] w-full" />
    </div>
  );
}
