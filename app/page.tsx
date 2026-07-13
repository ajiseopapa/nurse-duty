import { Suspense } from 'react';
import SchedulerApp from '@/components/SchedulerApp';

export default function Page() {
  return (
    <Suspense>
      <SchedulerApp />
    </Suspense>
  );
}
