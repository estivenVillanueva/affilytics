import { Prisma } from "@prisma/client";
import prisma from "../db.server";

export type CreateAffiliateInput = {
  code: string;
  shop: string;
  commissionRate: number;
};

export async function getAffiliates(shop: string) {
  return prisma.affiliate.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
}

export async function findAffiliateByCode(code: string, shop: string) {
  return prisma.affiliate.findFirst({
    where: { code, shop },
  });
}

export async function findAffiliateByCodeExcept(
  code: string,
  shop: string,
  excludeId: string,
) {
  return prisma.affiliate.findFirst({
    where: { code, shop, NOT: { id: excludeId } },
  });
}

export async function findAffiliateById(id: string, shop: string) {
  return prisma.affiliate.findFirst({
    where: { id, shop },
  });
}

export async function createAffiliate({
  code,
  shop,
  commissionRate,
}: CreateAffiliateInput) {
  return prisma.affiliate.create({
    data: {
      code,
      shop,
      commissionRate,
    },
  });
}

export async function updateAffiliate({
  id,
  shop,
  code,
  commissionRate,
}: {
  id: string;
  shop: string;
  code: string;
  commissionRate: number;
}) {
  const existing = await prisma.affiliate.findFirst({
    where: { id, shop },
  });
  if (!existing) {
    return null;
  }
  return prisma.affiliate.update({
    where: { id: existing.id },
    data: { code, commissionRate },
  });
}

export async function deleteAffiliate(id: string, shop: string) {
  return prisma.affiliate.deleteMany({
    where: { id, shop },
  });
}

export function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
