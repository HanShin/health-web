import { Dashboard } from '@/components/dashboard';
import { demoRecords, demoConnections } from '@/lib/demo';
export const dynamic = 'force-dynamic';
export default function Demo() {
  return (
    <Dashboard
      demo
      email="데모 사용자"
      records={demoRecords()}
      connections={demoConnections}
      runs={[]}
      devices={[]}
    />
  );
}
