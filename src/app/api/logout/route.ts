import { supabase } from '@/lib/supabase/server';
import { isSameOrigin } from '@/lib/request-origin';
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const db = await supabase();
  await db.auth.signOut();
  return Response.json({ ok: true });
}
