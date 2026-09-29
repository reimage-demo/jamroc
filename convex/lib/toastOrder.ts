// Normalize only confirmed, paid pickup orders. Never trust browser order data.
export function normalizeToastOrder(
  order: any,
  allowedSources: string[],
  pickupIds: string[],
) {
  if (
    order.createdInTestMode ||
    !allowedSources.includes(order.source) ||
    !pickupIds.includes(order.diningOption?.guid)
  )
    return null;
  const checks = (order.checks || []).filter(
    (c: any) => !c.deleted && !c.voided,
  );
  const voided = order.voided || order.deleted || checks.length === 0;
  const refunded =
    checks.length > 0 &&
    checks.every(
      (c: any) =>
        (c.payments || []).length > 0 &&
        c.payments.every((p: any) => p.paymentStatus === "REFUNDED"),
    );
  if (
    !voided &&
    !refunded &&
    (order.approvalStatus !== "APPROVED" ||
      !checks.every((c: any) => ["PAID", "CLOSED"].includes(c.paymentStatus)))
  )
    return null;
  // Future scheduled orders must be fired in Toast before entering the active queue.
  if (
    !voided &&
    !refunded &&
    Date.parse(order.estimatedFulfillmentDate) > Date.now() + 60 * 60 * 1000
  )
    return null;
  const customer = checks.find((c: any) => c.customer)?.customer || {};
  const firstName = String(customer.firstName || "Guest")
    .trim()
    .split(/\s+/)[0]
    .slice(0, 40);
  const items = checks
    .flatMap((c: any) =>
      (c.selections || [])
        .filter((s: any) => !s.voided && !s.deleted && s.quantity > 0)
        .map((s: any) => ({
          name: String(s.displayName || "Menu item").slice(0, 200),
          quantity: Number(s.quantity),
        })),
    )
    .slice(0, 200);
  const notes = checks
    .flatMap((c: any) =>
      (c.selections || [])
        .filter((s: any) => !s.voided && !s.deleted)
        .flatMap((s: any) =>
          (s.modifiers || [])
            .filter((m: any) => !m.voided && !m.deleted)
            .map((m: any) => `${s.displayName}: ${m.displayName}`),
        ),
    )
    .join("\n")
    .slice(0, 4000);
  const createdAt = Date.parse(order.createdDate || order.openedDate),
    toastUpdatedAt = Date.parse(order.modifiedDate || order.createdDate);
  if (!Number.isFinite(createdAt) || !Number.isFinite(toastUpdatedAt))
    throw new Error("Missing Toast timestamps");
  return {
    toastGuid: order.guid,
    orderNumber: String(
      order.displayNumber || checks[0]?.displayNumber || order.guid.slice(-6),
    ).slice(0, 30),
    items,
    customer: { firstName, notes },
    createdAt,
    toastUpdatedAt,
    paymentState: voided
      ? ("voided" as const)
      : refunded
        ? ("refunded" as const)
        : ("paid" as const),
  };
}
