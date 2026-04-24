import { Prisma } from "@prisma/client";
import prisma from "../db.server";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeCampaignSlug(input: string) {
  return input.trim().toLowerCase();
}

export function isValidCampaignSlug(slug: string) {
  return slug.length >= 1 && slug.length <= 64 && SLUG_PATTERN.test(slug);
}

export async function getCampaigns(shop: string) {
  return prisma.campaign.findMany({
    where: { shop },
    include: { affiliate: { select: { id: true, code: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function findCampaignById(id: string, shop: string) {
  return prisma.campaign.findFirst({
    where: { id, shop },
    include: { affiliate: { select: { id: true, code: true } } },
  });
}

export async function findCampaignBySlug(slug: string, shop: string) {
  const normalized = normalizeCampaignSlug(slug);
  return prisma.campaign.findFirst({
    where: { shop, slug: normalized, active: true },
    include: { affiliate: { select: { id: true, code: true } } },
  });
}

/** Slug reservado aunque la campaña esté inactiva. */
export async function findCampaignBySlugAny(slug: string, shop: string) {
  const normalized = normalizeCampaignSlug(slug);
  return prisma.campaign.findFirst({
    where: { shop, slug: normalized },
  });
}

export async function findCampaignBySlugExcept(
  slug: string,
  shop: string,
  excludeId: string,
) {
  const normalized = normalizeCampaignSlug(slug);
  return prisma.campaign.findFirst({
    where: {
      shop,
      slug: normalized,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
}

export type CreateCampaignInput = {
  shop: string;
  name: string;
  slug: string;
  affiliateId: string;
};

export async function createCampaign({
  shop,
  name,
  slug,
  affiliateId,
}: CreateCampaignInput) {
  const normalized = normalizeCampaignSlug(slug);
  return prisma.campaign.create({
    data: {
      shop,
      name: name.trim(),
      slug: normalized,
      affiliateId,
    },
  });
}

export async function updateCampaign({
  id,
  shop,
  name,
  slug,
  affiliateId,
  active,
}: {
  id: string;
  shop: string;
  name: string;
  slug: string;
  affiliateId: string;
  active: boolean;
}) {
  const existing = await prisma.campaign.findFirst({ where: { id, shop } });
  if (!existing) {
    return null;
  }
  const normalized = normalizeCampaignSlug(slug);
  return prisma.campaign.update({
    where: { id: existing.id },
    data: {
      name: name.trim(),
      slug: normalized,
      affiliateId,
      active,
    },
  });
}

export async function deleteCampaign(id: string, shop: string) {
  return prisma.campaign.deleteMany({
    where: { id, shop },
  });
}

export function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
