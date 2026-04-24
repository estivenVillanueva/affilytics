import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useFetcher, useLoaderData } from "react-router";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Link,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useMemo, useState } from "react";
import prisma from "../db.server";
import {
  createCampaign,
  deleteCampaign,
  findCampaignBySlugAny,
  getCampaigns,
  isUniqueConstraintError,
  isValidCampaignSlug,
  normalizeCampaignSlug,
} from "../models/campaign.server";
import { findAffiliateById, getAffiliates } from "../models/affiliate.server";
import { authenticate } from "../shopify.server";

type LoaderData = {
  campaigns: Awaited<ReturnType<typeof getCampaigns>>;
  affiliates: Awaited<ReturnType<typeof getAffiliates>>;
  storefrontOrigin: string | null;
  shopDomain: string;
};

async function fetchStorefrontOrigin(
  admin: { graphql: (q: string) => Promise<Response> },
): Promise<string | null> {
  try {
    const response = await admin.graphql(`#graphql
      query CampaignShopStorefront {
        shop {
          primaryDomain {
            url
          }
        }
      }
    `);
    const json = (await response.json()) as {
      data?: { shop?: { primaryDomain?: { url?: string | null } | null } };
    };
    const url = json?.data?.shop?.primaryDomain?.url;
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      return url.replace(/\/$/, "");
    }
  } catch {
    return null;
  }
  return null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const [campaigns, affiliates, storefrontOrigin] = await Promise.all([
    getCampaigns(session.shop),
    getAffiliates(session.shop),
    fetchStorefrontOrigin(admin),
  ]);

  return {
    campaigns,
    affiliates,
    storefrontOrigin,
    shopDomain: session.shop,
  } satisfies LoaderData;
};

type ActionData = {
  errors?: {
    name?: string;
    slug?: string;
    affiliateId?: string;
    form?: string;
  };
  success?: boolean;
  deleted?: boolean;
  updated?: boolean;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "create").trim();

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "").trim();
    if (!id) {
      return { errors: { form: "Identificador inválido." } } satisfies ActionData;
    }
    const deleted = await deleteCampaign(id, session.shop);
    if (deleted.count === 0) {
      return { errors: { form: "No se encontró la campaña." } } satisfies ActionData;
    }
    return { success: true, deleted: true } satisfies ActionData;
  }

  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const affiliateId = String(formData.get("affiliateId") ?? "").trim();
  const errors: NonNullable<ActionData["errors"]> = {};

  if (!name) {
    errors.name = "El nombre es obligatorio.";
  }
  if (!slugRaw) {
    errors.slug = "El slug es obligatorio (solo minúsculas, números y guiones).";
  } else if (!isValidCampaignSlug(normalizeCampaignSlug(slugRaw))) {
    errors.slug =
      "Slug inválido. Usa minúsculas, números y guiones (ej. black-friday-2026).";
  }
  const slug = normalizeCampaignSlug(slugRaw);

  if (intent === "update") {
    const id = String(formData.get("id") ?? "").trim();
    if (!id) {
      return { errors: { form: "Identificador inválido." } } satisfies ActionData;
    }
    if (Object.keys(errors).length > 0) {
      return { errors } satisfies ActionData;
    }
    try {
      await prisma.campaign.update({
        where: { id },
        data: {
          name,
          slug,
        },
      });
      return { success: true } satisfies ActionData;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2025"
      ) {
        return { errors: { form: "No se encontró la campaña." } } satisfies ActionData;
      }
      if (isUniqueConstraintError(error)) {
        return {
          errors: { slug: "Ese slug ya existe. Usa otro." },
        } satisfies ActionData;
      }
      return {
        errors: { form: "No se pudo actualizar la campaña." },
      } satisfies ActionData;
    }
  }

  if (!affiliateId) {
    errors.affiliateId = "Selecciona un afiliado.";
  }
  const affiliate = affiliateId
    ? await findAffiliateById(affiliateId, session.shop)
    : null;
  if (affiliateId && !affiliate) {
    errors.affiliateId = "Afiliado no válido para esta tienda.";
  }
  if (Object.keys(errors).length > 0) {
    return { errors } satisfies ActionData;
  }

  const dupCreate = await findCampaignBySlugAny(slug, session.shop);
  if (dupCreate) {
    return {
      errors: { slug: "Ese slug ya existe. Usa otro." },
    } satisfies ActionData;
  }

  try {
    await createCampaign({
      shop: session.shop,
      name,
      slug,
      affiliateId: affiliate!.id,
    });
    return { success: true } satisfies ActionData;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        errors: { slug: "Ese slug ya existe. Usa otro." },
      } satisfies ActionData;
    }
    return {
      errors: { form: "No se pudo crear la campaña." },
    } satisfies ActionData;
  }
};

export default function CampaignsPage() {
  const { campaigns, affiliates, shopDomain } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const updateFetcher = useFetcher<typeof action>();
  const noAffiliates = affiliates.length === 0;

  const [nameValue, setNameValue] = useState("");
  const [slugValue, setSlugValue] = useState("");
  const [createFormKey, setCreateFormKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");

  useEffect(() => {
    if (
      actionData?.success &&
      !actionData?.errors &&
      !actionData?.deleted
    ) {
      setNameValue("");
      setSlugValue("");
      setCreateFormKey((prev) => prev + 1);
    }
  }, [actionData]);

  useEffect(() => {
    if (updateFetcher.state === "idle" && updateFetcher.data?.success) {
      setEditingId(null);
      setEditName("");
      setEditSlug("");
    }
  }, [updateFetcher.state, updateFetcher.data]);

  const rows = useMemo(
    () =>
      campaigns.map((campaign) => {
        const isEditing = editingId === campaign.id;
        const trackingUrl = `https://${shopDomain}/?ref=${encodeURIComponent(campaign.affiliate.code)}&c=${encodeURIComponent(campaign.slug)}`;
        return (
          <tr key={campaign.id}>
            <td
              style={{
                padding: 12,
                borderBottom: "1px solid #e1e3e5",
                verticalAlign: "middle",
              }}
            >
              {isEditing ? (
                <TextField
                  label="Nombre"
                  labelHidden
                  value={editName}
                  onChange={setEditName}
                  autoComplete="off"
                />
              ) : (
                campaign.name
              )}
            </td>
            <td
              style={{
                padding: 12,
                borderBottom: "1px solid #e1e3e5",
                verticalAlign: "middle",
              }}
            >
              {isEditing ? (
                <TextField
                  label="Slug"
                  labelHidden
                  value={editSlug}
                  onChange={setEditSlug}
                  autoComplete="off"
                />
              ) : (
                campaign.slug
              )}
            </td>
            <td
              style={{
                padding: 12,
                borderBottom: "1px solid #e1e3e5",
                verticalAlign: "middle",
              }}
            >
              {campaign.affiliate.code}
            </td>
            <td
              style={{
                padding: 12,
                borderBottom: "1px solid #e1e3e5",
                verticalAlign: "middle",
              }}
            >
              <Badge tone={campaign.active ? "success" : "info"}>
                {campaign.active ? "Activa" : "Inactiva"}
              </Badge>
            </td>
            <td
              style={{
                padding: 12,
                borderBottom: "1px solid #e1e3e5",
                verticalAlign: "middle",
              }}
            >
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">
                  {trackingUrl}
                </Text>
                <InlineStack>
                  <Button
                    variant="plain"
                    onClick={() => {
                      void navigator.clipboard.writeText(trackingUrl);
                    }}
                  >
                    Copiar
                  </Button>
                </InlineStack>
              </BlockStack>
            </td>
            <td
              style={{
                padding: 12,
                borderBottom: "1px solid #e1e3e5",
                verticalAlign: "middle",
              }}
            >
              <InlineStack gap="200">
                {isEditing ? (
                  <>
                    <Button
                      variant="primary"
                      loading={updateFetcher.state !== "idle"}
                      onClick={() => {
                        updateFetcher.submit(
                          {
                            _intent: "update",
                            id: campaign.id,
                            name: editName,
                            slug: editSlug,
                            affiliateId: campaign.affiliateId,
                          },
                          { method: "post" },
                        );
                      }}
                    >
                      Guardar
                    </Button>
                    <Button
                      variant="plain"
                      onClick={() => {
                        setEditingId(null);
                        setEditName("");
                        setEditSlug("");
                      }}
                    >
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingId(campaign.id);
                      setEditName(campaign.name);
                      setEditSlug(campaign.slug);
                    }}
                  >
                    Editar
                  </Button>
                )}
                <Form method="post">
                  <input type="hidden" name="_intent" value="delete" />
                  <input type="hidden" name="id" value={campaign.id} />
                  <Button submit variant="tertiary" tone="critical">
                    Eliminar
                  </Button>
                </Form>
              </InlineStack>
            </td>
          </tr>
        );
      }),
    [campaigns, editingId, editName, editSlug, shopDomain, updateFetcher],
  );

  return (
    <Page
      title="Campañas"
      subtitle="Organiza iniciativas de afiliados con parámetros ?ref= y &c=."
    >
      <BlockStack gap="400">
        <Card>
          <Box padding="400">
            <Banner tone="info" title="Cómo funciona">
              <p>
                Usa <code>?ref=CODIGO_AFILIADO</code> para atribuir la venta y{" "}
                <code>&c=slug-campaña</code> para clasificar la iniciativa.
              </p>
            </Banner>
          </Box>
        </Card>

        <Card>
          <Box padding="400">
            <Text variant="headingMd" as="h3">
              Nueva campaña
            </Text>
            <Box paddingBlockStart="300">
              {noAffiliates ? (
                <Banner title="Necesitas al menos un afiliado para crear campañas" tone="warning">
                  <Link url="/app/affiliates">Ir a Afiliados →</Link>
                </Banner>
              ) : (
                <Form method="post" key={`create-${createFormKey}`}>
                  <input type="hidden" name="_intent" value="create" />
                  <FormLayout>
                    <TextField
                      label="Nombre"
                      name="name"
                      value={nameValue}
                      onChange={setNameValue}
                      autoComplete="off"
                      error={actionData?.errors?.name}
                    />
                    <TextField
                      label="Slug (URL)"
                      name="slug"
                      value={slugValue}
                      onChange={setSlugValue}
                      autoComplete="off"
                      error={actionData?.errors?.slug}
                      helpText="Ej: verano-2026"
                    />
                    <div>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Afiliado
                      </Text>
                      <select
                        name="affiliateId"
                        defaultValue=""
                        style={{
                          width: "100%",
                          marginTop: 8,
                          padding: "10px 12px",
                          border: "1px solid #c9cccf",
                          borderRadius: 8,
                        }}
                      >
                        <option value="">— Seleccionar —</option>
                        {affiliates.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} ({a.commissionRate}%)
                          </option>
                        ))}
                      </select>
                    </div>
                    {actionData?.errors?.affiliateId ? (
                      <Text as="p" variant="bodyMd" tone="critical">
                        {actionData.errors.affiliateId}
                      </Text>
                    ) : null}
                    {actionData?.errors?.form ? (
                      <Text as="p" variant="bodyMd" tone="critical">
                        {actionData.errors.form}
                      </Text>
                    ) : null}
                    <InlineStack align="end" gap="200">
                      <Button submit variant="primary">
                        Crear campaña
                      </Button>
                    </InlineStack>
                  </FormLayout>
                </Form>
              )}
            </Box>
          </Box>
        </Card>

        <Card>
          <Box padding="400">
            <Text variant="headingMd" as="h3">
              Campañas
            </Text>
            <Box paddingBlockStart="300">
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
                      Nombre
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
                      Estado
                    </th>
                    <th
                      style={{
                        padding: 12,
                        textAlign: "left",
                        borderBottom: "1px solid #e1e3e5",
                        fontWeight: 600,
                      }}
                    >
                      Link de campaña
                    </th>
                    <th
                      style={{
                        padding: 12,
                        textAlign: "left",
                        borderBottom: "1px solid #e1e3e5",
                        fontWeight: 600,
                      }}
                    >
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>{rows}</tbody>
              </table>
            </Box>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
