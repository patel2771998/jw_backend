const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('jolly@wellness#', 12);

  const admin = await prisma.user.upsert({
    where: { mobile: '7698725601' },
    update: {},
    create: {
      name: 'Admin User',
      mobile: '7698725601',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });


  console.log('Seed completed:', {
    admin: admin.mobile,
  });
  console.log('Default password for all: password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
