/** 20% of a positive net, in integer cents, half up. A loss pays nothing. */
export function paymentOnAccountCents(netCents: bigint): bigint {
  if (netCents <= 0n) {
    return 0n;
  }
  return (netCents * 20n + 50n) / 100n;
}

export function previewModelo130(incomeCents: bigint, expenseCents: bigint) {
  const netCents = incomeCents - expenseCents;
  return {
    incomeCents,
    expenseCents,
    netCents,
    rate: "0.20" as const,
    paymentCents: paymentOnAccountCents(netCents),
  };
}
