import { motion } from "framer-motion";
import type { ReactNode } from "react";
import {
  Activity, AlertTriangle, CheckCircle2,
  Cpu, Database, Gauge, HardDrive, Layers3, MemoryStick, Network,
  RefreshCw, ServerCog, ShieldCheck, TimerReset, Wrench, Zap
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { UsageAreaChart, Sparkline } from "../charts";
import { useOperationalOverview, useRuntimeHealth } from "../../hooks/useQueries";
import { formatNumber, formatRelativeTime, formatUptime } from "../../lib/utils";
import type { Alert } from "../../types";

interface DashboardTabProps { serverId: string | null }

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055 } }
};
const rise = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } }
};

export function DashboardTab({ serverId }: DashboardTabProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, dataUpdatedAt } = useOperationalOverview(serverId);
  const { data: runtime } = useRuntimeHealth();

  if (!serverId) return null;
  if (isLoading && !data) return <DashboardSkeleton />;
  if (!data) return <EmptyState />;

  const { system, health, disks, services, jobs, databases, alerts, history } = data;
  const chartData = history.map((sample) => ({
    time: new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date(sample.timestamp)),
    cpu: sample.cpu,
    ram: sample.ram
  }));
  const safeHistory = history.length ? history : [{
    timestamp: data.updatedAt,
    cpu: system.cpuPercent || 0,
    ram: system.ramPercent || 0,
    diskBusy: system.diskBusyPercent || 0,
    networkRxMbps: system.networkRxMbps || 0,
    networkTxMbps: system.networkTxMbps || 0,
    processQueue: system.processorQueueLength || 0
  }];
  const stoppedServices = services.filter((item) => item.Status !== "Running").length;
  const failedJobs = jobs.filter((item) => item.last_run_status === "Failed").length;
  const unhealthyDatabases = databases.filter((item) => String(item.status).toLowerCase() !== "online" || item.is_synchronized === false).length;
  const criticalDisks = disks.filter((item) => item.UsedPercent >= 90).length;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4 pb-6">
      <motion.section variants={rise} className="command-hero">
        <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <HealthRing score={health.score} state={health.state} />
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`status-chip status-${health.state}`}><span className="status-dot" />{healthLabel(health.state)}</span>
                {system.stale && <span className="status-chip status-degraded">داده قدیمی</span>}
              </div>
              <h2 className="text-xl font-black tracking-tight text-white md:text-2xl">مرکز فرماندهی زیرساخت</h2>
              <p className="mt-1 max-w-2xl text-xs leading-6 text-slate-400 md:text-sm">
                نمای لحظه‌ای منابع، سرویس‌ها و رخدادهای عملیاتی؛ همه‌ی نمودارها از داده‌ی واقعی سرور ساخته شده‌اند.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <HeroFact icon={TimerReset} label="آپ‌تایم" value={formatUptime(system.uptimeSeconds)} />
            <HeroFact icon={ServerCog} label="پردازش‌ها" value={formatNumber(system.processCount || 0)} />
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["overview", serverId] })}
              className="hero-action"
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              بروزرسانی
            </button>
          </div>
        </div>
      </motion.section>

      <motion.section variants={rise} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard icon={Cpu} label="پردازنده" value={system.cpuPercent} unit="٪" color="cyan" history={safeHistory.map(item => item.cpu)} detail={`${system.logicalCores || 0} هسته منطقی`} />
        <MetricCard icon={MemoryStick} label="حافظه" value={system.ramPercent} unit="٪" color="violet" history={safeHistory.map(item => item.ram)} detail={`${system.ramUsedGB || 0} از ${system.ramTotalGB || 0} GB`} />
        <MetricCard icon={HardDrive} label="فعالیت دیسک" value={system.diskBusyPercent || 0} unit="٪" color="amber" history={safeHistory.map(item => item.diskBusy)} detail={`${criticalDisks} دیسک بحرانی`} />
        <MetricCard icon={Network} label="ترافیک شبکه" value={(system.networkRxMbps || 0) + (system.networkTxMbps || 0)} unit="Mb/s" color="emerald" history={safeHistory.map(item => item.networkRxMbps + item.networkTxMbps)} detail={`↓ ${system.networkRxMbps || 0}  ↑ ${system.networkTxMbps || 0}`} decimals={2} />
      </motion.section>

      <div className="grid gap-4 2xl:grid-cols-[1.45fr_0.75fr]">
        <motion.section variants={rise} className="panel-card min-w-0">
          <PanelHeader icon={Activity} title="روند مصرف منابع" eyebrow="۶۰ دقیقه اخیر" trailing={<span className="live-label"><span /> LIVE</span>} />
          <div className="px-2 pb-3 pt-1 md:px-4">
            {chartData.length > 1 ? <UsageAreaChart data={chartData} height={270} /> : <ChartWarmup />}
          </div>
        </motion.section>

        <motion.section variants={rise} className="panel-card">
          <PanelHeader icon={Zap} title="وضعیت سرویس‌ها" eyebrow="خلاصه عملیاتی" />
          <div className="grid grid-cols-2 gap-2 p-4">
            <SignalCard icon={Wrench} label="سرویس‌ها" value={services.length - stoppedServices} suffix={`/ ${services.length}`} issue={stoppedServices} />
            <SignalCard icon={Database} label="دیتابیس" value={databases.length - unhealthyDatabases} suffix={`/ ${databases.length}`} issue={unhealthyDatabases} />
            <SignalCard icon={Layers3} label="SQL Jobs" value={jobs.length - failedJobs} suffix={`/ ${jobs.length}`} issue={failedJobs} />
            <SignalCard icon={ShieldCheck} label="API مانیتور" value={runtime?.requests.p95Ms || 0} suffix="ms p95" issue={runtime?.requests.errors || 0} />
          </div>
          <div className="mx-4 mb-4 rounded-2xl border border-white/5 bg-black/20 p-3 text-[11px] text-slate-400">
            <div className="mb-2 flex items-center justify-between"><span>سلامت موتور مانیتورینگ</span><span className="font-mono text-emerald-300">{runtime?.requests.errorRate || 0}% خطا</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-emerald-400 transition-all duration-700" style={{ width: `${Math.max(3, 100 - (runtime?.requests.errorRate || 0))}%` }} /></div>
          </div>
        </motion.section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <motion.section variants={rise} className="panel-card">
          <PanelHeader icon={AlertTriangle} title="رخدادهای نیازمند توجه" eyebrow={`${alerts.length} هشدار فعال`} />
          <div className="max-h-[330px] space-y-2 overflow-auto p-3">
            {alerts.length ? alerts.slice(0, 8).map((alert) => <AlertRow key={alert.id} alert={alert} />) : <HealthyEmpty />}
          </div>
        </motion.section>

        <motion.section variants={rise} className="panel-card">
          <PanelHeader icon={Gauge} title="فرآیندهای پرمصرف" eyebrow="بر اساس CPU تجمعی" />
          <div className="divide-y divide-white/5 px-4 pb-2">
            {(system.topProcesses || []).map((process, index) => (
              <div key={`${process.id}-${process.name}`} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 py-3 text-xs">
                <span className="font-mono text-slate-600">{String(index + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <div className="truncate font-bold text-slate-200">{process.name}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-600">PID {process.id} · {process.handles} handles</div>
                </div>
                <div className="text-left font-mono"><div className="text-cyan-300">{process.cpuSeconds}s CPU</div><div className="text-[10px] text-slate-500">{process.memoryMB} MB</div></div>
              </div>
            ))}
            {!system.topProcesses?.length && <div className="py-14 text-center text-xs text-slate-500">اطلاعات فرآیندها هنوز دریافت نشده است.</div>}
          </div>
        </motion.section>
      </div>

      <motion.section variants={rise} className="panel-card">
        <PanelHeader icon={HardDrive} title="ظرفیت ذخیره‌سازی" eyebrow={`${disks.length} درایو شناسایی‌شده`} />
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {disks.map((disk) => <DiskCard key={disk.Drive} disk={disk} />)}
        </div>
      </motion.section>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-slate-600">
        <span>آخرین همگام‌سازی: {formatRelativeTime(dataUpdatedAt ? new Date(dataUpdatedAt) : data.updatedAt)}</span>
        <span className="font-mono" dir="ltr">{system.computerName || data.server.host} · {system.osCaption || "Windows Server"}</span>
      </div>
    </motion.div>
  );
}

function HealthRing({ score, state }: { score: number; state: string }) {
  const circumference = 2 * Math.PI * 38;
  const color = state === "healthy" ? "#34d399" : state === "degraded" ? "#fbbf24" : "#fb7185";
  return <div className="relative h-24 w-24 shrink-0"><svg viewBox="0 0 96 96" className="-rotate-90"><circle cx="48" cy="48" r="38" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="7" /><motion.circle cx="48" cy="48" r="38" fill="none" stroke={color} strokeLinecap="round" strokeWidth="7" strokeDasharray={circumference} initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset: circumference * (1 - score / 100) }} transition={{ duration: 1.1, ease: "easeOut" }} /></svg><div className="absolute inset-0 grid place-content-center text-center"><strong className="font-mono text-2xl text-white">{score}</strong><span className="text-[9px] uppercase tracking-[.2em] text-slate-500">health</span></div></div>;
}

function MetricCard({ icon: Icon, label, value, unit, detail, history, color, decimals = 1 }: { icon: typeof Cpu; label: string; value: number; unit: string; detail: string; history: number[]; color: "cyan" | "violet" | "amber" | "emerald"; decimals?: number }) {
  const colors = { cyan: "#22d3ee", violet: "#a78bfa", amber: "#fbbf24", emerald: "#34d399" };
  return <article className={`metric-card metric-${color}`}><div className="flex items-start justify-between"><div className="metric-icon"><Icon className="h-4 w-4" /></div><span className="text-[10px] uppercase tracking-[.18em] text-slate-600">{label}</span></div><div className="mt-4 flex items-end justify-between gap-2"><div><div className="font-mono text-2xl font-bold tracking-tight text-slate-100 md:text-3xl">{Number(value || 0).toFixed(decimals)}<span className="mr-1 text-xs font-medium text-slate-500">{unit}</span></div><p className="mt-1 text-[10px] text-slate-500">{detail}</p></div><div className="h-11 w-24 opacity-80"><Sparkline data={history.map(value => ({ value }))} color={colors[color]} height={44} /></div></div></article>;
}

function PanelHeader({ icon: Icon, title, eyebrow, trailing }: { icon: typeof Activity; title: string; eyebrow: string; trailing?: ReactNode }) {
  return <header className="flex items-center justify-between border-b border-white/5 px-4 py-3.5"><div className="flex items-center gap-3"><div className="grid h-8 w-8 place-content-center rounded-xl border border-cyan-400/10 bg-cyan-400/5 text-cyan-300"><Icon className="h-4 w-4" /></div><div><h3 className="text-sm font-extrabold text-slate-200">{title}</h3><p className="mt-0.5 text-[10px] text-slate-600">{eyebrow}</p></div></div>{trailing}</header>;
}

function SignalCard({ icon: Icon, label, value, suffix, issue }: { icon: typeof Wrench; label: string; value: number; suffix: string; issue: number }) {
  return <div className="rounded-2xl border border-white/5 bg-white/[.025] p-3"><div className="mb-3 flex items-center justify-between"><Icon className="h-4 w-4 text-slate-500" />{issue > 0 ? <span className="rounded-full bg-rose-400/10 px-2 py-0.5 text-[9px] text-rose-300">{issue} مشکل</span> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}</div><strong className="font-mono text-xl text-slate-100">{value} <small className="text-[10px] text-slate-600">{suffix}</small></strong><p className="mt-1 text-[10px] text-slate-500">{label}</p></div>;
}

function AlertRow({ alert }: { alert: Alert }) {
  const critical = alert.severity === "critical";
  return <div className="group flex gap-3 rounded-2xl border border-white/5 bg-white/[.02] p-3 transition hover:border-white/10 hover:bg-white/[.035]"><div className={`mt-0.5 grid h-8 w-8 shrink-0 place-content-center rounded-xl ${critical ? "bg-rose-400/10 text-rose-300" : "bg-amber-400/10 text-amber-300"}`}><AlertTriangle className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h4 className="truncate text-xs font-bold text-slate-200">{alert.title}</h4><span className="shrink-0 text-[9px] text-slate-600">{formatRelativeTime(alert.timestamp)}</span></div><p className="mt-1 line-clamp-2 text-[10px] leading-5 text-slate-500">{alert.message}</p></div></div>;
}

function DiskCard({ disk }: { disk: { Drive: string; VolumeName?: string; UsedPercent: number; UsedGB: number; TotalGB: number; FreeGB: number } }) {
  const tone = disk.UsedPercent >= 90 ? "danger" : disk.UsedPercent >= 80 ? "warning" : "ok";
  return <div className="rounded-2xl border border-white/5 bg-black/20 p-3.5"><div className="flex items-start justify-between"><div><div className="font-mono text-sm font-bold text-slate-200" dir="ltr">{disk.Drive}</div><div className="mt-0.5 max-w-32 truncate text-[10px] text-slate-600">{disk.VolumeName || "Local volume"}</div></div><span className={`disk-percent disk-${tone}`}>{disk.UsedPercent.toFixed(1)}%</span></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, disk.UsedPercent)}%` }} transition={{ duration: .8 }} className={`h-full rounded-full disk-bar-${tone}`} /></div><div className="mt-2 flex justify-between font-mono text-[9px] text-slate-600"><span>{disk.FreeGB} GB آزاد</span><span>{disk.TotalGB} GB</span></div></div>;
}

function HeroFact({ icon: Icon, label, value }: { icon: typeof TimerReset; label: string; value: string | number }) { return <div className="hero-fact"><Icon className="h-4 w-4 text-cyan-300" /><div><div className="text-[9px] text-slate-600">{label}</div><div className="mt-0.5 font-bold text-slate-200">{value}</div></div></div>; }
function HealthyEmpty() { return <div className="grid min-h-56 place-content-center text-center"><div className="mx-auto grid h-12 w-12 place-content-center rounded-2xl bg-emerald-400/10 text-emerald-300"><CheckCircle2 className="h-6 w-6" /></div><strong className="mt-3 text-sm text-slate-200">همه‌چیز آرام است</strong><span className="mt-1 text-[10px] text-slate-600">هشدار فعالی برای این سرور وجود ندارد.</span></div>; }
function ChartWarmup() { return <div className="grid h-[270px] place-content-center text-center text-xs text-slate-600"><Activity className="mx-auto mb-3 h-8 w-8 animate-pulse text-cyan-400/50" />در حال جمع‌آوری تاریخچه واقعی متریک‌ها…</div>; }
function DashboardSkeleton() { return <div className="space-y-4"><div className="h-40 animate-pulse rounded-3xl bg-white/[.03]" /><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[1,2,3,4].map(i => <div key={i} className="h-32 animate-pulse rounded-3xl bg-white/[.03]" />)}</div><div className="h-80 animate-pulse rounded-3xl bg-white/[.03]" /></div>; }
function EmptyState() { return <div className="grid min-h-[60vh] place-content-center text-center text-slate-500"><ServerCog className="mx-auto mb-4 h-12 w-12" /><p>دریافت نمای عملیاتی ممکن نشد.</p></div>; }
function healthLabel(state: string) { return state === "healthy" ? "پایدار" : state === "degraded" ? "نیازمند توجه" : state === "offline" ? "قطع ارتباط" : "بحرانی"; }
