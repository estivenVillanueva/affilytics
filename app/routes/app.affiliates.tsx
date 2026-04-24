import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useFetcher, useLoaderData } from "react-router";
import {
  Box,
  Button,
  Card,
  EmptyState,
  FormLayout,
  InlineStack,
  Page,
  Text,
  TextField,
  Tooltip,
} from "@shopify/polaris";
import { useEffect, useMemo, useState } from "react";
import prisma from "../db.server";
import {
  createAffiliate,
  deleteAffiliate,
  findAffiliateByCode,
  findAffiliateByCodeExcept,
  findAffiliateById,
  getAffiliates,
  isUniqueConstraintError,
} from "../models/affiliate.server";
import { authenticate } from "../shopify.server";

type ActionData = {
  errors?: {
    code?: string;
    commissionRate?: string;
    form?: string;
  };
  success?: boolean;
  deleted?: boolean;
  updated?: boolean;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const editId = url.searchParams.get("edit");
  const affiliates = await getAffiliates(session.shop);
  const editing =
    editId && editId.trim()
      ? await findAffiliateById(editId.trim(), session.shop)
      : null;

  return { affiliates, editing, shopDomain: session.shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = String(formData.get("_intent") ?? "create").trim();

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "").trim();
    if (!id) {
      return {
        errors: { form: "Identificador inválido." },
      } satisfies ActionData;
    }
    const deleted = await deleteAffiliate(id, session.shop);
    if (deleted.count === 0) {
      return {
        errors: { form: "No se encontró el afiliado." },
      } satisfies ActionData;
    }
    return { success: true, deleted: true } satisfies ActionData;
  }

  const code = String(formData.get("code") ?? "").trim();
  const commissionRateRaw = String(
    formData.get("commissionRate") ?? "",
  ).trim();
  const errors: NonNullable<ActionData["errors"]> = {};

  if (!code) {
    errors.code = "El código es obligatorio.";
  }

  const commissionRate = Number(commissionRateRaw);
  if (!commissionRateRaw) {
    errors.commissionRate = "La comisión es obligatoria.";
  } else if (Number.isNaN(commissionRate) || commissionRate < 0) {
    errors.commissionRate =
      "La comisión debe ser un número mayor o igual a 0.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors } satisfies ActionData;
  }

  if (intent === "update") {
    const id = String(formData.get("id") ?? "").trim();
    if (!id) {
      return {
        errors: { form: "Identificador inválido." },
      } satisfies ActionData;
    }

    const existingOther = await findAffiliateByCodeExcept(
      code,
      session.shop,
      id,
    );
    if (existingOther) {
      return {
        errors: {
          code: "Ese código ya existe. Usa uno diferente.",
        },
      } satisfies ActionData;
    }

    try {
      await prisma.affiliate.update({
        where: { id },
        data: { code, commissionRate },
      });
      return { success: true } satisfies ActionData;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2025"
      ) {
        return {
          errors: { form: "No se encontró el afiliado." },
        } satisfies ActionData;
      }
      if (isUniqueConstraintError(error)) {
        return {
          errors: {
            code: "Ese código ya existe. Usa uno diferente.",
          },
        } satisfies ActionData;
      }
      return {
        errors: {
          form: "No se pudo actualizar el afiliado. Intenta nuevamente.",
        },
      } satisfies ActionData;
    }
  }

  const existingAffiliate = await findAffiliateByCode(code, session.shop);
  if (existingAffiliate) {
    return {
      errors: {
        code: "Ese código ya existe. Usa uno diferente.",
      },
    } satisfies ActionData;
  }

  try {
    await createAffiliate({
      code,
      shop: session.shop,
      commissionRate,
    });

    return {
      success: true,
    } satisfies ActionData;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        errors: {
          code: "Ese código ya existe. Usa uno diferente.",
        },
      } satisfies ActionData;
    }

    return {
      errors: {
        form: "No se pudo crear el afiliado. Intenta nuevamente.",
      },
    } satisfies ActionData;
  }
};

export default function AffiliatesPage() {
  const { affiliates, shopDomain } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const updateFetcher = useFetcher<typeof action>();

  const [createCode, setCreateCode] = useState("");
  const [createCommission, setCreateCommission] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editCommission, setEditCommission] = useState("");

  useEffect(() => {
    if (actionData && !actionData.errors && actionData.success && !actionData.deleted) {
      setCreateCode("");
      setCreateCommission("");
    }
  }, [actionData]);

  useEffect(() => {
    if (updateFetcher.state === "idle" && updateFetcher.data?.success) {
      setEditingId(null);
      setEditCode("");
      setEditCommission("");
    }
  }, [updateFetcher.state, updateFetcher.data]);

  const rows = useMemo(
    () =>
      affiliates.map((affiliate) => {
        const trackingUrl = `https://${shopDomain}/?ref=${encodeURIComponent(affiliate.code)}`;
        const isEditing = editingId === affiliate.id;
        return (
          <tr key={affiliate.id}>
            <td
              style={{
                padding: 12,
                borderBottom: "1px solid #e1e3e5",
                verticalAlign: "middle",
              }}
            >
              {isEditing ? (
                <TextField
                  label="Código"
                  labelHidden
                  value={editCode}
                  onChange={setEditCode}
                  autoComplete="off"
                />
              ) : (
                <Text as="span" variant="bodyMd" fontWeight="semibold">
                  {affiliate.code}
                </Text>
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
                  label="Comisión (%)"
                  labelHidden
                  value={editCommission}
                  onChange={setEditCommission}
                  autoComplete="off"
                />
              ) : (
                `${affiliate.commissionRate}%`
              )}
            </td>
            <td
              style={{
                padding: 12,
                borderBottom: "1px solid #e1e3e5",
                verticalAlign: "middle",
              }}
            >
              {new Date(affiliate.createdAt).toLocaleDateString("es", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </td>
            <td
              style={{
                padding: 12,
                borderBottom: "1px solid #e1e3e5",
                verticalAlign: "middle",
              }}
            >
              <InlineStack align="space-between" blockAlign="center" gap="200">
                <Text as="span" variant="bodySm" tone="subdued">
                  {trackingUrl}
                </Text>
                <Tooltip content="Copiar link de seguimiento">
                  <Button
                    variant="plain"
                    onClick={() => {
                      void navigator.clipboard.writeText(trackingUrl);
                    }}
                  >
                    Copiar
                  </Button>
                </Tooltip>
              </InlineStack>
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
                      onClick={() => {
                        updateFetcher.submit(
                          {
                            _intent: "update",
                            id: affiliate.id,
                            code: editCode,
                            commissionRate: editCommission,
                          },
                          { method: "post" },
                        );
                      }}
                      loading={updateFetcher.state !== "idle"}
                    >
                      Guardar
                    </Button>
                    <Button
                      variant="plain"
                      onClick={() => {
                        setEditingId(null);
                        setEditCode("");
                        setEditCommission("");
                      }}
                    >
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingId(affiliate.id);
                      setEditCode(affiliate.code);
                      setEditCommission(String(affiliate.commissionRate));
                    }}
                  >
                    Editar
                  </Button>
                )}
                <Form method="post">
                  <input type="hidden" name="_intent" value="delete" />
                  <input type="hidden" name="id" value={affiliate.id} />
                  <Button submit variant="tertiary" tone="critical">
                    Eliminar
                  </Button>
                </Form>
              </InlineStack>
            </td>
          </tr>
        );
      }),
    [
      affiliates,
      shopDomain,
      editingId,
      editCode,
      editCommission,
      updateFetcher,
    ],
  );

  return (
    <Page
      title="Afiliados"
      subtitle="Gestiona tus afiliados y sus comisiones"
      primaryAction={{
        content: "Nuevo afiliado",
        onAction: () =>
          document
            .getElementById("new-affiliate-card")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      }}
    >
      <Card>
        <Box id="new-affiliate-card" padding="400">
          <Text variant="headingMd" as="h3">
            Nuevo afiliado
          </Text>
          <Box paddingBlockStart="300">
            <Form method="post">
              <input type="hidden" name="_intent" value="create" />
              <FormLayout>
                <InlineStack gap="400" align="start">
                  <Box minWidth="320px">
                    <TextField
                      label="Código"
                      name="code"
                      autoComplete="off"
                      value={createCode}
                      onChange={setCreateCode}
                      error={actionData?.errors?.code}
                      helpText="Se usará en enlaces ?ref=CÓDIGO"
                    />
                  </Box>
                  <Box minWidth="200px">
                    <TextField
                      label="Comisión (%)"
                      name="commissionRate"
                      value={createCommission}
                      onChange={setCreateCommission}
                      autoComplete="off"
                      error={actionData?.errors?.commissionRate}
                    />
                  </Box>
                </InlineStack>
                {actionData?.errors?.form ? (
                  <Text as="p" variant="bodyMd" tone="critical">
                    {actionData.errors.form}
                  </Text>
                ) : null}
                <InlineStack align="end">
                  <Button submit variant="primary">
                    Crear afiliado
                  </Button>
                </InlineStack>
              </FormLayout>
            </Form>
          </Box>
        </Box>
      </Card>

      <Box paddingBlockStart="400">
        <Card>
          <Box padding="400">
            <Text variant="headingMd" as="h3">
              Listado de afiliados
            </Text>
            <Box paddingBlockStart="300">
              {affiliates.length === 0 ? (
                <EmptyState
                  heading="No hay afiliados todavía"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-products.png"
                  action={{
                    content: "Crear afiliado",
                    onAction: () =>
                      document
                        .getElementById("new-affiliate-card")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                  }}
                >
                  <p>Crea el primero para empezar a rastrear conversiones.</p>
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
                        Creado el
                      </th>
                      <th
                        style={{
                          padding: 12,
                          textAlign: "left",
                          borderBottom: "1px solid #e1e3e5",
                          fontWeight: 600,
                        }}
                      >
                        Link de seguimiento
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
              )}
            </Box>
          </Box>
        </Card>
      </Box>
    </Page>
  );
}
