import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function safeNumber(value: number | null | undefined) {
  return value ?? 0;
}

type DateRange = "today" | "7d" | "30d";

function getDateRange(value: string | null): DateRange {
  if (value === "today" || value === "7d" || value === "30d") {
    return value;
  }
  return "30d";
}

function getRangeStartDate(range: DateRange): Date {
  const now = new Date();
  if (range === "today") {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    return startOfDay;
  }

  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const range = getDateRange(url.searchParams.get("range"));
  const startDate = getRangeStartDate(range);
  const where = { shop: session.shop, createdAt: { gte: startDate } };

  const [
    aggregates,
    referralCount,
    shopResponse,
    affiliates,
    referralByAffiliate,
    referralByCampaign,
  ] = await Promise.all([
    prisma.referral.aggregate({
      where,
      _sum: {
        orderAmount: true,
        appServiceFeeAmount: true,
        affiliatePayoutAmount: true,
      },
    }),
    prisma.referral.count({
      where,
    }),
    admin.graphql(
      `#graphql
        query ShopCurrency {
          shop {
            currencyCode
          }
        }`,
    ),
    prisma.affiliate.findMany({
      where: { shop: session.shop },
      select: { id: true, code: true, commissionRate: true },
      orderBy: { code: "asc" },
    }),
    prisma.referral.groupBy({
      by: ["affiliateId"],
      where,
      _sum: {
        orderAmount: true,
        affiliatePayoutAmount: true,
        appServiceFeeAmount: true,
      },
      _count: { id: true },
    }),
    prisma.referral.groupBy({
      by: ["campaignId"],
      where: {
        ...where,
        campaignId: { not: null },
      },
      _sum: {
        orderAmount: true,
        affiliatePayoutAmount: true,
      },
      _count: { id: true },
    }),
  ]);

  const shopJson = await shopResponse.json();
  const currencyCode = shopJson?.data?.shop?.currencyCode ?? "USD";

  const totalReferredSales = safeNumber(aggregates._sum.orderAmount);
  const totalAppCommissions = safeNumber(aggregates._sum.appServiceFeeAmount);
  const totalAffiliateCommissions = safeNumber(
    aggregates._sum.affiliatePayoutAmount,
  );

  const statsByAffiliateId = new Map(
    referralByAffiliate.map((row) => [
      row.affiliateId,
      {
        totalSales: safeNumber(row._sum.orderAmount),
        totalPayout: safeNumber(row._sum.affiliatePayoutAmount),
        totalAppFee: safeNumber(row._sum.appServiceFeeAmount),
        referralCount: row._count.id,
      },
    ]),
  );

  const affiliateStats = affiliates.map((a) => {
    const s = statsByAffiliateId.get(a.id);
    return {
      affiliateId: a.id,
      code: a.code,
      commissionRate: a.commissionRate,
      totalSales: s?.totalSales ?? 0,
      totalPayout: s?.totalPayout ?? 0,
      totalAppFee: s?.totalAppFee ?? 0,
      referralCount: s?.referralCount ?? 0,
    };
  });

  const campaignIds = referralByCampaign
    .map((row) => row.campaignId)
    .filter((id): id is string => id != null);

  const campaignsForStats =
    campaignIds.length > 0
      ? await prisma.campaign.findMany({
          where: { shop: session.shop, id: { in: campaignIds } },
          select: {
            id: true,
            name: true,
            slug: true,
            affiliate: { select: { code: true } },
          },
        })
      : [];

  const campaignById = new Map(campaignsForStats.map((c) => [c.id, c]));

  const campaignStats = referralByCampaign
    .filter((row): row is (typeof row & { campaignId: string }) => row.campaignId != null)
    .map((row) => {
      const c = campaignById.get(row.campaignId);
      return {
        campaignId: row.campaignId,
        campaignName: c?.name ?? "—",
        campaignSlug: c?.slug ?? "—",
        affiliateCode: c?.affiliate.code ?? "—",
        totalSales: safeNumber(row._sum.orderAmount),
        totalPayout: safeNumber(row._sum.affiliatePayoutAmount),
        referralCount: row._count.id,
      };
    })
    .sort((a, b) => a.campaignName.localeCompare(b.campaignName));

  const hasCampaignReferrals = campaignStats.length > 0;

  return {
    hasReferrals: referralCount > 0,
    totalReferredSales,
    totalAppCommissions,
    totalAffiliateCommissions,
    currencyCode,
    range,
    affiliateStats,
    campaignStats,
    hasCampaignReferrals,
  };
};

export default function Index() {
  const {
    hasReferrals,
    totalReferredSales,
    totalAppCommissions,
    totalAffiliateCommissions,
    currencyCode,
    range,
    affiliateStats,
    campaignStats,
    hasCampaignReferrals,
  } = useLoaderData<typeof loader>();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("es", {
      style: "currency",
      currency: currencyCode,
    }).format(value);

  const formatBreakdownMoney = (value: number) =>
    `${value.toFixed(2)} US$`;

  const periodButtons: { label: string; range: DateRange }[] = [
    { label: "Hoy", range: "today" },
    { label: "7 días", range: "7d" },
    { label: "30 días", range: "30d" },
  ];

  return (
    <Page
      title="Resumen"
      subtitle="Ventas referidas, tarifa de infraestructura y comisiones de afiliados."
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingSm" as="h3">
                Periodo
              </Text>
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodySm" as="p" tone="subdued">
                  Selecciona el rango para actualizar métricas
                </Text>
                <ButtonGroup>
                  {periodButtons.map((option) => (
                    <Button
                      key={option.range}
                      url={`/app?range=${option.range}`}
                      pressed={range === option.range}
                      variant={range === option.range ? "primary" : "secondary"}
                    >
                      {option.label}
                    </Button>
                  ))}
                </ButtonGroup>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="400">
            <Layout>
              <Layout.Section variant="oneThird">
                <Card>
                  <div style={{ borderTop: "4px solid #008060", borderRadius: 8 }}>
                    <Box borderWidth="050" borderRadius="200" padding="400">
                      <BlockStack gap="150">
                        <Text variant="bodySm" tone="subdued" as="p">
                          Ventas referidas
                        </Text>
                        <Text variant="heading2xl" as="p">
                          {formatCurrency(totalReferredSales)}
                        </Text>
                        <Text variant="bodyMd" tone="subdued" as="p">
                          Total de pedidos atribuidos
                        </Text>
                      </BlockStack>
                    </Box>
                  </div>
                </Card>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <Card>
                  <div style={{ borderTop: "4px solid #5C6AC4", borderRadius: 8 }}>
                    <Box borderWidth="050" borderRadius="200" padding="400">
                      <BlockStack gap="150">
                        <Text variant="bodySm" tone="subdued" as="p">
                          Tarifa App (5%)
                        </Text>
                        <Text variant="heading2xl" as="p">
                          {formatCurrency(totalAppCommissions)}
                        </Text>
                        <Text variant="bodyMd" tone="subdued" as="p">
                          Uso de infraestructura facturado
                        </Text>
                      </BlockStack>
                    </Box>
                  </div>
                </Card>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <Card>
                  <div style={{ borderTop: "4px solid #006FBB", borderRadius: 8 }}>
                    <Box borderWidth="050" borderRadius="200" padding="400">
                      <BlockStack gap="150">
                        <Text variant="bodySm" tone="subdued" as="p">
                          A pagar afiliados
                        </Text>
                        <Text variant="heading2xl" as="p">
                          {formatCurrency(totalAffiliateCommissions)}
                        </Text>
                        <Text variant="bodyMd" tone="subdued" as="p">
                          Según porcentaje de comisión
                        </Text>
                      </BlockStack>
                    </Box>
                  </div>
                </Card>
              </Layout.Section>
            </Layout>

            <Card>
              <Box padding="400">
                <Text variant="headingMd" as="h3">
                  Desglose por afiliado
                </Text>
                <Box paddingBlockStart="300">
                  {!hasReferrals ? (
                    <EmptyState
                      heading="Sin ventas referidas en este periodo"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>
                        Cambia el rango de fechas o comparte enlaces con{" "}
                        <code>?ref=</code> para ver resultados aquí.
                      </p>
                    </EmptyState>
                  ) : (
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            style={{
                              padding: 12,
                              textAlign: "left",
                              borderBottom: "1px solid #e1e3e5",
                              fontWeight: 600,
                            }}
                          >
                            Afiliado
                          </th>
                          <th
                            style={{
                              padding: 12,
                              textAlign: "left",
                              borderBottom: "1px solid #e1e3e5",
                              fontWeight: 600,
                            }}
                          >
                            Código
                          </th>
                          <th
                            style={{
                              padding: 12,
                              textAlign: "left",
                              borderBottom: "1px solid #e1e3e5",
                              fontWeight: 600,
                            }}
                          >
                            Comisión (%)
                          </th>
                          <th
                            style={{
                              padding: 12,
                              textAlign: "left",
                              borderBottom: "1px solid #e1e3e5",
                              fontWeight: 600,
                            }}
                          >
                            Ventas referidas
                          </th>
                          <th
                            style={{
                              padding: 12,
                              textAlign: "left",
                              borderBottom: "1px solid #e1e3e5",
                              fontWeight: 600,
                            }}
                          >
                            A pagar
                          </th>
                          <th
                            style={{
                              padding: 12,
                              textAlign: "left",
                              borderBottom: "1px solid #e1e3e5",
                              fontWeight: 600,
                            }}
                          >
                            Pedidos
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {affiliateStats.map((row) => (
                          <tr key={row.affiliateId}>
                            <td
                              style={{
                                padding: 12,
                                borderBottom: "1px solid #e1e3e5",
                                verticalAlign: "middle",
                              }}
                            >
                              {row.code}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                borderBottom: "1px solid #e1e3e5",
                                verticalAlign: "middle",
                              }}
                            >
                              {row.code}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                borderBottom: "1px solid #e1e3e5",
                                verticalAlign: "middle",
                              }}
                            >
                              {row.commissionRate}%
                            </td>
                            <td
                              style={{
                                padding: 12,
                                borderBottom: "1px solid #e1e3e5",
                                verticalAlign: "middle",
                              }}
                            >
                              {formatBreakdownMoney(row.totalSales)}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                borderBottom: "1px solid #e1e3e5",
                                verticalAlign: "middle",
                              }}
                            >
                              {formatBreakdownMoney(row.totalPayout)}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                borderBottom: "1px solid #e1e3e5",
                                verticalAlign: "middle",
                              }}
                            >
                              {row.referralCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Box>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <Text variant="headingMd" as="h3">
                  Desglose por campaña
                </Text>
                <Box paddingBlockStart="300">
                  {!hasCampaignReferrals ? (
                    <EmptyState
                      heading="Sin ventas por campaña en este periodo"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>
                        Aquí verás ventas atribuidas a campañas cuando los enlaces incluyan{" "}
                        <code>&c=</code> y el checkout guarde la campaña en el referral.
                      </p>
                    </EmptyState>
                  ) : (
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            style={{
                              padding: 12,
                              textAlign: "left",
                              borderBottom: "1px solid #e1e3e5",
                              fontWeight: 600,
                            }}
                          >
                            Campaña
                          </th>
                          <th
                            style={{
                              padding: 12,
                              textAlign: "left",
                              borderBottom: "1px solid #e1e3e5",
                              fontWeight: 600,
                            }}
                          >
                            Slug
                          </th>
                          <th
                            style={{
                              padding: 12,
                              textAlign: "left",
                              borderBottom: "1px solid #e1e3e5",
                              fontWeight: 600,
                            }}
                          >
                            Afiliado
                          </th>
                          <th
                            style={{
                              padding: 12,
                              textAlign: "left",
                              borderBottom: "1px solid #e1e3e5",
                              fontWeight: 600,
                            }}
                          >
                            Ventas referidas
                          </th>
                          <th
                            style={{
                              padding: 12,
                              textAlign: "left",
                              borderBottom: "1px solid #e1e3e5",
                              fontWeight: 600,
                            }}
                          >
                            A pagar
                          </th>
                          <th
                            style={{
                              padding: 12,
                              textAlign: "left",
                              borderBottom: "1px solid #e1e3e5",
                              fontWeight: 600,
                            }}
                          >
                            Pedidos
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignStats.map((row) => (
                          <tr key={row.campaignId}>
                            <td
                              style={{
                                padding: 12,
                                borderBottom: "1px solid #e1e3e5",
                                verticalAlign: "middle",
                              }}
                            >
                              {row.campaignName}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                borderBottom: "1px solid #e1e3e5",
                                verticalAlign: "middle",
                              }}
                            >
                              {row.campaignSlug}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                borderBottom: "1px solid #e1e3e5",
                                verticalAlign: "middle",
                              }}
                            >
                              {row.affiliateCode}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                borderBottom: "1px solid #e1e3e5",
                                verticalAlign: "middle",
                              }}
                            >
                              {formatBreakdownMoney(row.totalSales)}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                borderBottom: "1px solid #e1e3e5",
                                verticalAlign: "middle",
                              }}
                            >
                              {formatBreakdownMoney(row.totalPayout)}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                borderBottom: "1px solid #e1e3e5",
                                verticalAlign: "middle",
                              }}
                            >
                              {row.referralCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Box>
              </Box>
            </Card>

            {!hasReferrals ? (
              <Card>
                <EmptyState
                  heading="Aún no hay conversiones"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{ content: "Crear afiliado", url: "/app/affiliates" }}
                >
                  <p>
                    Cuando una compra llegue con un enlace <code>?ref=</code>, verás
                    aquí las métricas de ventas y comisiones.
                  </p>
                </EmptyState>
              </Card>
            ) : null}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
