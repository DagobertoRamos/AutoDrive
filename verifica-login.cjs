const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'admin@easycar.com' }
  });

  console.log({
    email: user?.email,
    status: user?.status,
    role: user?.role,
    temPasswordHash: !!user?.passwordHash
  });

  const senhaConfere = await bcrypt.compare('Admin@123', user?.passwordHash || '');
  console.log('senha confere:', senhaConfere);
}

main()
  .catch((error) => {
    console.error(error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
