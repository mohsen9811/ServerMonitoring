import { useState } from "react";
import { Check, Copy, KeyRound, ShieldAlert, TerminalSquare } from "lucide-react";
import { Card, CardContent } from "../ui/Card";

type GuideStep = { title: string; where: string; command: string; effect: string; access: string; warning?: string };

const steps: GuideStep[] = [
  {
    title: "۱. فعال‌کردن WinRM روی سرور مقصد",
    where: "PowerShell را روی سرور مقصد با Run as Administrator باز کنید",
    command: `Enable-PSRemoting -Force\nSet-Service WinRM -StartupType Automatic\nEnable-NetFirewallRule -DisplayGroup "Windows Remote Management"`,
    effect: "سرویس WinRM را فعال و Ruleهای استاندارد فایروال برای Remote PowerShell را روشن می‌کند.",
    access: "پورت‌های WinRM در Profileهای مجاز Windows Firewall؛ HTTP معمولاً 5985.",
  },
  {
    title: "۲. ساخت حساب اختصاصی مانیتورینگ",
    where: "PowerShell ادمین روی سرور مقصد",
    command: `$Password = Read-Host "Password" -AsSecureString\nNew-LocalUser -Name "serverpulse_monitor" -Password $Password -PasswordNeverExpires\nAdd-LocalGroupMember -Group "Administrators" -Member "serverpulse_monitor"`,
    effect: "یک حساب جدا برای ServerPulse می‌سازد تا سرویس، CIM/WMI و IIS قابل کنترل باشند.",
    access: "عضویت Administrators دسترسی مدیریتی کامل روی همان سرور می‌دهد.",
    warning: "این دسترسی گسترده است. برای محیط حساس، به‌جای آن JEA/حساب دامینی محدود طراحی کنید.",
  },
  {
    title: "۳. Trust برای سرور Workgroup یا اتصال با IP",
    where: "PowerShell ادمین روی سیستمی که ServerPulse اجرا می‌شود",
    command: `Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value "SERVER_IP_OR_NAME" -Force\nRestart-Service WinRM`,
    effect: "فقط Host/IP نوشته‌شده را برای احراز هویت Negotiate قابل اعتماد می‌کند.",
    access: "TrustedHosts سمت Client؛ هیچ Rule فایروال جدیدی روی مقصد باز نمی‌کند.",
    warning: "SERVER_IP_OR_NAME را جایگزین کنید و از مقدار * استفاده نکنید.",
  },
  {
    title: "۴. دسترسی خواندن SQL Server",
    where: "در SSMS با حساب sysadmin؛ نام Login را جایگزین کنید",
    command: `USE [master];\nCREATE LOGIN [DOMAIN\\serverpulse_monitor] FROM WINDOWS;\nGRANT VIEW SERVER STATE TO [DOMAIN\\serverpulse_monitor];\nGRANT VIEW ANY DATABASE TO [DOMAIN\\serverpulse_monitor];\nUSE [msdb];\nCREATE USER [DOMAIN\\serverpulse_monitor] FOR LOGIN [DOMAIN\\serverpulse_monitor];\nALTER ROLE [SQLAgentReaderRole] ADD MEMBER [DOMAIN\\serverpulse_monitor];`,
    effect: "خواندن وضعیت سرور، دیتابیس‌ها، HA و اطلاعات SQL Agent Jobها را ممکن می‌کند.",
    access: "Read/VIEW برای متریک‌ها و Jobها؛ مجوز اجرای عملیات مدیریتی Job را کامل نمی‌دهد.",
  },
  {
    title: "۵. اجازه اجرای SQL Agent Job",
    where: "در SSMS؛ فقط اگر Start/Stop/Enable/Disable از پنل لازم است",
    command: `USE [msdb];\nALTER ROLE [SQLAgentOperatorRole] ADD MEMBER [DOMAIN\\serverpulse_monitor];`,
    effect: "اجرای Jobهای مجاز و مشاهده جزئیات عملیاتی SQL Agent را فعال می‌کند.",
    access: "سطح SQLAgentOperatorRole در msdb؛ مالکیت Job و Policyهای SQL همچنان اثر دارند.",
    warning: "برای کنترل Jobهایی که مالکشان حساب دیگری است ممکن است طراحی Role/Owner اختصاصی لازم باشد؛ sysadmin را فقط با تأیید امنیت بدهید.",
  },
  {
    title: "۶. نصب و فعال‌سازی ابزارهای IIS (در صورت نیاز)",
    where: "PowerShell ادمین روی Web Server",
    command: `Install-WindowsFeature Web-Server, Web-Scripting-Tools, Web-Mgmt-Service -IncludeManagementTools`,
    effect: "IIS و ابزار WebAdministration موردنیاز خواندن و کنترل Site/App Pool را نصب می‌کند.",
    access: "Featureهای IIS Management روی خود سرور؛ دسترسی شبکه‌ای اضافه فقط طبق تنظیمات Windows Server ایجاد می‌شود.",
  },
];

export function ServerAccessGuide() {
  return (
    <Card className="border-violet-400/20 bg-violet-500/[.035]">
      <CardContent>
        <div className="mb-4 flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-content-center rounded-2xl border border-violet-400/20 bg-violet-400/10 text-violet-300"><TerminalSquare className="h-5 w-5" /></div><div><h3 className="text-sm font-black text-slate-100">پکیج راه‌اندازی انواع سرور</h3><p className="mt-1 max-w-3xl text-[11px] leading-6 text-slate-500">دستورها را به‌ترتیب اجرا کنید. زیر هر دستور دقیقاً نوشته شده چه تغییری می‌دهد و چه سطح دسترسی باز می‌شود.</p></div></div>
        <div className="space-y-3">{steps.map(step => <GuideCommand key={step.title} step={step} />)}</div>
        <div className="mt-4 flex gap-2 rounded-2xl border border-amber-400/15 bg-amber-400/[.045] p-3 text-[10px] leading-5 text-amber-100/70"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><span>در محیط Production ابتدا با تیم امنیت هماهنگ کنید. حساب اختصاصی، رمز قوی و محدودکردن Firewall به IP سیستم ServerPulse توصیه می‌شود.</span></div>
      </CardContent>
    </Card>
  );
}

function GuideCommand({ step }: { step: GuideStep }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(step.command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return <details className="group rounded-2xl border border-white/5 bg-black/20" open={step.title.startsWith("۱.")}><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-bold text-slate-300"><span>{step.title}</span><span className="text-[9px] font-normal text-slate-600">باز کردن جزئیات</span></summary><div className="border-t border-white/5 p-3"><div className="mb-2 flex items-center gap-2 text-[10px] text-slate-500"><KeyRound className="h-3.5 w-3.5 text-violet-400" />{step.where}</div><div className="relative" dir="ltr"><pre className="overflow-auto rounded-xl border border-violet-400/10 bg-[#050309] p-3 pl-12 text-left font-mono text-[11px] leading-6 text-violet-100"><code>{step.command}</code></pre><button onClick={copy} className="absolute left-2 top-2 grid h-8 w-8 place-content-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition hover:text-violet-200" title="کپی دستور">{copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}</button></div><div className="mt-3 grid gap-2 md:grid-cols-2"><Info label="این دستور چه می‌کند؟" text={step.effect} /><Info label="چه دسترسی‌ای باز می‌شود؟" text={step.access} /></div>{step.warning && <p className="mt-2 rounded-xl bg-amber-400/[.05] px-3 py-2 text-[10px] leading-5 text-amber-200/70">هشدار: {step.warning}</p>}</div></details>;
}

function Info({ label, text }: { label: string; text: string }) { return <div className="rounded-xl border border-white/5 bg-white/[.02] p-2.5"><div className="text-[9px] font-bold text-violet-300">{label}</div><p className="mt-1 text-[10px] leading-5 text-slate-500">{text}</p></div>; }
