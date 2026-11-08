import { Compass } from 'lucide-react';
import { Wordmark } from '../components/Brand.jsx';
import { Button } from '../components/ui/index.jsx';

export default function NotFound({ inApp }) {
  const body = (
    <div className="text-center max-w-sm mx-auto py-16">
      <div className="size-12 rounded-xl bg-subtle grid place-items-center mx-auto mb-4 text-muted"><Compass className="size-6" /></div>
      <p className="eyebrow">Error 404</p>
      <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em]">Page not found</h1>
      <p className="mt-2 text-[14px] text-muted">The page you are looking for doesn't exist or has moved.</p>
      <Button className="mt-6" to={inApp ? '/app' : '/'}>{inApp ? 'Back to dashboard' : 'Go home'}</Button>
    </div>
  );
  if (inApp) return body;
  return (
    <div className="min-h-dvh flex flex-col px-5 py-6">
      <Wordmark />
      <div className="flex-1 grid place-items-center">{body}</div>
    </div>
  );
}
