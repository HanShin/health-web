export const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
export function isAllowed(email?: string | null) {
  const allowed = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}
