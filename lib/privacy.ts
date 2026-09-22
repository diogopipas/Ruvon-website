/** Operator details are business facts; never invent them from a brand name. */
export function privacyConfig() {
  const operator = process.env.JOLA_OPERATOR_NAME?.trim() || "";
  const value = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "";
  const contact = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
  const configuredMonths = Number(process.env.JOLA_RETENTION_MONTHS || 12);
  const retentionMonths =
    Number.isInteger(configuredMonths) &&
    configuredMonths >= 1 &&
    configuredMonths <= 24
      ? configuredMonths
      : 12;
  return {
    operator,
    contact,
    retentionMonths,
    ready: Boolean(operator && contact),
  };
}
