-- AlterTable
ALTER TABLE "Organization"
ADD COLUMN "workingDays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7]::INTEGER[];

-- AlterTable
ALTER TABLE "Membership"
ADD COLUMN "availableWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7]::INTEGER[];

-- AlterTable
ALTER TABLE "Invite"
ADD COLUMN "availableWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7]::INTEGER[];
