import { useDiskInfo } from "../../hooks/useQueries";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { DiskBarChart } from "../charts/index";
import { HardDrive, RefreshCw } from "lucide-react";
import { formatNumber, formatPercent } from "../../lib/utils";

interface DiskTabProps { serverId: string | null }

export function DiskTab({ serverId }: DiskTabProps) {
  const { data: disks, isLoading, isError, error, isFetching, refetch } = useDiskInfo(serverId);
  if (!serverId) return null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-3xl border border-border/80 bg-card p-5 space-y-3">
            <div className="skeleton-pulse h-6 w-32 rounded-xl bg-cardSoft/70" />
            <div className="skeleton-pulse h-16 w-full rounded-2xl bg-cardSoft/70" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) return <div className="grid min-h-[45vh] place-content-center text-center text-textMuted"><HardDrive className="mx-auto mb-3 h-10 w-10 text-rose-400/60" /><h3 className="text-sm font-bold text-rose-200">خواندن ظرفیت دیسک ناموفق بود</h3><p className="mx-auto mt-2 max-w-lg whitespace-pre-line text-xs leading-6 text-slate-500">{error instanceof Error ? error.message : "ارتباط با Windows Storage برقرار نشد."}</p><Button className="mx-auto mt-4" variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /> تلاش دوباره</Button></div>;

  if (!disks || disks.length === 0) {
    return (
      <div className="text-center py-16 text-textMuted">
        <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="font-bold">هیچ درایوی شناسایی نشد</p>
      </div>
    );
  }

  const chartData = disks.map((d) => ({
    name: d.Drive.replace(":", ""),
    usedGB: Number(d.UsedGB || 0),
    freeGB: Number(d.FreeGB || 0),
    totalGB: Number(d.TotalGB || 0),
    usedPercent: Number(d.UsedPercent || 0),
  }));

  const totalCapacity = disks.reduce((sum, disk) => sum + Number(disk.TotalGB || 0), 0);
  const totalFree = disks.reduce((sum, disk) => sum + Number(disk.FreeGB || 0), 0);
  const totalUsed = Math.max(0, totalCapacity - totalFree);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div><h2 className="font-black text-textMain text-lg">ظرفیت ذخیره‌سازی</h2><p className="mt-1 text-[11px] text-textMuted">اعداد بر پایه GiB واقعی سیستم‌عامل (۱ GiB = 1024³ byte)</p></div>
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          تازه‌سازی
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <CapacityFact label="کل ظرفیت" value={totalCapacity} tone="text-violet-300" />
        <CapacityFact label="مصرف‌شده" value={totalUsed} tone="text-slate-200" />
        <CapacityFact label="فضای آزاد" value={totalFree} tone="text-emerald-300" />
      </div>

      {/* Chart */}
      <Card>
        <CardContent>
          <div className="mb-3 flex items-center justify-between"><h3 className="font-bold text-textMain">ظرفیت واقعی هر درایو</h3><div className="flex gap-3 text-[10px] text-slate-500"><span><i className="ml-1 inline-block h-2 w-2 rounded-sm bg-violet-500" />مصرف</span><span><i className="ml-1 inline-block h-2 w-2 rounded-sm bg-slate-800" />آزاد</span></div></div>
          <DiskBarChart data={chartData} />
        </CardContent>
      </Card>

      {/* Disk Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {disks.map((d) => (
          <div
            key={d.Drive}
            className={`rounded-3xl border bg-card p-4 transition-all duration-200 ${
              d.UsedPercent >= 90 ? "border-danger/40" : d.UsedPercent >= 80 ? "border-warning/40" : "border-border/80"
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-primary" />
                  <span className="font-bold text-textMain">{d.Drive}</span>
                </div>
                <div className="text-xs text-textMuted mt-1">
                  {d.VolumeName || "-"} | {d.FileSystem || "-"} | {d.DriveType || "-"}
                </div>
              </div>
              <Badge variant={d.UsedPercent >= 90 ? "danger" : d.UsedPercent >= 80 ? "warning" : "success"}>
                {formatPercent(Number(d.UsedPercent || 0))}
              </Badge>
            </div>

            <div className="h-2.5 rounded-full bg-border/60 overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  d.UsedPercent >= 90 ? "bg-danger" : d.UsedPercent >= 80 ? "bg-warning" : "bg-success"
                }`}
                style={{ width: `${Math.min(d.UsedPercent, 100)}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs text-textMuted">
              <div><span className="font-medium text-textMain">{formatNumber(Number(d.UsedGB || 0), 2)}</span> GiB مصرف</div>
              <div><span className="font-medium text-emerald-300">{formatNumber(Number(d.FreeGB || 0), 2)}</span> GiB آزاد</div>
              <div><span className="font-medium text-textMain">{formatNumber(Number(d.TotalGB || 0), 2)}</span> GiB کل</div>
            </div>

            <div className="mt-2 flex justify-between text-[10px] text-textMuted"><span>{d.ProviderName ? `Provider: ${d.ProviderName}` : d.Source === "PSDriveFallback" ? "منبع جایگزین PowerShell" : "منبع: Windows CIM"}</span><span>{formatPercent(Number(d.FreePercent ?? 100 - d.UsedPercent))} آزاد</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CapacityFact({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="rounded-2xl border border-white/5 bg-white/[.025] p-3"><div className={`font-mono text-lg font-black ${tone}`}>{formatNumber(value, 2)} <span className="text-[10px] text-slate-600">GiB</span></div><div className="mt-1 text-[10px] text-slate-500">{label}</div></div>; }
