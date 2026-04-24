import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import {
  Box,
  Button,
  Card,
  EmptyState,
  FormLayout,
  IndexTable,
  InlineStack,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useMemo, useState } from "react";
import {
  createAffiliate,
  deleteAffiliate,
  findAffiliateByCode,
  findAffiliateByCodeExcept,
  findAffiliateById,
  getAffiliates,
  isUniqueConstraintError,
  updateAffiliate,
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

  return { affiliates, editing };
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
      const row = await updateAffiliate({
        id,
        shop: session.shop,
        code,
        commissionRate,
      });
      if (!row) {
        return {
          errors: { form: "No se encontró el afiliado." },
        } satisfies ActionData;
      }
      return { success: true, updated: true } satisfies ActionData;
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
  const { affiliates, editing } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const [createCode, setCreateCode] = useState("");
  const [createCommission, setCreateCommission] = useState("");
  const [editCode, setEditCode] = useState(editing?.code ?? "");
  const [editCommission, setEditCommission] = useState(
    editing ? String(editing.commissionRate) : "",
  );

  const rows = useMemo(
    () =>
      affiliates.map((affiliate, index) => (
        <IndexTable.Row
          id={affiliate.id}
          key={affiliate.id}
          position={index}
          selected={false}
        >
          <IndexTable.Cell>
            <Text as="span" variant="bodyMd" fontWeight="semibold">
              {affiliate.code}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>{affiliate.commissionRate}%</IndexTable.Cell>
          <IndexTable.Cell>
            {new Date(affiliate.createdAt).toLocaleDateString("es", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </IndexTable.Cell>
          <IndexTable.Cell>
            <InlineStack gap="200">
              <Button
                url={`/app/affiliates?edit=${encodeURIComponent(affiliate.id)}`}
                variant="secondary"
              >
                Editar
              </Button>
              <Form method="post">
                <input type="hidden" name="_intent" value="delete" />
                <input type="hidden" name="id" value={affiliate.id} />
                <Button submit variant="tertiary" tone="critical">
                  Eliminar
                </Button>
              </Form>
            </InlineStack>
          </IndexTable.Cell>
        </IndexTable.Row>
      )),
    [affiliates],
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
            {editing ? "Editar afiliado" : "Nuevo afiliado"}
          </Text>
          <Box paddingBlockStart="300">
            {editing ? (
              <Form method="post" key={editing.id}>
                <input type="hidden" name="_intent" value="update" />
                <input type="hidden" name="id" value={editing.id} />
                <FormLayout>
                  <InlineStack gap="400" align="start">
                    <Box minWidth="320px">
                      <TextField
                        label="Código"
                        name="code"
                        autoComplete="off"
                        value={editCode}
                        onChange={setEditCode}
                        error={actionData?.errors?.code}
                        helpText="Se usará en enlaces ?ref=CÓDIGO"
                      />
                    </Box>
                    <Box minWidth="200px">
                      <TextField
                        label="Comisión (%)"
                        name="commissionRate"
                        value={editCommission}
                        onChange={setEditCommission}
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
                  <InlineStack align="end" gap="200">
                    <Button url="/app/affiliates" variant="tertiary">
                      Cancelar
                    </Button>
                    <Button submit variant="primary">
                      Guardar cambios
                    </Button>
                  </InlineStack>
                </FormLayout>
              </Form>
            ) : (
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
            )}
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
                <IndexTable
                  itemCount={affiliates.length}
                  headings={[
                    { title: "Código" },
                    { title: "Comisión (%)" },
                    { title: "Creado el" },
                    { title: "Acciones" },
                  ]}
                  selectable={false}
                  resourceName={{ singular: "afiliado", plural: "afiliados" }}
                >
                  {rows}
                </IndexTable>
              )}
            </Box>
          </Box>
        </Card>
      </Box>
    </Page>
  );
}
