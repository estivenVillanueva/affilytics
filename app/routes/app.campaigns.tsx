import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  FormLayout,
  IndexTable,
  InlineStack,
  Link,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useMemo, useState } from "react";
import {
  createCampaign,
  deleteCampaign,
  findCampaignById,
  findCampaignBySlugAny,
  findCampaignBySlugExcept,
  getCampaigns,
  isUniqueConstraintError,
  isValidCampaignSlug,
  normalizeCampaignSlug,
  updateCampaign,
} from "../models/campaign.server";
import { findAffiliateById, getAffiliates } from "../models/affiliate.server";
import { authenticate } from "../shopify.server";

type LoaderData = {
  campaigns: Awaited<ReturnType<typeof getCampaigns>>;
  affiliates: Awaited<ReturnType<typeof getAffiliates>>;
  editing: Awaited<ReturnType<typeof findCampaignById>>;
  storefrontOrigin: string | null;
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
  const url = new URL(request.url);
  const editId = url.searchParams.get("edit");
  const [campaigns, affiliates, storefrontOrigin, editing] = await Promise.all([
    getCampaigns(session.shop),
    getAffiliates(session.shop),
    fetchStorefrontOrigin(admin),
    editId?.trim()
      ? findCampaignById(editId.trim(), session.shop)
      : Promise.resolve(null),
  ]);

  return {
    campaigns,
    affiliates,
    storefrontOrigin,
    editing,
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
  if (!affiliateId) {
    errors.affiliateId = "Selecciona un afiliado.";
  }

  const slug = normalizeCampaignSlug(slugRaw);

  const affiliate = affiliateId
    ? await findAffiliateById(affiliateId, session.shop)
    : null;
  if (affiliateId && !affiliate) {
    errors.affiliateId = "Afiliado no válido para esta tienda.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors } satisfies ActionData;
  }

  if (intent === "update") {
    const id = String(formData.get("id") ?? "").trim();
    if (!id) {
      return { errors: { form: "Identificador inválido." } } satisfies ActionData;
    }
    const active = formData.get("active") === "on";
    const other = await findCampaignBySlugExcept(slug, session.shop, id);
    if (other) {
      return {
        errors: { slug: "Ese slug ya existe. Usa otro." },
      } satisfies ActionData;
    }
    try {
      const row = await updateCampaign({
        id,
        shop: session.shop,
        name,
        slug,
        affiliateId: affiliate!.id,
        active,
      });
      if (!row) {
        return { errors: { form: "No se encontró la campaña." } } satisfies ActionData;
      }
      return { success: true, updated: true } satisfies ActionData;
    } catch (error) {
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

function SuggestedTrackingUrl({
  origin,
  code,
  slug,
}: {
  origin: string | null;
  code: string;
  slug: string;
}) {
  const [copied, setCopied] = useState(false);
  const suffix = `?ref=${encodeURIComponent(code)}&c=${encodeURIComponent(slug)}`;
  const full = origin ? `${origin}${suffix}` : suffix;

  return (
    <BlockStack gap="200">
      <Text as="p" variant="bodySm" tone="subdued">
        Enlace de tracking:
      </Text>
      <InlineStack gap="200">
        <Box width="100%">
          <TextField label="URL" labelHidden value={full} autoComplete="off" readOnly />
        </Box>
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(full);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          Copiar
        </Button>
      </InlineStack>
      {copied ? (
        <Text as="p" variant="bodySm" tone="success">
          Copiado al portapapeles.
        </Text>
      ) : null}
    </BlockStack>
  );
}

export default function CampaignsPage() {
  const { campaigns, affiliates, storefrontOrigin, editing } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const noAffiliates = affiliates.length === 0;

  const [nameValue, setNameValue] = useState(editing?.name ?? "");
  const [slugValue, setSlugValue] = useState(editing?.slug ?? "");

  const rows = useMemo(
    () =>
      campaigns.map((campaign, index) => (
        <IndexTable.Row
          key={campaign.id}
          id={campaign.id}
          position={index}
          selected={false}
        >
          <IndexTable.Cell>{campaign.name}</IndexTable.Cell>
          <IndexTable.Cell>{campaign.slug}</IndexTable.Cell>
          <IndexTable.Cell>{campaign.affiliate.code}</IndexTable.Cell>
          <IndexTable.Cell>
            <Badge tone={campaign.active ? "success" : "info"}>
              {campaign.active ? "Activa" : "Inactiva"}
            </Badge>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <InlineStack gap="200">
              <Button
                url={`/app/campaigns?edit=${encodeURIComponent(campaign.id)}`}
                variant="secondary"
              >
                Editar
              </Button>
              <Form method="post">
                <input type="hidden" name="_intent" value="delete" />
                <input type="hidden" name="id" value={campaign.id} />
                <Button submit variant="tertiary" tone="critical">
                  Eliminar
                </Button>
              </Form>
            </InlineStack>
          </IndexTable.Cell>
        </IndexTable.Row>
      )),
    [campaigns],
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
              {editing ? "Editar campaña" : "Nueva campaña"}
            </Text>
            <Box paddingBlockStart="300">
              {noAffiliates ? (
                <Banner title="Necesitas al menos un afiliado para crear campañas" tone="warning">
                  <Link url="/app/affiliates">Ir a Afiliados →</Link>
                </Banner>
              ) : (
                <Form method="post" key={editing?.id ?? "create"}>
                  <input
                    type="hidden"
                    name="_intent"
                    value={editing ? "update" : "create"}
                  />
                  {editing ? (
                    <input type="hidden" name="id" value={editing.id} />
                  ) : null}
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
                        defaultValue={editing?.affiliateId ?? ""}
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
                    {editing ? (
                      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          name="active"
                          value="on"
                          defaultChecked={editing.active}
                        />
                        Campaña activa
                      </label>
                    ) : null}
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
                    {editing ? (
                      <SuggestedTrackingUrl
                        origin={storefrontOrigin}
                        code={editing.affiliate.code}
                        slug={editing.slug}
                      />
                    ) : null}
                    <InlineStack align="end" gap="200">
                      {editing ? (
                        <Button variant="tertiary" url="/app/campaigns">
                          Cancelar
                        </Button>
                      ) : null}
                      <Button submit variant="primary">
                        {editing ? "Guardar cambios" : "Crear campaña"}
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
              <IndexTable
                itemCount={campaigns.length}
                selectable={false}
                resourceName={{ singular: "campaña", plural: "campañas" }}
                headings={[
                  { title: "Nombre" },
                  { title: "Slug" },
                  { title: "Afiliado" },
                  { title: "Estado" },
                  { title: "Acciones" },
                ]}
              >
                {rows}
              </IndexTable>
            </Box>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
