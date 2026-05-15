import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { FileText, Download, XCircle, Eye } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailInvoice, setDetailInvoice] = useState(null);
  const [annulDialogOpen, setAnnulDialogOpen] = useState(false);
  const [annulId, setAnnulId] = useState("");
  const [annulMotivo, setAnnulMotivo] = useState("");

  const loadInvoices = async () => {
    try {
      const params = { page, limit: 50 };
      if (statusFilter) params.estado = statusFilter;
      const res = await api.get("/invoices/", { params });
      setInvoices(res.data.invoices || []);
      setTotal(res.data.total || 0);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { loadInvoices(); }, [page, statusFilter]);

  const downloadXML = async (id) => {
    try {
      const res = await api.get(`/invoices/${id}/xml`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `comprobante_${id}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error("Error descargando XML"); }
  };

  const downloadPDF = async (id) => {
    try {
      const res = await api.get(`/invoices/${id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `RIDE_${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error("Error descargando PDF"); }
  };

  const handleAnnul = async () => {
    if (!annulMotivo) { toast.error("Ingrese un motivo"); return; }
    try {
      await api.post("/invoices/annul", { invoice_id: annulId, motivo: annulMotivo });
      toast.success("Comprobante anulado");
      setAnnulDialogOpen(false);
      loadInvoices();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const estadoColors = {
    generado: "bg-blue-50 text-blue-700 border-blue-200",
    autorizado: "bg-green-50 text-green-700 border-green-200",
    anulado: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <Layout>
      <div data-testid="invoices-page" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#111]">Comprobantes</h1>
            <p className="text-sm text-[#555]">{total} comprobantes emitidos</p>
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger data-testid="invoice-status-filter" className="w-[180px] rounded-none border-[#E4E4E7]"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="generado">Generado</SelectItem>
              <SelectItem value="autorizado">Autorizado</SelectItem>
              <SelectItem value="anulado">Anulado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border border-[#E4E4E7] bg-white overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#FAFAFA]">
                <TableHead className="text-xs font-bold uppercase tracking-wider">No. Comprobante</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Tipo</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Cliente</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-right">Total</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-center">Estado</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Fecha</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : invoices.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-[#555]">Sin comprobantes</TableCell></TableRow>
              ) : invoices.map((inv) => (
                <TableRow key={inv.id} className="hover:bg-[#FAFAFA]">
                  <TableCell className="text-sm font-mono">{inv.numero_comprobante}</TableCell>
                  <TableCell className="text-sm">{inv.tipo_documento_nombre}</TableCell>
                  <TableCell className="text-sm">{inv.comprador?.nombre || "—"}</TableCell>
                  <TableCell className="text-sm text-right font-semibold">${inv.total?.toFixed(2)}</TableCell>
                  <TableCell className="text-center">
                    <Badge className={`rounded-none text-xs ${estadoColors[inv.estado] || ""}`}>{inv.estado}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-[#555]">
                    {inv.fecha_emision ? new Date(inv.fecha_emision).toLocaleDateString("es-EC") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button data-testid={`view-invoice-${inv.id}`} onClick={() => setDetailInvoice(inv)} className="p-1.5 hover:bg-[#F4F4F5]" title="Ver">
                        <Eye className="w-4 h-4 text-[#555]" />
                      </button>
                      <button data-testid={`download-xml-${inv.id}`} onClick={() => downloadXML(inv.id)} className="p-1.5 hover:bg-[#F4F4F5]" title="XML">
                        <Download className="w-4 h-4 text-[#002fa7]" />
                      </button>
                      <button data-testid={`download-pdf-${inv.id}`} onClick={() => downloadPDF(inv.id)} className="p-1.5 hover:bg-[#F4F4F5]" title="PDF">
                        <FileText className="w-4 h-4 text-[#002fa7]" />
                      </button>
                      {inv.estado !== "anulado" && (
                        <button data-testid={`annul-invoice-${inv.id}`} onClick={() => { setAnnulId(inv.id); setAnnulMotivo(""); setAnnulDialogOpen(true); }} className="p-1.5 hover:bg-red-50" title="Anular">
                          <XCircle className="w-4 h-4 text-red-500" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Dialog open={!!detailInvoice} onOpenChange={() => setDetailInvoice(null)}>
          <DialogContent className="max-w-lg rounded-none border-[#E4E4E7]">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">{detailInvoice?.tipo_documento_nombre} {detailInvoice?.numero_comprobante}</DialogTitle>
            </DialogHeader>
            {detailInvoice && (
              <div className="space-y-3 mt-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-[#555]">Clave de Acceso:</span><p className="font-mono text-xs break-all">{detailInvoice.clave_acceso}</p></div>
                  <div><span className="text-[#555]">Estado:</span><p><Badge className={`rounded-none ${estadoColors[detailInvoice.estado]}`}>{detailInvoice.estado}</Badge></p></div>
                </div>
                <div className="border-t border-[#E4E4E7] pt-2">
                  <p className="font-bold mb-1">Emisor</p>
                  <p>{detailInvoice.emisor?.razon_social}</p>
                  <p className="text-[#555]">RUC: {detailInvoice.emisor?.ruc}</p>
                </div>
                <div className="border-t border-[#E4E4E7] pt-2">
                  <p className="font-bold mb-1">Comprador</p>
                  <p>{detailInvoice.comprador?.nombre}</p>
                  <p className="text-[#555]">{detailInvoice.comprador?.identificacion}</p>
                </div>
                <div className="border-t border-[#E4E4E7] pt-2">
                  <p className="font-bold mb-1">Totales</p>
                  <div className="space-y-1">
                    <div className="flex justify-between"><span>Subtotal 0%</span><span>${detailInvoice.subtotal_0?.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>Subtotal 15%</span><span>${detailInvoice.subtotal_15?.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>IVA</span><span>${detailInvoice.total_iva?.toFixed(2)}</span></div>
                    <div className="flex justify-between font-bold text-lg border-t pt-1"><span>Total</span><span>${detailInvoice.total?.toFixed(2)}</span></div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={annulDialogOpen} onOpenChange={setAnnulDialogOpen}>
          <DialogContent className="max-w-sm rounded-none border-[#E4E4E7]">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-red-600">Anular Comprobante</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <p className="text-sm text-[#555]">Esta acción no se puede deshacer.</p>
              <div>
                <Label className="text-xs font-semibold">Motivo de Anulación *</Label>
                <Input className="mt-1 rounded-none border-[#E4E4E7]" value={annulMotivo} onChange={(e) => setAnnulMotivo(e.target.value)} placeholder="Ingrese el motivo" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAnnulDialogOpen(false)} className="flex-1 rounded-none">Cancelar</Button>
                <Button data-testid="confirm-annul-btn" onClick={handleAnnul} className="flex-1 rounded-none bg-red-600 hover:bg-red-700 text-white">Anular</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
