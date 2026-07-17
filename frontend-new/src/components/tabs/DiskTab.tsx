import { useDiskInfo } from "../../hooks/useQueries";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { DiskBarChart } from "../charts/index";
import { HardDrive, RefreshCw } from "lucide-react";
import { formatNumber, formatPercent } from "../../lib/utils";

interface DiskTabProps { serverId: string | null }

export function DiskTab({ serverId }: DiskTabProps) {
  if (!serverId) return null;
  const { data: disks, isLoading, refetch } = useDiskInfo(serverId);

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
    used: Math.round(d.UsedPercent),
    free: 100 - Math.round(d.UsedPercent),
    total: d.TotalGB,
  }));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-textMain text-lg">دیسک‌ها</h2>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
          رفرش
        </Button>
      </div>

      {/* Chart */}
      <Card>
        <CardContent>
          <h3 className="font-bold text-textMain mb-2">مصرف دیسک‌ها</h3>
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
                {formatPercent(d.UsedPercent)}
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
              <div><span className="font-medium text-textMain">{formatNumber(d.UsedGB, 1)}</span> GB مصرف</div>
              <div><span className="font-medium text-textMain">{formatNumber(d.FreeGB, 1)}</span> GB خالی</div>
              <div><span className="font-medium text-textMain">{formatNumber(d.TotalGB, 1)}</span> GB کل</div>
            </div>

            {d.ProviderName && <div className="mt-2 text-[10px] text-textMuted">Provider: {d.ProviderName}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}