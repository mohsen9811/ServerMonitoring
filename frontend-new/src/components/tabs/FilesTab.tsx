import { useState } from "react";
import { filesApi } from "../../services/api";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { FolderTree, Eye, File } from "lucide-react";
import { formatNumber, formatDate } from "../../lib/utils";
import { useQuery } from "@tanstack/react-query";

interface FilesTabProps { serverId: string | null }

export function FilesTab({ serverId }: FilesTabProps) {
  const [path, setPath] = useState("C:\\Logs");

  const { data: files, isLoading, refetch } = useQuery({
    queryKey: ["files", serverId, path],
    queryFn: () => filesApi.list(serverId!, path).then((r) => r.data),
    enabled: !!serverId && !!path,
  });

  if (!serverId) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-textMain text-lg">فایل‌ها</h2>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="مسیر کامل پوشه؛ مثل C:\Logs"
            label="مسیر پوشه"
          />
        </div>
        <div className="flex items-end gap-2">
          <Button variant="secondary" size="md" onClick={() => refetch()}>
            <Eye className="w-4 h-4" /> نمایش
          </Button>
        </div>
      </div>

      <Card>
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
          <span className="font-bold">محتوای پوشه</span>
          <Badge variant="primary">{files?.length ?? 0}</Badge>
        </div>
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton-pulse h-10 w-full rounded-2xl bg-cardSoft/70" />
            ))}
          </div>
        ) : files && files.length > 0 ? (
          <div className="overflow-auto max-h-96">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-xs text-textMuted sticky top-0 bg-card">
                  <th className="text-right px-4 py-2.5 font-medium">نام فایل</th>
                  <th className="text-right px-4 py-2.5 font-medium">سایز MB</th>
                  <th className="text-right px-4 py-2.5 font-medium">تاریخ تغییر</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-primaryLight/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-textMain flex items-center gap-2">
                      <File className="w-4 h-4 text-textMuted shrink-0" />
                      {f.name}
                    </td>
                    <td className="px-4 py-2.5 text-textMuted font-mono">{formatNumber(f.sizeMB, 2)}</td>
                    <td className="px-4 py-2.5 text-textMuted text-xs">{formatDate(f.lastModified)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-textMuted">
            <FolderTree className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-bold">فایلی یافت نشد</p>
            <p className="text-sm mt-1">مسیر را بررسی کنید</p>
          </div>
        )}
      </Card>
    </div>
  );
}