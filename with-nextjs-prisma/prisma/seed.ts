import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const elements = [
  {
    elementName: 'Hydrogen',
    symbol: 'H',
    atomicNumber: 1,
  },
  {
    elementName: 'Helium',
    symbol: 'He',
    atomicNumber: 2,
  },
  {
    elementName: 'Lithium',
    symbol: 'Li',
    atomicNumber: 3,
  },
  {
    elementName: 'Beryllium',
    symbol: 'Be',
    atomicNumber: 4,
  },
  {
    elementName: 'Boron',
    symbol: 'B',
    atomicNumber: 5,
  },
  {
    elementName: 'Carbon',
    symbol: 'C',
    atomicNumber: 6,
  },
  {
    elementName: 'Nitrogen',
    symbol: 'N',
    atomicNumber: 7,
  },
  {
    elementName: 'Oxygen',
    symbol: 'O',
    atomicNumber: 8,
  },
  {
    elementName: 'Fluorine',
    symbol: 'F',
    atomicNumber: 9,
  },

  {
    elementName: 'Neon',
    symbol: 'Ne',
    atomicNumber: 10,
  },
];

async function main() {
  for (const element of elements) {
    await prisma.element.upsert({
      where: { atomicNumber: element.atomicNumber },
      update: {},
      create: element,
    });
  }
}
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
