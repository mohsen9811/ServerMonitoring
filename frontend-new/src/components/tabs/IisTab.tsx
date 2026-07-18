import { useIIS } from "../../hooks/useQueries";
import { iisApi } from "../../services/api";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SimpleBarChart } from "../charts/index";
import { Globe, RefreshCw, Play, Square, RotateCcw } from "lucide-react";
import { getStatusVariant } from "../../lib/utils";
import { useToast } from "../ui/Toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface IisTabProps { serverId: string | null }

export function IisTab({ serverId }: IisTabProps) {
  const { data: iis, isLoading, refetch } = useIIS(serverId);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const actionMut = useMutation({
    mutationFn: ({ type, name, action }: { type: "site" | "pool"; name: string; action: string }) =>
      iisApi.action(serverId!, type, name, action).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["iis", serverId] });
      showToast("عملیات IIS با موفقیت انجام شد", "success");
    },
    onError: (err: any) => showToast(err.message, "error"),
  });

  if (!serverId) return null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-3xl border border-border/80 bg-card p-5 space-y-3">
            <div className="skeleton-pulse h-5 w-40 rounded-xl bg-cardSoft/70" />
            <div className="skeleton-pulse h-32 w-full rounded-2xl bg-cardSoft/70" />
          </div>
        ))}
      </div>
    );
  }

  const sites = iis?.sites ?? [];
  const pools = iis?.pools ?? [];
  const sitesStarted = sites.filter((s) => s.state === "Started").length;
  const poolsStarted = pools.filter((p) => p.state === "Started").length;

  const siteChart = [
    { name: "Started", value: sitesStarted, fill: "#10b981" },
    { name: "Stopped", value: sites.length - sitesStarted, fill: "#ef4444" },
  ];
  const poolChart = [
    { name: "Started", value: poolsStarted, fill: "#10b981" },
    { name: "Stopped", value: pools.length - poolsStarted, fill: "#ef4444" },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-textMain text-lg">IIS / Application Pools</h2>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" /> رفرش
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <div className="p-4">
            <h3 className="font-bold text-textMain mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> Web Sites
            </h3>
            <SimpleBarChart data={siteChart} height={120} />
            <div className="text-xs text-textMuted mt-2">{sites.length} سایت | {sitesStarted} فعال</div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <h3 className="font-bold text-textMain mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> Application Pools
            </h3>
            <SimpleBarChart data={poolChart} height={120} />
            <div className="text-xs text-textMuted mt-2">{pools.length} Pool | {poolsStarted} فعال</div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
          <span className="font-bold">Web Sites</span>
          <Badge variant="primary">{sites.length}</Badge>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs text-textMuted">
                <th className="text-right px-4 py-2.5 font-medium">Site</th>
                <th className="text-right px-4 py-2.5 font-medium">State</th>
                <th className="text-right px-4 py-2.5 font-medium">Binding</th>
                <th className="text-right px-4 py-2.5 font-medium">Path</th>
                <th className="text-left px-4 py-2.5 font-medium">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.name} className="border-b border-border/30 hover:bg-primaryLight/30 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-textMain">{s.name}</td>
                  <td className="px-4 py-2.5"><Badge variant={getStatusVariant(s.state)}>{s.state}</Badge></td>
                  <td className="px-4 py-2.5 text-textMuted font-mono text-xs" dir="ltr">{s.bindings}</td>
                  <td className="px-4 py-2.5 text-textMuted text-xs" dir="ltr">{s.physicalPath}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => actionMut.mutate({ type: "site", name: s.name, action: "Start" })} disabled={s.state === "Started"}>
                        <Play className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => actionMut.mutate({ type: "site", name: s.name, action: "Stop" })} disabled={s.state !== "Started"}>
                        <Square className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => actionMut.mutate({ type: "site", name: s.name, action: "Restart" })}>
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
          <span className="font-bold">Application Pools</span>
          <Badge variant="primary">{pools.length}</Badge>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs text-textMuted">
                <th className="text-right px-4 py-2.5 font-medium">App Pool</th>
                <th className="text-right px-4 py-2.5 font-medium">State</th>
                <th className="text-right px-4 py-2.5 font-medium">Runtime</th>
                <th className="text-right px-4 py-2.5 font-medium">Pipeline</th>
                <th className="text-left px-4 py-2.5 font-medium">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((p) => (
                <tr key={p.name} className="border-b border-border/30 hover:bg-primaryLight/30 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-textMain">{p.name}</td>
                  <td className="px-4 py-2.5"><Badge variant={getStatusVariant(p.state)}>{p.state}</Badge></td>
                  <td className="px-4 py-2.5 text-textMuted">{p.managedRuntimeVersion}</td>
                  <td className="px-4 py-2.5 text-textMuted">{p.managedPipelineMode}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => actionMut.mutate({ type: "pool", name: p.name, action: "Start" })} disabled={p.state === "Started"}>
                        <Play className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => actionMut.mutate({ type: "pool", name: p.name, action: "Stop" })} disabled={p.state !== "Started"}>
                        <Square className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => actionMut.mutate({ type: "pool", name: p.name, action: "Recycle" })}>
                        <RotateCcw className="w-3.5 h-3.5" />
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
