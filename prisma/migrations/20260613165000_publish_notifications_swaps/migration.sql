CREATE TYPE "ShiftStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "SwapRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Organization"
ADD COLUMN "allowShiftSwaps" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowOpenShifts" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Membership"
ADD COLUMN "notifyShiftChanges" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Shift"
ADD COLUMN "status" "ShiftStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "isOpen" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ShiftSwapRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "requesterMembershipId" TEXT NOT NULL,
    "status" "SwapRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftSwapRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShiftSwapRequest_organizationId_status_idx" ON "ShiftSwapRequest"("organizationId", "status");
CREATE INDEX "ShiftSwapRequest_requesterMembershipId_idx" ON "ShiftSwapRequest"("requesterMembershipId");
CREATE INDEX "Shift_organizationId_status_idx" ON "Shift"("organizationId", "status");

ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_shiftId_organizationId_fkey" FOREIGN KEY ("shiftId", "organizationId") REFERENCES "Shift"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_requesterMembershipId_organizationId_fkey" FOREIGN KEY ("requesterMembershipId", "organizationId") REFERENCES "Membership"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
