import { useState } from "react";
import { useLinkedServers, useTestLinkedServer, useTestAllLinkedServers } from "../../hooks/useQueries";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { SearchInput, Select } from "../ui/SearchInput";
import { Network, RefreshCw, FlaskConical, CheckCircle, XCircle } from "lucide-react";
import { formatRelativeTime, getStatusVariant } from "../../lib/utils";

interface ConnectivityTabProps { serverId: string | null }

export function ConnectivityTab({ serverId }: ConnectivityTabProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const { data: linked, isLoading } = useLinkedServers(serverId);
  const testAll = useTestAllLinkedServers();
  const testOne = useTestLinkedServer();

  if (!serverId) return null;

  const filtered = (linked ?? []).filter((l) => {
    const term = search.toLowerCase();
    const textMatch = !term || l.name.toLowerCase().includes(term) || (l.data_source || "").toLowerCase().includes(term);
    if (!textMatch) return false;
    if (filter !== "all" && l.status !== filter) return false;
    return true;
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="skeleton-pulse h-10 w-full rounded-2xl bg-cardSoft/70" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton-pulse h-20 w-full rounded-3xl bg-cardSoft/70" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-textMain text-lg">Linked Servers</h2>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => testAll.mutate(serverId)} disabled={testAll.isPending}>
            <FlaskConical className="w-4 h-4" /> تست همه
          </Button>
          <Button variant="secondary" size="sm"><RefreshCw className="w-4 h-4" /> رفرش</Button>
        </div>
      </div>

      <div className="flex gap-3 flex-col sm:flex-row">
        <div className="flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="جستجوی Linked Server..." />
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "همه وضعیت‌ها" },
              { value: "connected", label: "Connected" },
              { value: "failed", label: "Failed" },
              { value: "warning", label: "Warning" },
              { value: "nottested", label: "Not tested" },
            ]}
          />
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-textMuted">
            <Network className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-bold">Linked Serverی یافت نشد</p>
          </div>
        ) : (
          filtered.map((l) => (
            <div
              key={l.name}
              className={`rounded-3xl border bg-card p-4 transition-all duration-200 ${
                l.status === "connected" ? "border-success/30" :
                l.status === "failed" ? "border-danger/30" :
                l.status === "warning" ? "border-warning/30" : "border-border/80"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Network className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-bold text-textMain">{l.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-textMuted">
                    <span>{l.provider}</span>
                    {l.data_source && <span dir="ltr">{l.data_source}</span>}
                    {l.product && <span>{l.product}</span>}
                  </div>
                  {l.test_message && (
                    <div className="text-xs mt-1.5 text-textMuted">{l.test_message}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {l.status && (
                    l.status === "connected"
                      ? <CheckCircle className="w-5 h-5 text-success" />
                      : l.status === "failed"
                        ? <XCircle className="w-5 h-5 text-danger" />
                        : null
                  )}
                  {l.status && l.status !== "nottested" ? (
                    <Badge variant={getStatusVariant(l.status)}>{l.status}</Badge>
                  ) : (
                    <Badge variant="muted">Not tested</Badge>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => testOne.mutate({ serverId, name: l.name })} disabled={testOne.isPending}>
                    <FlaskConical className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {l.last_test && (
                <div className="text-[10px] text-textMuted mt-2">
                  آخرین تست: {formatRelativeTime(l.last_test)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}