import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany();
  console.log('All users:', users.map(u => ({ id: u.id, email: u.email, name: u.name })));
  
  const specific = await prisma.user.findUnique({ where: { email: 'brandnew@example.com' }});
  console.log('brandnew@example.com:', specific);
  
  const specific2 = await prisma.user.findUnique({ where: { email: 'newuser@example.com' }});
  console.log('newuser@example.com:', specific2);
  
  await prisma.$disconnect();
}

check().catch(console.error);