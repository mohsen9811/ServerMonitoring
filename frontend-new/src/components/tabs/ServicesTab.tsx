import { servicesApi } from "../../services/api";
import { useServices } from "../../hooks/useQueries";
import { useToast } from "../ui/Toast";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Wrench, RefreshCw, Plus, Play, Square, RotateCcw, Trash2 } from "lucide-react";
import { getStatusVariant } from "../../lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ServicesTabProps { serverId: string | null }

export function ServicesTab({ serverId }: ServicesTabProps) {
  if (!serverId) return null;
  const { data: services, isLoading, refetch } = useServices(serverId);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const serviceAction = useMutation({
    mutationFn: ({ service, action, force }: { service: string; action: string; force?: boolean }) =>
      servicesApi.action(serverId, service, action, force).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services", serverId] });
      showToast("عملیات سرویس با موفقیت انجام شد", "success");
    },
    onError: (err: any) => showToast(err.message, "error"),
  });

  const removeService = useMutation({
    mutationFn: (serviceName: string) => servicesApi.remove(serverId, serviceName).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services", serverId] });
      showToast("سرویس از نظارت حذف شد", "success");
    },
    onError: (err: any) => showToast(err.message, "error"),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-3xl border border-border/80 bg-card p-5 space-y-3">
            <div className="skeleton-pulse h-5 w-40 rounded-xl bg-cardSoft/70" />
            <div className="skeleton-pulse h-3 w-24 rounded-xl bg-cardSoft/70" />
            <div className="skeleton-pulse h-8 w-full rounded-2xl bg-cardSoft/70" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-textMain text-lg">سرویس‌ها</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            <Plus className="w-4 h-4" />
            افزودن
          </Button>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
            رفرش
          </Button>
        </div>
      </div>

      {services && services.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {services.map((s) => (
            <Card key={s.Name}>
              <CardContent>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${s.Status === "Running" ? "bg-success" : "bg-danger"}`} />
                      <span className="font-bold text-textMain truncate">{s.Name}</span>
                    </div>
                    <div className="text-xs text-textMuted mt-1 truncate">{s.DisplayName}</div>
                  </div>
                  <Badge variant={getStatusVariant(s.Status)}>{s.Status}</Badge>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => serviceAction.mutate({ service: s.Name, action: "Start" })} disabled={s.Status === "Running"}>
                    <Play className="w-3.5 h-3.5" /> شروع
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => serviceAction.mutate({ service: s.Name, action: "Stop" })} disabled={s.Status !== "Running"}>
                    <Square className="w-3.5 h-3.5" /> توقف
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => serviceAction.mutate({ service: s.Name, action: "Restart" })}>
                    <RotateCcw className="w-3.5 h-3.5" /> ریستارت
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => removeService.mutate(s.Name)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-textMuted">
          <Wrench className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-bold">سرویسی ثبت نشده</p>
          <p className="text-sm mt-1">با کلیک روی افزودن، سرویس‌های جدید را مانیتور کنید</p>
        </div>
      )}
    </div>
  );
}