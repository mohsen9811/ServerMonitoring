import { ToastProvider } from "./components/ui/Toast";
import { DashboardLayout } from "./components/layout/DashboardLayout";

export default function App() {
  return (
    <ToastProvider>
      <DashboardLayout />
    </ToastProvider>
  );
}