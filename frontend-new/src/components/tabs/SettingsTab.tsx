import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Database, Globe2, HelpCircle, KeyRound, Plus, Save, Server, ShieldCheck, TestTube2, Trash2 } from "lucide-react";
import { Card, CardContent } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useToast } from "../ui/Toast";
import { useServerStore } from "../../stores/serverStore";
import { useCreateServer, useDeleteServer, useServer, useTestConnection, useUpdateServer } from "../../hooks/useQueries";
import type { Server as ServerType } from "../../types";
import { ServerAccessGuide } from "../settings/ServerAccessGuide";

interface SettingsTabProps { serverId: string | null }

function makeForm(server?: ServerType) {
  return {
    id: server?.id || "",
    name: server?.name || "",
    host: server?.host || "",
    winrmAuthType: server?.winrm?.authType || server?.winrm?.auth || (server?.host === "localhost" ? "local" : "credential") as "local" | "default" | "credential",
    computerName: server?.winrm?.computerName || server?.winrm?.computer || "",
    winrmUsername: server?.winrm?.username || "",
    winrmPassword: server?.winrm?.password || "",
    sqlEnabled: server?.features?.sql ?? server?.sql?.enabled ?? false,
    sqlAuthType: server?.sql?.authType || server?.sql?.auth || "windows" as "windows" | "sql",
    sqlServer: server?.sql?.server || server?.host || "",
    sqlPort: server?.sql?.port || 1433,
    sqlUsername: server?.sql?.username || server?.sql?.user || "",
    sqlPassword: server?.sql?.password || "",
    iisEnabled: server?.features?.iis ?? server?.iis?.enabled ?? false,
    creditEnabled: server?.features?.credit ?? server?.credit?.enabled ?? false,
  };
}

export function SettingsTab({ serverId }: SettingsTabProps) {
  const { servers, setCurrentServer } = useServerStore();
  const summaryServer = servers.find(item => item.id === serverId);
  const { data: serverDetails } = useServer(serverId);
  const server = serverDetails || summaryServer;
  const [form, setForm] = useState(() => makeForm(server));
  const [showGuide, setShowGuide] = useState(false);
  const { showToast } = useToast();
  const createMutation = useCreateServer();
  const updateMutation = useUpdateServer();
  const deleteMutation = useDeleteServer();
  const testMutation = useTestConnection();
  const editing = Boolean(serverId && server);

  useEffect(() => setForm(makeForm(server)), [serverId, server]);

  const payload = (): Partial<ServerType> => ({
    id: form.id.trim(),
    name: form.name.trim(),
    host: form.host.trim(),
    features: { winrm: true, sql: form.sqlEnabled, iis: form.iisEnabled, credit: form.creditEnabled },
    winrm: {
      authType: form.winrmAuthType,
      computerName: form.computerName.trim(),
      username: form.winrmUsername.trim(),
      password: form.winrmPassword,
    },
    sql: form.sqlEnabled ? {
      enabled: true,
      authType: form.sqlAuthType,
      server: form.sqlServer.trim() || form.host.trim(),
      port: Number(form.sqlPort || 1433),
      username: form.sqlUsername.trim(),
      password: form.sqlPassword,
    } : null,
    iis: { enabled: form.iisEnabled },
    credit: { enabled: form.creditEnabled },
  });

  const save = async () => {
    if (!form.id.trim() || !form.name.trim() || !form.host.trim()) {
      showToast("شناسه، نام نمایشی و Host الزامی هستند.", "error");
      return;
    }
    try {
      if (editing) await updateMutation.mutateAsync({ id: serverId!, data: payload() });
      else {
        await createMutation.mutateAsync(payload());
        setCurrentServer(form.id.trim());
      }
      showToast(editing ? "تنظیمات سرور ذخیره شد." : "سرور جدید با موفقیت متصل شد.", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "ذخیره تنظیمات ناموفق بود.", "error"); }
  };

  const test = async () => {
    if (!form.host.trim()) return showToast("ابتدا Host را وارد کنید.", "error");
    try {
      const result = await testMutation.mutateAsync(payload());
      if (result.winrm) showToast(result.sql === false ? "WinRM وصل است؛ اتصال SQL ناموفق بود." : "ارتباط با سرور با موفقیت برقرار شد.", result.sql === false ? "warning" : "success");
      else showToast(result.error || "اتصال WinRM ناموفق بود.", "error");
    } catch (error) { showToast(error instanceof Error ? error.message : "تست اتصال ناموفق بود.", "error"); }
  };

  const remove = async () => {
    if (!serverId || !window.confirm("این سرور از پنل مانیتورینگ حذف شود؟")) return;
    try { await deleteMutation.mutateAsync(serverId); showToast("سرور حذف شد.", "success"); }
    catch (error) { showToast(error instanceof Error ? error.message : "حذف سرور ناموفق بود.", "error"); }
  };

  const busy = createMutation.isPending || updateMutation.isPending;
  return <div className="mx-auto max-w-5xl space-y-4 pb-8">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[.18em] text-violet-400/70"><ShieldCheck className="h-3.5 w-3.5" /> connection profile</div><h2 className="text-xl font-black text-slate-100">{editing ? `تنظیمات ${server?.name}` : "اتصال سرور جدید"}</h2><p className="mt-1 text-xs text-slate-600">اطلاعات اتصال، قابلیت‌ها و دسترسی‌های موردنیاز پایش را تنظیم کنید.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setShowGuide(value => !value)}><HelpCircle className="h-4 w-4" /> {showGuide ? "بستن راهنما" : "راهنمای افزودن سرور"}</Button><Button variant="outline" size="sm" onClick={test} disabled={testMutation.isPending}><TestTube2 className={`h-4 w-4 ${testMutation.isPending ? "animate-pulse" : ""}`} /> تست اتصال</Button><Button size="sm" onClick={save} disabled={busy}>{editing ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editing ? "ذخیره" : "افزودن سرور"}</Button></div></div>

    {showGuide && <ServerAccessGuide />}

    <div className="grid gap-4 lg:grid-cols-2">
      <SettingsCard icon={Server} title="مشخصات پایه" description="هویت سرور در پنل و آدرس دسترسی شبکه">
        <div className="grid gap-3 sm:grid-cols-2"><Input label="شناسه یکتا" value={form.id} disabled={editing} onChange={event => setForm({ ...form, id: event.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })} placeholder="web-prod-01" /><Input label="نام نمایشی" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Web Production 01" /><div className="sm:col-span-2"><Input label="Host / IP" value={form.host} onChange={event => setForm({ ...form, host: event.target.value, sqlServer: form.sqlServer || event.target.value })} placeholder="10.10.20.15" dir="ltr" /></div></div>
      </SettingsCard>

      <SettingsCard icon={KeyRound} title="اتصال WinRM" description="اجرای agentless فرمان‌های PowerShell روی سرور مقصد">
        <div className="grid gap-3 sm:grid-cols-2"><Select label="روش احراز هویت" value={form.winrmAuthType} onChange={value => setForm({ ...form, winrmAuthType: value as typeof form.winrmAuthType })} options={[['local','Local'],['default','Default / Kerberos'],['credential','Username & Password']]} /><Input label="Computer Name" value={form.computerName} onChange={event => setForm({ ...form, computerName: event.target.value })} placeholder="WIN-SRV-01" dir="ltr" />{form.winrmAuthType === "credential" && <><Input label="Username" value={form.winrmUsername} onChange={event => setForm({ ...form, winrmUsername: event.target.value })} placeholder="DOMAIN\monitor" dir="ltr" /><Input label="Password" type="password" value={form.winrmPassword} onChange={event => setForm({ ...form, winrmPassword: event.target.value })} dir="ltr" /></>}</div>
      </SettingsCard>
    </div>

    <SettingsCard icon={Database} title="SQL Server" description="مانیتورینگ دیتابیس‌ها، HA، Agent Jobs و Linked Serverها">
      <Toggle checked={form.sqlEnabled} onChange={checked => setForm({ ...form, sqlEnabled: checked })} label="پایش SQL Server فعال باشد" />
      {form.sqlEnabled && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Select label="SQL Authentication" value={form.sqlAuthType} onChange={value => setForm({ ...form, sqlAuthType: value as typeof form.sqlAuthType })} options={[['windows','Windows Integrated'],['sql','SQL Login']]} /><Input label="SQL Host" value={form.sqlServer} onChange={event => setForm({ ...form, sqlServer: event.target.value })} dir="ltr" /><Input label="Port" type="number" value={form.sqlPort} onChange={event => setForm({ ...form, sqlPort: Number(event.target.value) })} dir="ltr" />{form.sqlAuthType === "sql" && <><Input label="SQL Username" value={form.sqlUsername} onChange={event => setForm({ ...form, sqlUsername: event.target.value })} dir="ltr" /><Input label="SQL Password" type="password" value={form.sqlPassword} onChange={event => setForm({ ...form, sqlPassword: event.target.value })} dir="ltr" /></>}</div>}
    </SettingsCard>

    <div className="grid gap-3 sm:grid-cols-2"><FeatureToggle icon={Globe2} label="IIS / Web Server" description="سایت‌ها، App Pool و Worker Processها" checked={form.iisEnabled} onChange={checked => setForm({ ...form, iisEnabled: checked })} /><FeatureToggle icon={ShieldCheck} label="عملیات اعتباری" description="اجرای کنترل‌شده Stored Procedureهای کسب‌وکار" checked={form.creditEnabled} onChange={checked => setForm({ ...form, creditEnabled: checked })} /></div>

    {editing && <Card className="border-danger/15 bg-danger/[.025]"><CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-bold text-rose-200">حذف اتصال سرور</h3><p className="mt-1 text-[10px] text-slate-600">این کار فقط پروفایل مانیتورینگ را حذف می‌کند و روی سرور مقصد تغییری نمی‌دهد.</p></div><Button variant="danger" size="sm" onClick={remove} disabled={deleteMutation.isPending}><Trash2 className="h-4 w-4" /> حذف سرور</Button></CardContent></Card>}
  </div>;
}

function SettingsCard({ icon: Icon, title, description, children }: { icon: typeof Server; title: string; description: string; children: ReactNode }) { return <Card><CardContent><div className="mb-4 flex items-center gap-3"><div className="grid h-9 w-9 place-content-center rounded-xl border border-violet-400/15 bg-violet-400/[.07] text-violet-300"><Icon className="h-4 w-4" /></div><div><h3 className="text-sm font-extrabold text-slate-200">{title}</h3><p className="mt-0.5 text-[10px] text-slate-600">{description}</p></div></div>{children}</CardContent></Card>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string,string][] }) { return <label className="space-y-1.5"><span className="block text-xs font-semibold text-slate-400">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className="h-11 w-full rounded-2xl border border-border bg-card/70 px-4 text-xs text-textMain outline-none focus:border-primary/40">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>; }
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) { return <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/5 bg-black/15 p-3"><span className="text-xs font-bold text-slate-300">{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4 accent-violet-500" /></label>; }
function FeatureToggle({ icon: Icon, label, description, checked, onChange }: { icon: typeof Globe2; label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${checked ? "border-violet-400/20 bg-violet-400/[.055]" : "border-white/5 bg-white/[.02]"}`}><div className="grid h-9 w-9 place-content-center rounded-xl bg-black/20 text-slate-500"><Icon className="h-4 w-4" /></div><div className="flex-1"><div className="text-xs font-bold text-slate-300">{label}</div><div className="mt-1 text-[10px] text-slate-600">{description}</div></div><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4 accent-violet-500" /></label>; }
