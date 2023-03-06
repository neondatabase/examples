-- CreateTable
CREATE TABLE "Element" (
    "id" TEXT NOT NULL,
    "elementName" TEXT NOT NULL,
    "atomicNumber" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,

    CONSTRAINT "Element_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Element_atomicNumber_key" ON "Element"("atomicNumber");
