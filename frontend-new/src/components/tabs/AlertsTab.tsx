import { useAlerts } from "../../hooks/useQueries";
import { useAlertStore } from "../../stores/alertStore";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { RefreshCw, Globe, AlertTriangle, CheckCircle, X } from "lucide-react";
import { formatRelativeTime, getStatusVariant } from "../../lib/utils";

interface AlertsTabProps { serverId: string | null }

export function AlertsTab({ serverId }: AlertsTabProps) {
  const { alerts, acknowledgeAlert } = useAlertStore();
  const { refetch } = useAlerts(serverId ?? undefined);

  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warning = alerts.filter((a) => a.severity === "warning").length;
  const info = alerts.filter((a) => a.severity === "info").length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-textMain text-lg">هشدارها</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" /> به‌روزرسانی
          </Button>
          <Button variant="outline" size="sm">
            <Globe className="w-4 h-4" /> همه سرورها
          </Button>
        </div>
      </div>

      {/* Counter Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-textMuted">Critical</span>
            <span className="text-2xl font-black text-danger">{critical}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-textMuted">Warning</span>
            <span className="text-2xl font-black text-warning">{warning}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-primary/30 bg-primaryLight p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-textMuted">Info</span>
            <span className="text-2xl font-black text-primary">{info}</span>
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <Card>
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
          <span className="font-bold">لیست هشدارها</span>
          <Badge variant={alerts.length > 0 ? "danger" : "success"}>{alerts.length}</Badge>
        </div>
        <div className="divide-y divide-border/30">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-textMuted">
              <CheckCircle className="w-12 h-12 text-success mb-3" />
              <span className="font-bold">همه چیز پایدار است</span>
              <span className="text-sm">هشدار فعالی وجود ندارد</span>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 transition-colors hover:bg-primaryLight/30 ${alert.severity === "critical" ? "bg-danger/5 border-r-4 border-r-danger" : alert.severity === "warning" ? "border-r-4 border-r-warning" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${alert.severity === "critical" ? "text-danger" : "text-warning"}`} />
                    <div>
                      <div className="font-bold text-textMain">{alert.title}</div>
                      <div className="text-sm text-textMuted mt-1">{alert.message}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant={getStatusVariant(alert.severity)}>{alert.severity}</Badge>
                        <span className="text-xs text-textMuted">{alert.serverName}</span>
                        <span className="text-xs text-textMuted">{formatRelativeTime(alert.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                  {!alert.acknowledged && (
                    <Button variant="ghost" size="icon" onClick={() => acknowledgeAlert(alert.id)} title="تأیید">
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}