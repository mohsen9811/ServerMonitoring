import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { servicesApi } from "../../services/api";
import { useAllServices, useServices } from "../../hooks/useQueries";
import { useToast } from "../ui/Toast";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SearchInput } from "../ui/SearchInput";
import { Wrench, RefreshCw, Plus, Play, Square, RotateCcw, Trash2, Power, X, LoaderCircle } from "lucide-react";
import { getStatusVariant } from "../../lib/utils";

interface ServicesTabProps { serverId: string | null }

const pendingStates = new Set(["StartPending", "StopPending", "ContinuePending", "PausePending"]);

export function ServicesTab({ serverId }: ServicesTabProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: services = [], isLoading, isError, error, refetch, isFetching } = useServices(serverId);
  const { data: allServices = [], isFetching: allLoading, isError: allServicesError, error: allError, refetch: refetchAll } = useAllServices(addOpen ? serverId : null);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const refresh = async () => {
    await Promise.all([refetch(), addOpen ? refetchAll() : Promise.resolve()]);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["services", serverId] });
    queryClient.invalidateQueries({ queryKey: ["overview", serverId] });
    queryClient.invalidateQueries({ queryKey: ["alerts", serverId] });
  };

  const serviceAction = useMutation({
    mutationFn: ({ service, action, force }: { service: string; action: string; force?: boolean }) =>
      servicesApi.action(serverId!, service, action, force).then((r) => r.data),
    onSuccess: (_, variables) => {
      invalidate();
      showToast(`عملیات ${variables.action} برای ${variables.service} انجام شد.`, "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const addService = useMutation({
    mutationFn: (serviceName: string) => servicesApi.add(serverId!, serviceName, true).then((r) => r.data),
    onSuccess: (_, serviceName) => {
      invalidate();
      showToast(`${serviceName} به پایش اضافه شد.`, "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const removeService = useMutation({
    mutationFn: (serviceName: string) => servicesApi.remove(serverId!, serviceName).then((r) => r.data),
    onSuccess: () => { invalidate(); showToast("سرویس از نظارت حذف شد", "success"); },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const monitored = useMemo(() => new Set(services.map(item => item.Name.toLowerCase())), [services]);
  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allServices.filter(item => !monitored.has(item.Name.toLowerCase()) && (!term || `${item.Name} ${item.DisplayName}`.toLowerCase().includes(term)));
  }, [allServices, monitored, search]);

  const counts = {
    running: services.filter(item => item.Status === "Running").length,
    stopped: services.filter(item => item.Status === "Stopped").length,
    pending: services.filter(item => pendingStates.has(item.Status)).length,
    disabled: services.filter(item => item.StartType === "Disabled").length,
  };

  if (!serverId) return null;

  if (isLoading) return <ServiceSkeleton />;
  if (isError) return <LoadError title="خواندن سرویس‌ها ناموفق بود" message={error instanceof Error ? error.message : "ارتباط با سرور برقرار نشد."} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-textMain">کنترل سرویس‌های Windows</h2>
          <p className="mt-1 text-[11px] text-textMuted">وضعیت زنده، نوع Start و همه عملیات اجرایی از همین صفحه</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAddOpen(value => !value)}>
            {addOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{addOpen ? "بستن" : "افزودن سرویس"}
          </Button>
          <Button variant="secondary" size="sm" onClick={refresh} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> تازه‌سازی
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Counter label="Running" value={counts.running} tone="text-emerald-300" />
        <Counter label="Stopped" value={counts.stopped} tone="text-rose-300" />
        <Counter label="در حال تغییر" value={counts.pending} tone="text-amber-300" />
        <Counter label="Disabled" value={counts.disabled} tone="text-violet-300" />
      </div>

      <AnimatePresence initial={false}>
        {addOpen && (
          <motion.section initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Card className="border-violet-400/15 bg-violet-500/[.035]">
              <CardContent>
                <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-200">انتخاب سرویس نصب‌شده</h3><p className="mt-1 text-[10px] text-slate-500">فهرست مستقیم از سرور خوانده می‌شود؛ نیازی به تایپ دقیق نام نیست.</p></div><Badge variant="muted">{available.length} مورد</Badge></div>
                <SearchInput value={search} onChange={setSearch} placeholder="جستجو با Name یا Display Name…" />
                <div className="mt-3 max-h-72 divide-y divide-white/5 overflow-auto rounded-2xl border border-white/5 bg-black/20">
                  {allLoading ? <div className="grid h-28 place-content-center text-xs text-slate-500"><LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />در حال خواندن سرویس‌ها…</div> : allServicesError ? <div className="p-6 text-center text-xs text-rose-300">{allError instanceof Error ? allError.message : "دریافت فهرست سرویس‌ها ناموفق بود."}<div><Button className="mt-3" variant="outline" size="sm" onClick={() => refetchAll()}>تلاش دوباره</Button></div></div> : available.slice(0, 120).map(item => (
                    <div key={item.Name} className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[.025]">
                      <StatusDot status={item.Status} />
                      <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-slate-200" dir="ltr">{item.Name}</div><div className="truncate text-[10px] text-slate-600">{item.DisplayName} · {item.StartType}</div></div>
                      <Button size="sm" variant="outline" disabled={addService.isPending} onClick={() => addService.mutate(item.Name)}><Plus className="h-3.5 w-3.5" /> پایش</Button>
                    </div>
                  ))}
                  {!allLoading && !allServicesError && !available.length && <div className="p-8 text-center text-xs text-slate-500">سرویس دیگری با این عبارت پیدا نشد.</div>}
                </div>
              </CardContent>
            </Card>
          </motion.section>
        )}
      </AnimatePresence>

      {services.length ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {services.map(service => {
            const pending = pendingStates.has(service.Status);
            const actionPending = serviceAction.isPending && serviceAction.variables?.service === service.Name;
            const disabled = service.StartType === "Disabled";
            return (
              <Card key={service.Name} className="transition hover:border-violet-400/15">
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><StatusDot status={service.Status} /><span className="truncate font-bold text-textMain" dir="ltr">{service.Name}</span></div><div className="mt-1 truncate text-xs text-textMuted">{service.DisplayName}</div></div>
                    <div className="flex flex-wrap justify-end gap-1.5"><Badge variant={pending ? "warning" : getStatusVariant(service.Status)}>{statusLabel(service.Status)}</Badge><Badge variant={disabled ? "danger" : "muted"}>{service.StartType || "Unknown"}</Badge></div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => serviceAction.mutate({ service: service.Name, action: "Start" })} disabled={actionPending || service.Status === "Running" || disabled}><Play className="h-3.5 w-3.5" /> شروع</Button>
                    <Button variant="outline" size="sm" onClick={() => serviceAction.mutate({ service: service.Name, action: "Stop" })} disabled={actionPending || service.Status === "Stopped" || service.Status === "NotFound"}><Square className="h-3.5 w-3.5" /> توقف</Button>
                    <Button variant="outline" size="sm" onClick={() => serviceAction.mutate({ service: service.Name, action: "Restart" })} disabled={actionPending || disabled || service.Status === "NotFound"}><RotateCcw className={`h-3.5 w-3.5 ${actionPending && serviceAction.variables?.action === "Restart" ? "animate-spin" : ""}`} /> ریستارت</Button>
                    <Button variant="ghost" size="sm" onClick={() => serviceAction.mutate({ service: service.Name, action: disabled ? "Enable" : "Disable" })} disabled={actionPending || (!disabled && service.Status !== "Stopped")} title={!disabled && service.Status !== "Stopped" ? "برای Disable ابتدا سرویس را متوقف کنید" : undefined}><Power className="h-3.5 w-3.5" /> {disabled ? "Enable" : "Disable"}</Button>
                    <Button variant="danger" size="sm" onClick={() => removeService.mutate(service.Name)} disabled={removeService.isPending}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-violet-400/15 py-16 text-center text-textMuted"><Wrench className="mx-auto mb-3 h-12 w-12 text-violet-400/40" /><p className="font-bold">هنوز سرویسی برای پایش انتخاب نشده</p><p className="mt-1 text-sm">«افزودن سرویس» را بزنید و از فهرست واقعی سرور انتخاب کنید.</p></div>
      )}
    </div>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="rounded-2xl border border-white/5 bg-white/[.025] p-3"><div className={`font-mono text-2xl font-black ${tone}`}>{value}</div><div className="mt-1 text-[10px] text-slate-500">{label}</div></div>; }
function StatusDot({ status }: { status: string }) { const pending = pendingStates.has(status); return <span className={`h-2 w-2 shrink-0 rounded-full ${status === "Running" ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : pending ? "animate-pulse bg-amber-400" : "bg-rose-400"}`} />; }
function statusLabel(status: string) { const labels: Record<string,string> = { Running: "Running", Stopped: "Stopped", StartPending: "در حال شروع", StopPending: "در حال توقف", ContinuePending: "در حال ادامه", PausePending: "در حال Pause", Paused: "Paused", NotFound: "پیدا نشد" }; return labels[status] || status; }
function ServiceSkeleton() { return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{[1,2,3,4].map(i => <div key={i} className="h-36 animate-pulse rounded-3xl bg-cardSoft/70" />)}</div>; }
function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) { return <div className="grid min-h-[45vh] place-content-center text-center"><Wrench className="mx-auto mb-3 h-10 w-10 text-rose-400/60" /><h3 className="text-sm font-bold text-rose-200">{title}</h3><p className="mx-auto mt-2 max-w-lg whitespace-pre-line text-xs leading-6 text-slate-500">{message}</p><Button className="mx-auto mt-4" variant="outline" size="sm" onClick={onRetry}><RefreshCw className="h-4 w-4" /> تلاش دوباره</Button></div>; }
