import { useState } from "react";
import { useCreditOperations, useCreditHistory, useRunCreditOperation } from "../../hooks/useQueries";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CreditCard, RefreshCw, Plus, Play, History } from "lucide-react";
import { formatDate } from "../../lib/utils";

interface CreditTabProps { serverId: string | null }

export function CreditTab({ serverId }: CreditTabProps) {
  const { data: operations } = useCreditOperations(serverId);
  const { data: history } = useCreditHistory(serverId);
  const runOp = useRunCreditOperation();
  const [result, setResult] = useState<any>(null);

  if (!serverId) return null;

  const handleRun = (op: any) => {
    runOp.mutate(
      { serverId, operationId: op.id, params: {} },
      { onSuccess: (data) => setResult(data) }
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-textMain text-lg flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          سامانه اعتباری
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm"><Plus className="w-4 h-4" /> تعریف عملیات</Button>
          <Button variant="secondary" size="sm"><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Operations */}
        <Card>
          <CardContent>
            <h3 className="font-bold text-textMain mb-3">عملیات‌های دستی</h3>
            {operations && operations.length > 0 ? (
              <div className="space-y-2">
                {operations.map((op) => (
                  <div key={op.id} className="rounded-2xl border border-border/60 bg-cardSoft/50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-textMain text-sm">{op.title}</div>
                        <div className="text-xs text-textMuted font-mono mt-0.5">{op.database}.{op.procedure}</div>
                        {op.description && <div className="text-xs text-textMuted mt-1">{op.description}</div>}
                      </div>
                      <Button variant="primary" size="sm" onClick={() => handleRun(op)} disabled={runOp.isPending}>
                        <Play className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-textMuted text-sm py-6 text-center">
                عملیاتی تعریف نشده است. با کلیک روی تعریف عملیات، یک SP جدید اضافه کنید.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Result */}
        <Card>
          <CardContent>
            <h3 className="font-bold text-textMain mb-3">نتیجه اجرا</h3>
            {result ? (
              <div className="space-y-2">
                <div className="rounded-2xl bg-cardSoft/70 p-3 text-xs font-mono text-textMain overflow-auto max-h-96" dir="ltr">
                  {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
                </div>
                <div className="text-xs text-textMuted">
                  مدت: {result.duration ?? "?"}ms
                </div>
              </div>
            ) : (
              <p className="text-textMuted text-sm py-12 text-center">
                یک عملیات را اجرا کنید تا خروجی اینجا نمایش داده شود
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card>
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
          <span className="font-bold flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            تاریخچه اجرا
          </span>
          <Badge variant="primary">{history?.length ?? 0}</Badge>
        </div>
        <div className="overflow-auto max-h-72">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs text-textMuted sticky top-0 bg-card">
                <th className="text-right px-4 py-2.5 font-medium">عملیات</th>
                <th className="text-right px-4 py-2.5 font-medium">وضعیت</th>
                <th className="text-right px-4 py-2.5 font-medium">Database</th>
                <th className="text-right px-4 py-2.5 font-medium">SP</th>
                <th className="text-right px-4 py-2.5 font-medium">مدت</th>
                <th className="text-right px-4 py-2.5 font-medium">زمان</th>
              </tr>
            </thead>
            <tbody>
              {(history ?? []).slice(0, 30).map((h) => (
                <tr key={h.id} className="border-b border-border/30 hover:bg-primaryLight/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-textMain">{h.operationTitle}</td>
                  <td className="px-4 py-2.5"><Badge variant={h.status === "success" ? "success" : "danger"}>{h.status}</Badge></td>
                  <td className="px-4 py-2.5 text-textMuted font-mono text-xs">{h.database}</td>
                  <td className="px-4 py-2.5 text-textMuted font-mono text-xs">{h.procedure}</td>
                  <td className="px-4 py-2.5 text-textMuted">{h.duration}ms</td>
                  <td className="px-4 py-2.5 text-textMuted text-xs">{formatDate(h.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}