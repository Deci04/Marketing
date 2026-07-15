import { applyRawLifecycle } from "@/lib/r2-lifecycle";

const days = Number(process.argv[2] ?? "7");
applyRawLifecycle(days)
  .then(() => {
    console.log(`Lifecycle R2 applicata: raw/ expira dopo ${days} giorni.`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("Errore applicando la lifecycle R2:", e);
    process.exit(1);
  });
