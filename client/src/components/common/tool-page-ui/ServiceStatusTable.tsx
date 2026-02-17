import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, RefreshCw, Play, Square } from "lucide-react";
import { useI18n } from "@/i18n/i18n";
import type { ServiceStatusConfig } from "./types";

export function ServiceStatusTable({ 
  serverUnreachable, 
  rows, 
  onRefresh,
  onServerToggle,
  isServerStarting = false,
}: ServiceStatusConfig) {
  const { t } = useI18n();
  
  // Check if running in Electron
  const isElectron = typeof window !== "undefined" && window.electronAPI !== undefined;

  // Find the server row from the rows array
  const serverRow = rows.find(row => row.id === "server");
  const otherRows = rows.filter(row => row.id !== "server");
  
  // In browser mode, only show stop button when server is running
  const showServerToggle = onServerToggle && (isElectron || !serverUnreachable);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground/85">{t("tool.tts_fast.service_status")}</h3>
        <div className="flex items-center gap-2">
          {showServerToggle && (
            <Button 
              size="sm" 
              variant={serverUnreachable ? "default" : "destructive"}
              onClick={onServerToggle}
              disabled={isServerStarting}
            >
              {isServerStarting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  {t("tool.common.starting")}
                </>
              ) : serverUnreachable ? (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  {t("tool.common.start_server")}
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 mr-2" />
                  {t("tool.common.stop_server")}
                </>
              )}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
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
                    {serverRow.showActionButton && serverRow.onAction && (
                      <Button
                        size="sm"
                        variant={!serverUnreachable ? "destructive" : "default"}
                        onClick={serverRow.onAction}
                        className="ml-2"
                        disabled={serverRow.actionDisabled}
                      >
                        {serverRow.actionDisabled ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            {t("tool.common.starting")}
                          </>
                        ) : !serverUnreachable ? (
                          <>
                            <Square className="w-4 h-4 mr-2" />
                            {t("tool.common.stop_server")}
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            {t("tool.common.start_server")}
                          </>
                        )}
                      </Button>
                    )}
                    {(() => {
                      console.log('[ServiceStatusTable] Server row secondary action:', {
                        showSecondaryAction: serverRow.showSecondaryAction,
                        hasOnSecondaryAction: !!serverRow.onSecondaryAction,
                        secondaryActionLabel: serverRow.secondaryActionLabel,
                      });
                      return null;
                    })()}
                    {serverRow.showSecondaryAction && serverRow.onSecondaryAction && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={serverRow.onSecondaryAction}
                        className="ml-2"
                      >
                        {serverRow.secondaryActionLabel || "Start in Terminal"}
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={row.onAction}
                        className="ml-2"
                        disabled={row.actionDisabled}
                      >
                        {row.actionButtonLabel || t("tool.common.open_settings")}
                      </Button>
                    )}
                    {!serverUnreachable && row.showSecondaryAction && row.onSecondaryAction && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={row.onSecondaryAction}
                        className="ml-2"
                      >
                        {row.secondaryActionLabel || t("tool.common.open_settings")}
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
