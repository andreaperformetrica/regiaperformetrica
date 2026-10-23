export type ClerkUserLike = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  primaryEmailAddressId: string | null;
  emailAddresses: {
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
  }[];
  publicMetadata: Record<string, unknown>;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function verifiedEmail(user: ClerkUserLike): string | null {
  const address = user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId);
  return address?.verification?.status === "verified" ? normalizeEmail(address.emailAddress) : null;
}

export function accountFor(user: ClerkUserLike) {
  const email = verifiedEmail(user);
  if (!email || user.publicMetadata.regiaAccess !== true) return null;
  return {
    id: user.id,
    email,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || email,
    isAdmin: user.publicMetadata.regiaRole === "admin",
  };
}

export function validEmail(email: unknown): email is string {
  return typeof email === "string" && email.length <= 254 &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email.trim());
}
