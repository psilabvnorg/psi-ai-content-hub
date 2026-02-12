import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import type { ServiceStatusConfig } from "./types";

export function ServiceStatusTable({ apiUrl, serverUnreachable, rows, onRefresh }: ServiceStatusConfig) {
  const { t } = useI18n();

  // Find the server row from the rows array
  const serverRow = rows.find(row => row.id === "server");
  const otherRows = rows.filter(row => row.id !== "server");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground/85">{t("tool.common.service_status")}</h3>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("settings.tools.table.tool")}</TableHead>
              <TableHead>{t("settings.tools.table.status")}</TableHead>
              <TableHead>{t("settings.tools.table.path")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Server Status Row */}
            {serverRow && (
              <TableRow>
                <TableCell className="font-medium">{serverRow.label}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {!serverUnreachable ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-sm">
                      {!serverUnreachable ? t("settings.tools.status.ready") : t("settings.tools.status.not_ready")}
                    </span>
                    {serverUnreachable && serverRow.onAction && (
                      <Button size="sm" variant="outline" onClick={serverRow.onAction} className="ml-2">
                        {t("tool.common.turn_on_server")}
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs font-mono break-all">
                  {serverRow.path || "--"}
                </TableCell>
              </TableRow>
            )}

            {/* Dynamic Status Rows */}
            {otherRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {serverUnreachable ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : row.isReady ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-sm">
                      {serverUnreachable 
                        ? t("settings.tools.status.not_ready")
                        : row.isReady 
                        ? t("settings.tools.status.ready") 
                        : t("settings.tools.status.not_ready")}
                    </span>
                    {!serverUnreachable && row.showActionButton && row.onAction && (
                      <Button size="sm" variant="outline" onClick={row.onAction} className="ml-2">
                        {row.actionButtonLabel || t("tool.common.open_settings")}
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs font-mono break-all">
                  {serverUnreachable ? "--" : (row.path || "--")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
