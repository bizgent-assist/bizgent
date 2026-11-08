import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorState, LoadingState } from './components/ui/index.jsx';
import { useAuth } from './context/AuthContext.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import AuthLayout from './layouts/AuthLayout.jsx';
import { Login, Register, ForgotPassword, ResetPassword } from './pages/AuthPages.jsx';
import Landing from './pages/Landing.jsx';
import NotFound from './pages/NotFound.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Expenses = lazy(() => import('./pages/Expenses.jsx'));
const ExpenseForm = lazy(() => import('./pages/ExpenseForm.jsx'));
const Assistant = lazy(() => import('./pages/Assistant.jsx'));
const AgentSettings = lazy(() => import('./pages/AgentSettings.jsx'));
const Approvals = lazy(() => import('./pages/Approvals.jsx'));
const ApprovalDetail = lazy(() => import('./pages/ApprovalDetail.jsx'));
const Treasury = lazy(() => import('./pages/Treasury.jsx'));
const Transactions = lazy(() => import('./pages/Transactions.jsx'));
const Recipients = lazy(() => import('./pages/Recipients.jsx'));
const BusinessSettings = lazy(() => import('./pages/BusinessSettings.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));

function RequireAuth({ children }) {
  const auth = useAuth();
  const loc = useLocation();
  if (auth.status === 'loading') return <div className="min-h-dvh grid place-items-center"><LoadingState label="Loading your workspace…" /></div>;
  if (auth.status === 'error') return <div className="min-h-dvh grid place-items-center"><ErrorState error={auth.error} onRetry={auth.refresh} title="Cannot reach Bizgent" /></div>;
  if (auth.status !== 'authenticated') return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!auth.business) return <div className="min-h-dvh grid place-items-center"><ErrorState title="No business found" error={{ message: 'Your account has no business workspace.' }} /></div>;
  return children;
}

function GuestOnly({ children }) {
  const auth = useAuth();
  if (auth.status === 'authenticated') return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<GuestOnly><AuthLayout /></GuestOnly>}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>
        <Route element={<AuthLayout />}>
          <Route path="/reset-password" element={<ResetPassword />} />
        </Route>
        <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="assistant" element={<Assistant />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="expenses/new" element={<ExpenseForm />} />
          <Route path="expenses/:expenseId/edit" element={<ExpenseForm />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="approvals/:approvalId" element={<ApprovalDetail />} />
          <Route path="treasury" element={<Treasury />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="recipients" element={<Recipients />} />
          <Route path="agent" element={<AgentSettings />} />
          <Route path="settings/business" element={<BusinessSettings />} />
          <Route path="settings/profile" element={<Profile />} />
          <Route path="*" element={<NotFound inApp />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
