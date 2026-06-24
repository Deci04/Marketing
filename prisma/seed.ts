import { PrismaClient, Role } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const ws = await db.workspace.upsert({
    where: { id: "ws_luca" },
    update: {},
    create: { id: "ws_luca", name: "Luca" },
  });

  // Matteo is the super-admin: he sees /admin and invites collaborators by
  // email into each workspace. Other users are added via the invite flow, not
  // the seed.
  const matteo = await db.user.upsert({
    where: { email: "matteodecenzo@gmail.com" },
    update: { name: "Matteo", isAdmin: true },
    create: { email: "matteodecenzo@gmail.com", name: "Matteo", isAdmin: true },
  });
  await db.membership.upsert({
    where: { userId_workspaceId: { userId: matteo.id, workspaceId: ws.id } },
    update: { role: Role.ADMIN },
    create: { userId: matteo.id, workspaceId: ws.id, role: Role.ADMIN },
  });
  console.log("Seeded workspace 'Luca' with Matteo (super-admin). Invite others from /admin.");
}

main().finally(() => db.$disconnect());
