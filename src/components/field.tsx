import { CaretDown } from "@phosphor-icons/react/dist/ssr";

const base =
  "h-11 w-full rounded-[12px] border border-border bg-secondary/70 px-3.5 text-sm text-ink outline-none transition placeholder:text-muted-foreground focus:border-ink/30 focus:bg-paper";

export function TextField({
  className,
  ...rest
}: React.ComponentProps<"input">) {
  return <input {...rest} className={`${base} ${className ?? ""}`} />;
}

export function SelectField({
  className,
  children,
  ...rest
}: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        {...rest}
        className={`${base} appearance-none pr-9 ${className ?? ""}`}
      >
        {children}
      </select>
      <CaretDown
        size={15}
        weight="bold"
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
