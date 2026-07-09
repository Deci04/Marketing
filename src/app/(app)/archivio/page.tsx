import { redirect } from "next/navigation";

// Archivio è stato fuso in Contenuti (filtro "Pubblicati"). Manteniamo la rotta
// come redirect per eventuali link salvati.
export default function ArchivioRedirect() {
  redirect("/contenuti?stato=pubblicati");
}
