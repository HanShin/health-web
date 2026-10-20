import { redirect } from 'next/navigation';
export default async function Connections({
  searchParams,
}: {
  searchParams: Promise<{ oura?: string }>;
}) {
  const { oura } = await searchParams;
  redirect('/?view=settings' + (oura ? '&oura=' + encodeURIComponent(oura) : ''));
}
