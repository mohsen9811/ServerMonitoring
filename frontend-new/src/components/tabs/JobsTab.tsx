import { useState } from "react";
import { useJobs, useJobAction } from "../../hooks/useQueries";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SearchInput, Select } from "../ui/SearchInput";
import { SimpleBarChart } from "../charts/index";
import { RefreshCw, Play, Square, ToggleLeft, ToggleRight, RotateCcw, LoaderCircle, Clock3 } from "lucide-react";
import { formatDate, getStatusVariant } from "../../lib/utils";
import { useToast } from "../ui/Toast";

interface JobsTabProps { serverId: string | null }

export function JobsTab({ serverId }: JobsTabProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const { data: jobs = [], isLoading, isError, error, isFetching, refetch } = useJobs(serverId);
  const jobAction = useJobAction();
  const { showToast } = useToast();

  if (!serverId) return null;
  if (isError) return <div className="grid min-h-[45vh] place-content-center text-center"><Clock3 className="mx-auto mb-3 h-10 w-10 text-rose-400/60" /><h3 className="text-sm font-bold text-rose-200">خواندن SQL Agent Jobs ناموفق بود</h3><p className="mx-auto mt-2 max-w-lg whitespace-pre-line text-xs leading-6 text-slate-500">{error instanceof Error ? error.message : "ارتباط SQL برقرار نشد."}</p><Button className="mx-auto mt-4" variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /> تلاش دوباره</Button></div>;

  const runAction = async (jobName: string, action: string) => {
    try {
      const result: any = await jobAction.mutateAsync({ serverId, jobName, action });
      showToast(result?.message || `عملیات ${action} انجام شد.`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "عملیات Job ناموفق بود.", "error");
    }
  };

  const filtered = jobs.filter(job => {
    const term = search.trim().toLowerCase();
    if (term && !`${job.name} ${job.last_message || ""} ${job.category || ""}`.toLowerCase().includes(term)) return false;
    if (filter === "failed") return !job.is_running && /fail/i.test(job.last_run_status);
    if (filter === "running") return job.is_running;
    if (filter === "idle") return job.enabled && !job.is_running;
    if (filter === "disabled") return !job.enabled;
    return true;
  });

  const runningCount = jobs.filter(job => job.is_running).length;
  const disabledCount = jobs.filter(job => !job.enabled).length;
  const failedCount = jobs.filter(job => job.enabled && !job.is_running && /fail/i.test(job.last_run_status)).length;
  const idleCount = Math.max(0, jobs.length - runningCount - disabledCount - failedCount);
  const chartData = [
    { name: "Running", value: runningCount, fill: "#8b5cf6" },
    { name: "Idle", value: idleCount, fill: "#34d399" },
    { name: "Failed", value: failedCount, fill: "#fb7185" },
    { name: "Disabled", value: disabledCount, fill: "#64748b" },
  ];

  if (isLoading) return <JobsSkeleton />;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-black text-textMain">SQL Agent Jobs</h2><p className="mt-1 text-[11px] text-textMuted">وضعیت اجرای فعلی از SQL Agent Activity خوانده می‌شود، نه فقط نتیجه آخرین اجرا.</p></div>
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> تازه‌سازی زنده</Button>
      </div>

      <Card>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-[1.35fr_.85fr]">
            <div><div className="mb-2 flex items-center justify-between"><h3 className="font-bold text-textMain">توزیع وضعیت فعلی</h3><span className="text-[10px] text-slate-600">هر ۵ ثانیه</span></div><SimpleBarChart data={chartData} height={165} /></div>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="در حال اجرا" value={runningCount} tone="text-violet-300" />
              <Stat label="آماده اجرا" value={idleCount} tone="text-emerald-300" />
              <Stat label="آخرین اجرا Failed" value={failedCount} tone="text-rose-300" />
              <Stat label="غیرفعال" value={disabledCount} tone="text-slate-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row"><div className="flex-1"><SearchInput value={search} onChange={setSearch} placeholder="جستجوی نام، پیام یا Category…" /></div><div className="w-full sm:w-48"><Select value={filter} onChange={setFilter} options={[{value:"all",label:"همه وضعیت‌ها"},{value:"running",label:"Running"},{value:"idle",label:"Idle / Ready"},{value:"failed",label:"Failed"},{value:"disabled",label:"Disabled"}]} /></div></div>

      <Card>
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3"><span className="font-bold">فهرست کامل Jobs</span><Badge variant="primary">{filtered.length}/{jobs.length}</Badge></div>
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 390px)" }}>
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="sticky top-0 z-10 border-b border-border/60 bg-card text-xs text-textMuted"><th className="px-4 py-2.5 text-right font-medium">Job</th><th className="px-4 py-2.5 text-right font-medium">اکنون</th><th className="px-4 py-2.5 text-right font-medium">آخرین نتیجه</th><th className="px-4 py-2.5 text-right font-medium">شروع/آخرین اجرا</th><th className="px-4 py-2.5 text-right font-medium">اجرای بعدی</th><th className="px-4 py-2.5 text-right font-medium">مدت</th><th className="px-4 py-2.5 text-left font-medium">کنترل</th></tr></thead>
            <tbody>
              {filtered.map(job => {
                const pending = jobAction.isPending && jobAction.variables?.jobName === job.name;
                const currentState = job.is_running ? "Running" : job.enabled ? "Idle" : "Disabled";
                return (
                  <tr key={job.name} className={`border-b border-border/30 transition-colors hover:bg-violet-500/[.035] ${/fail/i.test(job.last_run_status) && !job.is_running ? "bg-danger/[.025]" : ""}`}>
                    <td className="px-4 py-3"><div className="max-w-[300px] truncate font-bold text-textMain" dir="ltr">{job.name}</div><div className="mt-1 max-w-[300px] truncate text-[10px] text-textMuted">{job.category || "بدون دسته"}{job.last_message ? ` · ${job.last_message}` : ""}</div></td>
                    <td className="px-4 py-3"><Badge variant={currentState === "Running" ? "primary" : currentState === "Disabled" ? "muted" : "success"}>{pending ? <><LoaderCircle className="h-3 w-3 animate-spin" />در حال اعمال</> : <><span className={`h-1.5 w-1.5 rounded-full ${currentState === "Running" ? "animate-pulse bg-violet-300" : currentState === "Idle" ? "bg-emerald-300" : "bg-slate-500"}`} />{currentState}</>}</Badge>{job.is_running && job.running_since && <div className="mt-1 text-[9px] text-violet-300">از {formatDate(job.running_since)}</div>}</td>
                    <td className="px-4 py-3"><Badge variant={getStatusVariant(job.last_run_status)}>{job.last_run_status || "Never Run"}</Badge></td>
                    <td className="px-4 py-3 text-xs text-textMuted">{formatDate(job.last_run_datetime)}</td>
                    <td className="px-4 py-3 text-xs text-textMuted">{formatDate(job.next_run_datetime)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-textMuted">{job.last_run_duration || "-"}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => runAction(job.name, "Start")} disabled={pending || job.is_running || !job.enabled} title="Run"><Play className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => runAction(job.name, "Stop")} disabled={pending || !job.is_running} title="Stop"><Square className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => runAction(job.name, "Restart")} disabled={pending || !job.enabled} title="Restart"><RotateCcw className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => runAction(job.name, job.enabled ? "Disable" : "Enable")} disabled={pending || (job.enabled && job.is_running)} title={job.enabled ? "Disable" : "Enable"}>{job.enabled ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}</Button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && <div className="grid h-48 place-content-center text-center text-xs text-slate-500"><Clock3 className="mx-auto mb-3 h-8 w-8 text-violet-400/35" />Job مطابق فیلتر پیدا نشد.</div>}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="rounded-2xl border border-white/5 bg-black/15 p-3 text-center"><div className={`font-mono text-2xl font-black ${tone}`}>{value}</div><div className="mt-1 text-[10px] text-slate-500">{label}</div></div>; }
function JobsSkeleton() { return <div className="space-y-4"><div className="h-44 animate-pulse rounded-3xl bg-cardSoft/70" /><div className="h-72 animate-pulse rounded-3xl bg-cardSoft/70" /></div>; }
