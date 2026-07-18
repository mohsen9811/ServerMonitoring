import { useDatabases } from "../../hooks/useQueries";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SimpleBarChart } from "../charts/index";
import { Database, RefreshCw } from "lucide-react";
import { formatNumber, getStatusVariant } from "../../lib/utils";

interface DatabasesTabProps { serverId: string | null }

export function DatabasesTab({ serverId }: DatabasesTabProps) {
  const { data: databases, isLoading, refetch } = useDatabases(serverId);
  if (!serverId) return null;

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="skeleton-pulse h-10 w-full rounded-2xl bg-cardSoft/70" />
        <div className="skeleton-pulse h-64 w-full rounded-3xl bg-cardSoft/70" />
      </div>
    );
  }

  if (!databases || databases.length === 0) {
    return (
      <div className="text-center py-16 text-textMuted">
        <Database className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="font-bold">دیتابیسی یافت نشد</p>
      </div>
    );
  }

  const online = databases.filter((d) => (d.status || "").toLowerCase() === "online").length;
  const notSynced = databases.filter((d) => d.ha_type !== "Standalone" && d.is_synchronized === false).length;
  const standalone = databases.filter((d) => d.ha_type === "Standalone").length;
  const agDatabases = databases.length - standalone;

  const chartData = [
    { name: "Online", value: online, fill: "#10b981" },
    { name: "Not Synced", value: notSynced, fill: "#f59e0b" },
    { name: "Other", value: Math.max(0, databases.length - online - notSynced), fill: "#3b82f6" },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-textMain text-lg">Database / HA</h2>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" /> رفرش
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border/80 bg-card p-3.5 text-center">
          <div className="text-2xl font-black text-primary">{formatNumber(databases.length)}</div>
          <div className="text-xs text-textMuted font-medium">کل دیتابیس‌ها</div>
        </div>
        <div className="rounded-2xl border border-border/80 bg-card p-3.5 text-center">
          <div className="text-2xl font-black text-success">{formatNumber(online)}</div>
          <div className="text-xs text-textMuted font-medium">Online</div>
        </div>
        <div className="rounded-2xl border border-border/80 bg-card p-3.5 text-center">
          <div className="text-2xl font-black text-primary">{formatNumber(agDatabases)}</div>
          <div className="text-xs text-textMuted font-medium">HA / AG</div>
        </div>
        <div className="rounded-2xl border border-border/80 bg-card p-3.5 text-center">
          <div className={`text-2xl font-black ${notSynced ? "text-warning" : "text-success"}`}>{formatNumber(notSynced)}</div>
          <div className="text-xs text-textMuted font-medium">Not Synced</div>
        </div>
      </div>

      {/* Chart */}
      <Card>
        <div className="px-4 py-3 border-b border-border/60">
          <span className="font-bold">وضعیت دیتابیس‌ها</span>
        </div>
        <div className="p-4">
          <SimpleBarChart data={chartData} height={180} />
        </div>
      </Card>

      {/* Databases Table */}
      <Card>
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
          <span className="font-bold">لیست دیتابیس‌ها</span>
          <Badge variant="primary">{databases.length}</Badge>
        </div>
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 480px)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs text-textMuted sticky top-0 bg-card">
                <th className="text-right px-4 py-2.5 font-medium">نام</th>
                <th className="text-right px-4 py-2.5 font-medium">وضعیت</th>
                <th className="text-right px-4 py-2.5 font-medium">Recovery</th>
                <th className="text-right px-4 py-2.5 font-medium">حجم MB</th>
                <th className="text-right px-4 py-2.5 font-medium">HA / AG</th>
                <th className="text-right px-4 py-2.5 font-medium">Sync</th>
                <th className="text-right px-4 py-2.5 font-medium">Queue</th>
              </tr>
            </thead>
            <tbody>
              {databases.map((db) => (
                <tr key={db.name} className="border-b border-border/30 hover:bg-primaryLight/30 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-textMain">{db.name}</td>
                  <td className="px-4 py-2.5"><Badge variant={getStatusVariant(db.status)}>{db.status}</Badge></td>
                  <td className="px-4 py-2.5 text-textMuted">{db.recovery_model || "-"}</td>
                  <td className="px-4 py-2.5 text-textMuted font-mono">{formatNumber(db.size_mb ?? 0)}</td>
                  <td className="px-4 py-2.5 text-textMuted">{db.ha_type === "Standalone" ? "Standalone" : `${db.availability_group || "AG"} (${db.replica_summary?.length || 0})`}</td>
                  <td className="px-4 py-2.5">
                    {db.ha_type === "Standalone" ? (
                      <span className="text-textMuted">-</span>
                    ) : (
                      <Badge variant={db.is_synchronized ? "success" : "danger"}>
                        {db.is_synchronized ? "Synced" : "Not Synced"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-textMuted text-xs">
                    {db.ha_type === "Standalone" ? "-" : `Log: ${db.log_send_queue_size ?? 0} | Redo: ${db.redo_queue_size ?? 0}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
