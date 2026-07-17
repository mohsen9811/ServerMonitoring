import { useQuery } from "@tanstack/react-query";
import { systemApi } from "../../services/api";
import { Card, CardContent } from "../ui/Card";
import { Button } from "../ui/Button";
import { UsageAreaChart } from "../charts/index";
import { Cpu, MemoryStick, Clock, RefreshCw } from "lucide-react";
import { formatNumber, formatPercent, formatUptime, formatDate } from "../../lib/utils";
import { useEffect, useRef, useState } from "react";

interface SystemTabProps { serverId: string | null }

interface DataPoint {
  time: string;
  cpu: number;
  ram: number;
}

export function SystemTab({ serverId }: SystemTabProps) {
  const [enabled, setEnabled] = useState(false);
  const [history, setHistory] = useState<DataPoint[]>([]);
  const prevRef = useRef<string>("");

  const { data: system, isLoading, refetch } = useQuery({
    queryKey: ["system", serverId],
    queryFn: () => systemApi.get(serverId!).then((r) => r.data),
    enabled: !!serverId,
    refetchInterval: enabled ? 5000 : false,
  });

  useEffect(() => {
    if (!system) return;
    const time = new Date().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
    const key = `${time}-${system.cpuPercent}-${system.ramPercent}`;
    if (key === prevRef.current) return;
    prevRef.current = key;
    setHistory((prev) => [...prev, { time, cpu: system.cpuPercent, ram: system.ramPercent }].slice(-20));
  }, [system]);

  if (!serverId) return null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-3xl border border-border/80 bg-card p-5 space-y-3">
            <div className="skeleton-pulse h-10 w-10 rounded-2xl bg-cardSoft/70" />
            <div className="skeleton-pulse h-4 w-20 rounded-xl bg-cardSoft/70" />
            <div className="skeleton-pulse h-8 w-32 rounded-xl bg-cardSoft/70" />
          </div>
        ))}
      </div>
    );
  }

  const cpuPercent = system?.cpuPercent ?? 0;
  const ramPercent = system?.ramPercent ?? 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-textMain text-lg">مانیتورینگ سیستم</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
            رفرش
          </Button>
          <label className="flex items-center gap-2 text-xs font-medium text-textMuted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enabled}
              onChange={() => setEnabled(!enabled)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30"
            />
            خودکار ۵ ثانیه
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl border border-border/80 bg-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-primaryLight flex items-center justify-center text-primary">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-semibold text-textMuted">CPU</div>
              <div className="text-2xl font-black text-textMain">{formatPercent(cpuPercent)}</div>
            </div>
          </div>
          <div className="h-2.5 rounded-full bg-border/60 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${cpuPercent >= 85 ? "bg-danger" : cpuPercent >= 70 ? "bg-warning" : "bg-success"}`}
              style={{ width: `${Math.min(cpuPercent, 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-border/80 bg-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center text-success">
              <MemoryStick className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-semibold text-textMuted">RAM</div>
              <div className="text-2xl font-black text-textMain">{formatPercent(ramPercent)}</div>
            </div>
          </div>
          <div className="h-2.5 rounded-full bg-border/60 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${ramPercent >= 85 ? "bg-danger" : ramPercent >= 70 ? "bg-warning" : "bg-success"}`}
              style={{ width: `${Math.min(ramPercent, 100)}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-textMuted">
            {formatNumber(system?.ramUsedGB ?? 0)} GB / {formatNumber(system?.ramTotalGB ?? 0)} GB
          </div>
        </div>

        <div className="rounded-3xl border border-border/80 bg-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-warning/10 flex items-center justify-center text-warning">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-semibold text-textMuted">Uptime</div>
              <div className="text-2xl font-black text-textMain">{formatUptime(system?.uptimeSeconds ?? 0)}</div>
            </div>
          </div>
          <div className="text-xs text-textMuted">
            آخرین بوت: {formatDate(system?.bootTime)}
          </div>
        </div>
      </div>

      <Card>
        <CardContent>
          <h3 className="font-bold text-textMain mb-3">نمودار لحظه‌ای CPU / RAM</h3>
          <UsageAreaChart data={history.length > 0 ? history : [{ time: "—", cpu: 0, ram: 0 }]} height={250} />
        </CardContent>
      </Card>
    </div>
  );
}