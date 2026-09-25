/**
 * Shared parser for the ERP API's error body shape:
 *   { success: false, error: { code, message } }
 * — distinct from the older `{data:{errors:[{field,message}]}}` 422 shape
 * Academic Years' toResult() falls back to (that one's never actually been
 * confirmed against a real 422; this error.code shape is Muntajir's
 * finalized contract for Award Bodies/School Types). Each service's own
 * toResult() switches on the returned `code` to build the right CrudResult
 * kind — the codes and which field (if any) they target are entity-
 * specific, so that mapping isn't shared, only this extraction is.
 */
export type ErpError = { code: string | null; message: string | null };

export function extractErpError(body: unknown): ErpError {
  const error = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  return {
    code: typeof error?.code === "string" ? error.code : null,
    message: typeof error?.message === "string" ? error.message : null,
  };
}
