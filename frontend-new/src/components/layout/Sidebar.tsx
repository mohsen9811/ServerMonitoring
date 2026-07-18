import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft, ChevronRight, ChevronsUpDown, Database, Globe2,
  Plus, Search, Server, Settings2, ShieldCheck, TerminalSquare
} from "lucide-react";
import { useServerStore } from "../../stores/serverStore";
import { useReorderServers } from "../../hooks/useQueries";
import { cn } from "../../lib/utils";

interface SidebarProps { collapsed: boolean; onToggle: () => void; onOpenSettings: () => void }

export function Sidebar({ collapsed, onToggle, onOpenSettings }: SidebarProps) {
  const { servers, currentServerId, setCurrentServer, reorderServers } = useServerStore();
  const reorderMutation = useReorderServers();
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState(false);

  useEffect(() => { if (collapsed) setSearch(""); }, [collapsed]);
  const filtered = servers.filter(server => !search || `${server.name} ${server.host}`.toLowerCase().includes(search.toLowerCase()));

  const move = (id: string, offset: number) => {
    const index = servers.findIndex(server => server.id === id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= servers.length) return;
    const next = [...servers];
    [next[index], next[target]] = [next[target], next[index]];
    const order = next.map(server => server.id);
    reorderServers(order);
    reorderMutation.mutate(order);
  };

  return <div className="flex h-full flex-col">
    <div className={cn("flex h-[68px] items-center border-b border-white/5 px-3", collapsed ? "justify-center" : "justify-between")}>
      {!collapsed && <div className="flex min-w-0 items-center gap-3"><div className="relative grid h-10 w-10 place-content-center rounded-2xl border border-violet-400/20 bg-violet-400/[.09] text-violet-300"><TerminalSquare className="h-5 w-5" /><span className="absolute -bottom-1 -left-1 h-3 w-3 rounded-full border-[3px] border-[#0a0611] bg-emerald-400" /></div><div><div className="text-sm font-black tracking-tight text-slate-100">ServerPulse</div><div className="mt-0.5 font-mono text-[8px] uppercase tracking-[.24em] text-violet-400/60">NOC console</div></div></div>}
      <button onClick={onToggle} className="grid h-8 w-8 place-content-center rounded-xl border border-white/5 bg-white/[.025] text-slate-600 transition hover:text-violet-300" aria-label={collapsed ? "باز کردن منو" : "بستن منو"}>{collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
    </div>

    <div className={cn("space-y-2 border-b border-white/5 p-3", collapsed && "px-2")}>
      <button onClick={() => { setCurrentServer(null); onOpenSettings(); }} className={cn("flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-violet-400/20 bg-violet-400/[.08] text-xs font-bold text-violet-200 transition hover:bg-violet-400/[.14]", collapsed && "px-0")}><Plus className="h-4 w-4" />{!collapsed && "اتصال سرور"}</button>
      {!collapsed && <div className="relative"><Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="جستجو در سرورها…" className="h-9 w-full rounded-xl border border-white/5 bg-black/20 pr-9 pl-3 text-[11px] text-slate-300 outline-none placeholder:text-slate-700 focus:border-violet-400/25" /></div>}
    </div>

    <div className="flex items-center justify-between px-3 pb-1 pt-3">{!collapsed && <span className="text-[9px] font-bold uppercase tracking-[.18em] text-slate-700">زیرساخت · {servers.length}</span>}<button onClick={() => setSortMode(value => !value)} className={cn("grid h-7 w-7 place-content-center rounded-lg text-slate-700 transition hover:bg-white/[.03] hover:text-slate-400", sortMode && "bg-violet-400/[.08] text-violet-400")} title="مرتب‌سازی"><ChevronsUpDown className="h-3.5 w-3.5" /></button></div>

    <div className="scrollbar-none flex-1 space-y-1 overflow-auto px-2 py-2">
      {filtered.map((server, index) => {
        const active = server.id === currentServerId;
        const sql = server.features?.sql ?? server.sql?.enabled ?? false;
        const iis = server.features?.iis ?? server.iis?.enabled ?? false;
        return <motion.div layout key={server.id} className="relative">
          <button onClick={() => setCurrentServer(server.id)} title={collapsed ? server.name : undefined} className={cn("group relative flex w-full items-center gap-2.5 overflow-hidden rounded-2xl border px-2.5 py-2.5 text-right transition", active ? "border-violet-400/20 bg-violet-400/[.09]" : "border-transparent hover:border-white/5 hover:bg-white/[.025]", collapsed && "justify-center px-1")}>
            {active && <span className="absolute inset-y-3 right-0 w-0.5 rounded-full bg-violet-300 shadow-[0_0_9px_#8b5cf6]" />}
            <div className={cn("relative grid h-8 w-8 shrink-0 place-content-center rounded-xl border", active ? "border-violet-400/20 bg-violet-400/[.1] text-violet-300" : "border-white/5 bg-black/20 text-slate-600")}><Server className="h-3.5 w-3.5" /><span className="absolute -bottom-0.5 -left-0.5 h-2 w-2 rounded-full border-2 border-[#09050f] bg-emerald-400" /></div>
            {!collapsed && <><div className="min-w-0 flex-1"><div className={cn("truncate text-[11px] font-extrabold", active ? "text-slate-100" : "text-slate-400")}>{server.name}</div><div dir="ltr" className="mt-0.5 truncate text-right font-mono text-[9px] text-slate-700">{server.host}</div></div><div className="flex items-center gap-1">{sql && <Database className="h-3 w-3 text-violet-400/60" />}{iis && <Globe2 className="h-3 w-3 text-fuchsia-400/60" />}</div></>}
          </button>
          {sortMode && !collapsed && <div className="absolute left-1 top-1/2 flex -translate-y-1/2 flex-col"><button disabled={index === 0} onClick={() => move(server.id, -1)} className="h-4 text-[9px] text-slate-600 disabled:opacity-20">▲</button><button disabled={index === servers.length - 1} onClick={() => move(server.id, 1)} className="h-4 text-[9px] text-slate-600 disabled:opacity-20">▼</button></div>}
        </motion.div>;
      })}
      {!filtered.length && !collapsed && <div className="px-4 py-10 text-center text-[10px] leading-5 text-slate-700">{search ? "سروری با این مشخصات پیدا نشد." : "هنوز سروری تعریف نشده است."}</div>}
    </div>

    <div className="border-t border-white/5 p-2">
      <button onClick={onOpenSettings} className={cn("flex w-full items-center gap-2.5 rounded-xl p-2 text-right text-slate-600 transition hover:bg-white/[.025] hover:text-slate-300", collapsed && "justify-center")}><div className="grid h-8 w-8 place-content-center rounded-xl border border-white/5 bg-black/20"><Settings2 className="h-3.5 w-3.5" /></div>{!collapsed && <div className="flex-1"><div className="text-[10px] font-bold">تنظیمات پایش</div><div className="mt-0.5 text-[8px] text-slate-700">اتصال، آستانه‌ها و دسترسی</div></div>}{!collapsed && <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/60" />}</button>
    </div>
  </div>;
}
