import { PrismaClient, Role } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const ws = await db.workspace.upsert({
    where: { id: "ws_luca" },
    update: {},
    create: { id: "ws_luca", name: "Luca" },
  });

  const people = [
    { email: "matteodecenzo@gmail.com", name: "Matteo", role: Role.ADMIN },
    // TODO: replace with Luca's real email when known.
    { email: "luca@example.com", name: "Luca", role: Role.COLLABORATOR },
  ];

  for (const p of people) {
    const user = await db.user.upsert({
      where: { email: p.email },
      update: { name: p.name },
      create: { email: p.email, name: p.name },
    });
    await db.membership.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId: ws.id } },
      update: { role: p.role },
      create: { userId: user.id, workspaceId: ws.id, role: p.role },
    });
  }
  console.log("Seeded workspace 'Luca' with Matteo (admin) + Luca.");
}

main().finally(() => db.$disconnect());
