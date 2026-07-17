import { useState } from "react";
import { useJobs, useJobAction } from "../../hooks/useQueries";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SearchInput, Select } from "../ui/SearchInput";
import { SimpleBarChart } from "../charts/index";
import { RefreshCw, Play, Square, ToggleLeft, ToggleRight } from "lucide-react";
import { formatDate, getStatusVariant } from "../../lib/utils";

interface JobsTabProps { serverId: string | null }

export function JobsTab({ serverId }: JobsTabProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const { data: jobs, isLoading } = useJobs(serverId);
  const jobAction = useJobAction();

  if (!serverId) return null;

  const normalizedFilter = filter === "all" ? "" : filter;
  const filtered = (jobs ?? []).filter((j) => {
    const term = search.toLowerCase();
    const textMatch = !term || j.name.toLowerCase().includes(term) || (j.last_message || "").toLowerCase().includes(term);
    if (!textMatch) return false;
    if (normalizedFilter === "failed") return /fail/i.test(j.last_run_status);
    if (normalizedFilter === "running") return j.is_running;
    if (normalizedFilter === "succeeded") return /succeed/i.test(j.last_run_status);
    if (normalizedFilter === "disabled") return !j.enabled;
    return true;
  });

  const runningCount = jobs?.filter((j) => j.is_running).length ?? 0;
  const failedCount = jobs?.filter((j) => /fail/i.test(j.last_run_status)).length ?? 0;
  const disabledCount = jobs?.filter((j) => !j.enabled).length ?? 0;
  const succeededCount = jobs ? jobs.length - runningCount - failedCount - disabledCount : 0;

  const chartData = [
    { name: "Running", value: runningCount, fill: "#3b82f6" },
    { name: "Failed", value: failedCount, fill: "#ef4444" },
    { name: "Disabled", value: disabledCount, fill: "#f59e0b" },
    { name: "Succeeded", value: Math.max(0, succeededCount), fill: "#10b981" },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="skeleton-pulse h-10 w-full rounded-2xl bg-cardSoft/70" />
        <div className="skeleton-pulse h-64 w-full rounded-3xl bg-cardSoft/70" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-textMain text-lg">SQL Agent Jobs</h2>
        <Button variant="secondary" size="sm">
          <RefreshCw className="w-4 h-4" /> رفرش
        </Button>
      </div>

      {/* Chart */}
      <Card>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-bold text-textMain mb-2">وضعیت Jobs</h3>
              <SimpleBarChart data={chartData} height={160} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-primaryLight/50 p-3.5 text-center">
                <div className="text-2xl font-black text-primary">{jobs?.length ?? 0}</div>
                <div className="text-xs text-textMuted font-medium">کل Jobs</div>
              </div>
              <div className="rounded-2xl bg-success/5 p-3.5 text-center">
                <div className="text-2xl font-black text-success">{runningCount}</div>
                <div className="text-xs text-textMuted font-medium">در حال اجرا</div>
              </div>
              <div className="rounded-2xl bg-danger/5 p-3.5 text-center">
                <div className="text-2xl font-black text-danger">{failedCount}</div>
                <div className="text-xs text-textMuted font-medium">Failed</div>
              </div>
              <div className="rounded-2xl bg-warning/5 p-3.5 text-center">
                <div className="text-2xl font-black text-warning">{disabledCount}</div>
                <div className="text-xs text-textMuted font-medium">Disabled</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <div className="flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="جستجوی Job..." />
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "همه وضعیت‌ها" },
              { value: "failed", label: "Failed" },
              { value: "running", label: "Running" },
              { value: "succeeded", label: "Succeeded" },
              { value: "disabled", label: "Disabled" },
            ]}
          />
        </div>
      </div>

      {/* Jobs Table */}
      <Card>
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
          <span className="font-bold">لیست Jobs</span>
          <Badge variant="primary">{filtered.length}/{jobs?.length ?? 0}</Badge>
        </div>
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 420px)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs text-textMuted sticky top-0 bg-card">
                <th className="text-right px-4 py-2.5 font-medium">Job</th>
                <th className="text-right px-4 py-2.5 font-medium">وضعیت</th>
                <th className="text-right px-4 py-2.5 font-medium">آخرین اجرا</th>
                <th className="text-right px-4 py-2.5 font-medium">اجرای بعدی</th>
                <th className="text-right px-4 py-2.5 font-medium">مدت</th>
                <th className="text-right px-4 py-2.5 font-medium">Category</th>
                <th className="text-left px-4 py-2.5 font-medium">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => (
                <tr key={j.name} className={`border-b border-border/30 hover:bg-primaryLight/30 transition-colors ${/fail/i.test(j.last_run_status) ? "bg-danger/5" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-bold text-textMain truncate max-w-[280px]">{j.name}</div>
                    {j.last_message && <div className="text-[11px] text-textMuted truncate max-w-[280px]">{j.last_message}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={j.is_running ? "primary" : getStatusVariant(j.last_run_status)}>
                      {j.is_running ? "Running" : j.enabled ? j.last_run_status || "Never Run" : "Disabled"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-textMuted text-xs">{formatDate(j.last_run_datetime)}</td>
                  <td className="px-4 py-2.5 text-textMuted text-xs">{formatDate(j.next_run_datetime)}</td>
                  <td className="px-4 py-2.5 text-textMuted text-xs">{j.last_run_duration || "-"}</td>
                  <td className="px-4 py-2.5 text-textMuted text-xs">{j.category || "-"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => jobAction.mutate({ serverId, jobName: j.name, action: "Start" })} disabled={j.is_running || !j.enabled} title="Run">
                        <Play className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => jobAction.mutate({ serverId, jobName: j.name, action: "Stop" })} disabled={!j.is_running} title="Stop">
                        <Square className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => jobAction.mutate({ serverId, jobName: j.name, action: j.enabled ? "Disable" : "Enable" })} title={j.enabled ? "Disable" : "Enable"}>
                        {j.enabled ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
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