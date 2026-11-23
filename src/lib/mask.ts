/**
 * Partly hides a contact so the voter can recognise it ("ra*****@gmail.com") without
 * the page revealing the full address/number to someone who only knows a roll number.
 */
export function maskContact(type: "EMAIL" | "PHONE", value: string) {
  if (type === "EMAIL") {
    const [user, domain = ""] = value.split("@");
    const keep = user.length <= 3 ? 1 : 2;
    return `${user.slice(0, keep)}${"*".repeat(Math.max(3, Math.min(8, user.length - keep)))}@${domain}`;
  }
  const digits = value.replace(/\D/g, "");
  return `${value.startsWith("+") ? "+" : ""}${digits.slice(0, 2)}${"*".repeat(Math.max(4, digits.length - 5))}${digits.slice(-3)}`;
}
