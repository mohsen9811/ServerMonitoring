import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, Bell, Clock3, Cpu, CreditCard, Database, FolderTree, Gauge,
  Globe, HardDrive, Menu, Network, Search, Server, Settings2, Wrench
} from "lucide-react";
import { useServerStore } from "../../stores/serverStore";
import { useAlertStore } from "../../stores/alertStore";
import { useAlerts, useRuntimeHealth, useServers } from "../../hooks/useQueries";
import { Sidebar } from "./Sidebar";
import { DashboardTab } from "../tabs/DashboardTab";

const SystemTab = lazy(() => import("../tabs/SystemTab").then(module => ({ default: module.SystemTab })));
const DiskTab = lazy(() => import("../tabs/DiskTab").then(module => ({ default: module.DiskTab })));
const ServicesTab = lazy(() => import("../tabs/ServicesTab").then(module => ({ default: module.ServicesTab })));
const IisTab = lazy(() => import("../tabs/IisTab").then(module => ({ default: module.IisTab })));
const JobsTab = lazy(() => import("../tabs/JobsTab").then(module => ({ default: module.JobsTab })));
const DatabasesTab = lazy(() => import("../tabs/DatabasesTab").then(module => ({ default: module.DatabasesTab })));
const ConnectivityTab = lazy(() => import("../tabs/ConnectivityTab").then(module => ({ default: module.ConnectivityTab })));
const CreditTab = lazy(() => import("../tabs/CreditTab").then(module => ({ default: module.CreditTab })));
const FilesTab = lazy(() => import("../tabs/FilesTab").then(module => ({ default: module.FilesTab })));
const AlertsTab = lazy(() => import("../tabs/AlertsTab").then(module => ({ default: module.AlertsTab })));
const SettingsTab = lazy(() => import("../tabs/SettingsTab").then(module => ({ default: module.SettingsTab })));

interface TabDef { id: string; label: string; icon: typeof Server; permission?: "sql" | "iis" | "credit" }

const TABS: TabDef[] = [
  { id: "dashboard", label: "نمای کلی", icon: Gauge },
  { id: "system", label: "سیستم", icon: Cpu },
  { id: "disk", label: "دیسک", icon: HardDrive },
  { id: "services", label: "سرویس‌ها", icon: Wrench },
  { id: "iis", label: "وب و IIS", icon: Globe, permission: "iis" },
  { id: "jobs", label: "SQL Jobs", icon: Clock3, permission: "sql" },
  { id: "databases", label: "Database / HA", icon: Database, permission: "sql" },
  { id: "connectivity", label: "ارتباطات", icon: Network, permission: "sql" },
  { id: "credit", label: "عملیات اعتباری", icon: CreditCard, permission: "credit" },
  { id: "files", label: "فایل‌ها", icon: FolderTree },
  { id: "alerts", label: "رخدادها", icon: Bell },
  { id: "settings", label: "تنظیمات", icon: Settings2 },
];

export function DashboardLayout() {
  const { servers, currentServerId, sidebarCollapsed, setSidebarCollapsed, setServers, setCurrentServer } = useServerStore();
  const { setAlerts } = useAlertStore();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [clock, setClock] = useState(new Date());
  const { data: remoteServers, isLoading: serversLoading } = useServers();
  const { data: runtime } = useRuntimeHealth();

  useEffect(() => {
    if (!remoteServers) return;
    const shouldSelectFirst = remoteServers.length > 0 && (
      (currentServerId === null && servers.length === 0) ||
      (currentServerId !== null && !remoteServers.some(server => server.id === currentServerId))
    );
    setServers(remoteServers);
    if (shouldSelectFirst) {
      setCurrentServer(remoteServers[0].id);
    }
  }, [remoteServers, currentServerId, servers.length, setCurrentServer, setServers]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 767px)');
    if (mobile.matches) setSidebarCollapsed(true);
  }, [setSidebarCollapsed]);

  const currentServer = servers.find(server => server.id === currentServerId);
  const hasSql = currentServer?.features?.sql ?? currentServer?.sql?.enabled ?? false;
  const hasIis = currentServer?.features?.iis ?? currentServer?.iis?.enabled ?? false;
  const hasCredit = currentServer?.features?.credit ?? currentServer?.credit?.enabled ?? false;
  const { data: alertsData } = useAlerts(currentServerId ?? undefined);

  useEffect(() => { if (alertsData) setAlerts(alertsData); }, [alertsData, setAlerts]);

  const visibleTabs = useMemo(() => TABS.filter(tab => {
    if (!tab.permission) return true;
    if (tab.permission === "sql") return hasSql;
    if (tab.permission === "iis") return hasIis;
    return hasCredit;
  }), [hasCredit, hasIis, hasSql]);

  useEffect(() => {
    if (!visibleTabs.some(tab => tab.id === activeTab)) setActiveTab("dashboard");
  }, [activeTab, visibleTabs]);

  const renderTab = () => {
    const props = { serverId: currentServerId };
    switch (activeTab) {
      case "system": return <SystemTab {...props} />;
      case "disk": return <DiskTab {...props} />;
      case "services": return <ServicesTab {...props} />;
      case "iis": return <IisTab {...props} />;
      case "jobs": return <JobsTab {...props} />;
      case "databases": return <DatabasesTab {...props} />;
      case "connectivity": return <ConnectivityTab {...props} />;
      case "credit": return <CreditTab {...props} />;
      case "files": return <FilesTab {...props} />;
      case "alerts": return <AlertsTab {...props} />;
      case "settings": return <SettingsTab {...props} />;
      default: return <DashboardTab {...props} />;
    }
  };

  return (
    <div dir="rtl" className="app-shell flex h-dvh gap-2 overflow-hidden p-2 text-textMain md:gap-3 md:p-3">
      <motion.aside
        animate={{ width: sidebarCollapsed ? 72 : 268 }}
        transition={{ type: "spring", stiffness: 360, damping: 34 }}
        className={`shell-panel relative z-20 h-full shrink-0 overflow-hidden rounded-[22px] ${!sidebarCollapsed ? 'max-md:absolute max-md:inset-y-2 max-md:right-2 max-md:h-auto' : ''}`}
      >
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} onOpenSettings={() => setActiveTab("settings")} />
      </motion.aside>
      {!sidebarCollapsed && <button className="fixed inset-0 z-10 bg-black/65 backdrop-blur-[2px] md:hidden" onClick={() => setSidebarCollapsed(true)} aria-label="بستن منوی کناری" />}

      <main className="shell-panel flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[22px]">
        <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-white/5 px-3 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="grid h-9 w-9 place-content-center rounded-xl border border-white/5 bg-white/[.025] text-slate-500 transition hover:text-cyan-300 md:hidden"><Menu className="h-4 w-4" /></button>
            <div className="relative grid h-10 w-10 shrink-0 place-content-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[.06] text-cyan-300">
              <Server className="h-5 w-5" />
              {currentServer && <span className="absolute -left-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0c111d] bg-emerald-400 shadow-[0_0_10px_#34d399]" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><h1 className="truncate text-sm font-black text-slate-100 md:text-base">{currentServer?.name || (serversLoading ? "در حال دریافت سرورها…" : "سروری انتخاب نشده")}</h1>{currentServer && <span className="hidden rounded-full border border-white/5 bg-white/[.03] px-2 py-0.5 font-mono text-[9px] text-slate-500 sm:inline" dir="ltr">{currentServer.host}</span>}</div>
              <p className="mt-0.5 truncate text-[10px] text-slate-600">Operations control center · پایش پیوسته زیرساخت</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-xl border border-white/5 bg-white/[.02] px-3 py-2 lg:flex"><Activity className="h-3.5 w-3.5 text-emerald-400" /><div className="text-left"><div className="font-mono text-[10px] text-slate-300">{runtime?.requests.p95Ms || 0}ms</div><div className="text-[8px] uppercase tracking-widest text-slate-600">api p95</div></div></div>
            <div className="rounded-xl border border-white/5 bg-white/[.02] px-3 py-2 text-left"><div className="font-mono text-[11px] text-slate-300">{new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(clock)}</div><div className="hidden text-[8px] text-slate-600 sm:block">{new Intl.DateTimeFormat("fa-IR", { weekday: "short", month: "short", day: "numeric" }).format(clock)}</div></div>
          </div>
        </header>

        <nav className="scrollbar-none flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/5 px-2 py-2 md:px-4" aria-label="بخش‌های مانیتورینگ">
          {visibleTabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`relative flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-[11px] font-bold transition ${active ? "bg-cyan-400/[.09] text-cyan-200" : "text-slate-500 hover:bg-white/[.03] hover:text-slate-300"}`}><Icon className="h-3.5 w-3.5" /><span>{tab.label}</span>{active && <motion.span layoutId="active-tab" className="absolute inset-x-3 -bottom-[9px] h-px bg-cyan-300 shadow-[0_0_9px_#22d3ee]" />}</button>;
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">
          <AnimatePresence mode="wait">
            <motion.div key={`${activeTab}-${currentServerId}`} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .18 }}>
              {currentServerId || activeTab === "settings" ? <Suspense fallback={<TabLoader />}>{renderTab()}</Suspense> : <NoServer onSettings={() => setActiveTab("settings")} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NoServer({ onSettings }: { onSettings: () => void }) {
  return <div className="grid min-h-[70vh] place-content-center text-center"><div className="mx-auto grid h-16 w-16 place-content-center rounded-3xl border border-cyan-400/10 bg-cyan-400/5 text-cyan-300"><Search className="h-7 w-7" /></div><h2 className="mt-5 text-lg font-black text-slate-200">اولین سرور را متصل کنید</h2><p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-slate-500">برای شروع پایش، مشخصات WinRM و در صورت نیاز SQL Server را در بخش تنظیمات وارد کنید.</p><button onClick={onSettings} className="mx-auto mt-5 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-bold text-cyan-200">رفتن به تنظیمات</button></div>;
}

function TabLoader() { return <div className="space-y-3"><div className="h-16 animate-pulse rounded-2xl bg-white/[.025]" /><div className="h-72 animate-pulse rounded-3xl bg-white/[.025]" /></div>; }
