import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";

interface ChartTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  formatter?: (value: any) => string;
}

function ChartTooltip({ active, payload, label, formatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-border/80 bg-card px-3 py-2 shadow-card text-xs">
      {label && <p className="font-bold text-textMain mb-1">{label}</p>}
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-textMuted" style={{ color: entry.color }}>
          {entry.name}: {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

export type ChartSeries = {
  dataKey: string;
  name: string;
  color: string;
};

// ===== CPU / RAM Area Chart =====
interface UsageAreaChartProps {
  data: { time: string; cpu: number; ram: number }[];
  height?: number;
}

export function UsageAreaChart({ data, height = 200 }: UsageAreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        <defs>
          <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border) / 0.5)" />
        <XAxis dataKey="time" tick={{ fontSize: 11, fill: "rgb(var(--color-text-muted))" }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "rgb(var(--color-text-muted))" }} axisLine={false} tickLine={false} width={35} />
        <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
        <Area type="monotone" dataKey="cpu" name="CPU" stroke="#3b82f6" fill="url(#cpuGrad)" strokeWidth={2} />
        <Area type="monotone" dataKey="ram" name="RAM" stroke="#10b981" fill="url(#ramGrad)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ===== Disk Usage Bar Chart =====
interface DiskBarChartProps {
  data: { name: string; used: number; free: number; total: number }[];
  height?: number;
}

export function DiskBarChart({ data, height = 250 }: DiskBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border) / 0.5)" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "rgb(var(--color-text-muted))" }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "rgb(var(--color-text-muted))" }} axisLine={false} tickLine={false} width={50} />
        <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
        <Bar dataKey="used" name="مصرف" fill={data.some(d => d.used >= 90) ? "#ef4444" : data.some(d => d.used >= 80) ? "#f59e0b" : "#10b981"} radius={[0, 6, 6, 0]} barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ===== Mini Sparkline =====
interface SparklineProps {
  data: { value: number }[];
  color?: string;
  height?: number;
}

export function Sparkline({ data, color = "#3b82f6", height = 50 }: SparklineProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.1} strokeWidth={2} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ===== Status Pie Chart =====
interface StatusPieChartProps {
  data: { name: string; value: number; color: string }[];
  height?: number;
}

export function StatusPieChart({ data, height = 180 }: StatusPieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ===== Simple Bar (for services status, etc.) =====
interface SimpleBarChartProps {
  data: { name: string; value: number; fill?: string }[];
  height?: number;
}

export function SimpleBarChart({ data, height = 180 }: SimpleBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border) / 0.5)" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgb(var(--color-text-muted))" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "rgb(var(--color-text-muted))" }} axisLine={false} tickLine={false} width={30} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="value" name="تعداد" radius={[6, 6, 0, 0]} barSize={32}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.fill || "#3b82f6"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}