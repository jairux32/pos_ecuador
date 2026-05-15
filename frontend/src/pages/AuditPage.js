import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { ScrollText, Filter, Calendar } from "lucide-react";
import api from "../lib/api";

const ACTION_COLORS = {
  crear_producto: "bg-green-50 text-green-700",
  editar_producto: "bg-blue-50 text-blue-700",
  eliminar_producto: "bg-red-50 text-red-700",
  ajustar_stock: "bg-amber-50 text-amber-700",
  transferir_stock: "bg-purple-50 text-purple-700",
  crear_venta: "bg-emerald-50 text-emerald-700",
  anular_comprobante: "bg-red-50 text-red-700",
  abrir_caja: "bg-blue-50 text-blue-700",
  cerrar_caja: "bg-blue-50 text-blue-700",
  crear_usuario: "bg-indigo-50 text-indigo-700",
  generar_comprobante: "bg-cyan-50 text-cyan-700",
  importar_productos: "bg-teal-50 text-teal-700",
  crear_proveedor: "bg-violet-50 text-violet-700",
  recibir_mercaderia: "bg-lime-50 text-lime-700",
  login: "bg-gray-100 text-gray-700",
  logout: "bg-gray-100 text-gray-700",
};

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actions, setActions] = useState([]);
  const [entityTypes, setEntityTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 50 };
      if (actionFilter) params.action = actionFilter;
      if (entityFilter) params.entity_type = entityFilter;
      if (userFilter) params.user_name = userFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await api.get("/audit/logs", { params });
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [page, actionFilter, entityFilter, userFilter, dateFrom, dateTo]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const [aRes, eRes] = await Promise.all([
          api.get("/audit/actions"),
          api.get("/audit/entity-types"),
        ]);
        setActions(aRes.data.actions || []);
        setEntityTypes(eRes.data.types || []);
      } catch {}
    };
    loadMeta();
  }, []);

  const totalPages = Math.ceil(total / 50);

  return (
    <Layout>
      <div data-testid="audit-page" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#111]">Auditoría</h1>
            <p className="text-sm text-[#555]">{total} registros</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger data-testid="audit-action-filter" className="w-[180px] rounded-none border-[#E4E4E7] text-sm"><SelectValue placeholder="Acción" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {actions.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[160px] rounded-none border-[#E4E4E7] text-sm"><SelectValue placeholder="Entidad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {entityTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Usuario..." className="w-[150px] rounded-none border-[#E4E4E7] text-sm" value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setPage(1); }} />
          <Input type="date" className="w-[140px] rounded-none border-[#E4E4E7] text-sm" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          <Input type="date" className="w-[140px] rounded-none border-[#E4E4E7] text-sm" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
        </div>

        <div className="border border-[#E4E4E7] bg-white overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#FAFAFA]">
                <TableHead className="text-xs font-bold uppercase tracking-wider">Fecha/Hora</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Usuario</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Acción</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Entidad</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Detalle</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : logs.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-[#555]">Sin registros de auditoría</TableCell></TableRow>
              ) : logs.map((log, i) => (
                <TableRow key={i} className="hover:bg-[#FAFAFA]">
                  <TableCell className="text-xs text-[#555] whitespace-nowrap">
                    {log.created_at ? new Date(log.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" }) : "—"}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{log.user_name}</TableCell>
                  <TableCell>
                    <Badge className={`rounded-none text-xs ${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-700"}`}>
                      {(log.action || "").replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-[#555]">{log.entity_type}</TableCell>
                  <TableCell className="text-sm text-[#555] max-w-[300px] truncate">{log.details}</TableCell>
                  <TableCell className="text-xs text-[#A1A1AA] font-mono">{log.ip}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-none text-xs">Anterior</Button>
            <span className="text-sm text-[#555]">Página {page} de {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded-none text-xs">Siguiente</Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
