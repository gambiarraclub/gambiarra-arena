import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');

  // Clean existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.vote.deleteMany();
  await prisma.metrics.deleteMany();
  await prisma.participant.deleteMany();
  await prisma.round.deleteMany();
  await prisma.session.deleteMany();

  // Create test session with PIN 123456
  const pin = '123456';
  const pinHash = await bcrypt.hash(pin, 10);

  const session = await prisma.session.create({
    data: {
      pinHash,
      status: 'active',
    },
  });

  console.log(`✅ Session created: ${session.id}`);
  console.log(`🔑 PIN: ${pin}`);

  // Create test round
  const round = await prisma.round.create({
    data: {
      sessionId: session.id,
      index: 1,
      prompt: 'Escreva um galope a beira mar.',
      maxTokens: 400,
      temperature: 0.8,
      deadlineMs: 90000,
      seed: 1234,
    },
  });

  console.log(`📝 Round created: Round ${round.index}`);
  console.log(`   Prompt: ${round.prompt}`);

  console.log('\n✨ Seed completed!');
  console.log(`
📋 Próximos passos:

1. Inicie o servidor:
   pnpm dev

2. Inicie a rodada (em outro terminal):
   curl -X POST http://localhost:3000/rounds/start \\
     -H "Content-Type: application/json" \\
     -d '{"roundId":"${round.id}"}'

3. Conecte clientes simulados:
   pnpm simulate

4. Ou conecte um cliente real:
   cd client && pnpm dev \\
     --url ws://localhost:3000/ws \\
     --pin ${pin} \\
     --participant-id seu-id \\
     --nickname "Seu Nome" \\
     --runner mock

🌐 Arena: http://localhost:5173
🗳️  Votação: http://localhost:5173/voting
📊 Placar: http://localhost:5173/scoreboard
⚙️  Admin: http://localhost:5173/admin
`);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
