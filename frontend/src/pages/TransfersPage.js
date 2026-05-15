import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { ArrowRightLeft, Plus } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";

export default function TransfersPage() {
  const [transfers, setTransfers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ producto_id: "", cantidad: "", origen_branch_id: "", destino_branch_id: "", notas: "" });

  const loadData = useCallback(async () => {
    try {
      const [tRes, bRes, pRes] = await Promise.all([
        api.get(`/transfers/?page=${page}`),
        api.get("/business/branches"),
        api.get("/inventory/products?limit=500"),
      ]);
      setTransfers(tRes.data.transfers || []);
      setTotal(tRes.data.total || 0);
      setBranches(bRes.data.branches || []);
      setProducts(pRes.data.products || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleTransfer = async () => {
    if (!form.producto_id || !form.cantidad || !form.origen_branch_id || !form.destino_branch_id) {
      toast.error("Complete todos los campos obligatorios"); return;
    }
    if (form.origen_branch_id === form.destino_branch_id) {
      toast.error("Origen y destino deben ser diferentes"); return;
    }
    try {
      await api.post("/transfers/", {
        producto_id: form.producto_id,
        cantidad: parseFloat(form.cantidad),
        origen_branch_id: form.origen_branch_id,
        destino_branch_id: form.destino_branch_id,
        notas: form.notas,
      });
      toast.success("Transferencia completada. Stock actualizado.");
      setDialogOpen(false);
      setForm({ producto_id: "", cantidad: "", origen_branch_id: "", destino_branch_id: "", notas: "" });
      loadData();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const selectedProduct = products.find((p) => p.id === form.producto_id);

  return (
    <Layout>
      <div data-testid="transfers-page" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#111]">Transferencias de Stock</h1>
            <p className="text-sm text-[#555]">{total} transferencias</p>
          </div>
          <Button data-testid="new-transfer-btn" onClick={() => setDialogOpen(true)} className="rounded-none bg-[#002fa7] hover:bg-[#001f7a] gap-2">
            <Plus className="w-4 h-4" /> Nueva Transferencia
          </Button>
        </div>

        <div className="border border-[#E4E4E7] bg-white overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#FAFAFA]">
                <TableHead className="text-xs font-bold uppercase">Fecha</TableHead>
                <TableHead className="text-xs font-bold uppercase">Producto</TableHead>
                <TableHead className="text-xs font-bold uppercase text-center">Cantidad</TableHead>
                <TableHead className="text-xs font-bold uppercase">Origen</TableHead>
                <TableHead className="text-xs font-bold uppercase">Destino</TableHead>
                <TableHead className="text-xs font-bold uppercase">Realizado por</TableHead>
                <TableHead className="text-xs font-bold uppercase text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : transfers.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-[#555]">Sin transferencias</TableCell></TableRow>
              ) : transfers.map((t) => (
                <TableRow key={t.id} className="hover:bg-[#FAFAFA]">
                  <TableCell className="text-sm text-[#555]">{new Date(t.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</TableCell>
                  <TableCell className="text-sm font-medium">{t.producto_nombre}</TableCell>
                  <TableCell className="text-sm text-center font-semibold">{t.cantidad}</TableCell>
                  <TableCell className="text-sm">{t.origen_branch_nombre}</TableCell>
                  <TableCell className="text-sm">{t.destino_branch_nombre}</TableCell>
                  <TableCell className="text-sm text-[#555]">{t.creado_por}</TableCell>
                  <TableCell className="text-center">
                    <Badge className="rounded-none text-xs bg-green-50 text-green-700">completada</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md rounded-none border-[#E4E4E7]">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-[#002fa7]" /> Transferir Stock
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-xs font-semibold">Producto *</Label>
                <Select value={form.producto_id} onValueChange={(v) => setForm({ ...form, producto_id: v })}>
                  <SelectTrigger data-testid="transfer-product-select" className="mt-1 rounded-none border-[#E4E4E7]"><SelectValue placeholder="Seleccione producto" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre} (Stock: {p.stock_actual})</SelectItem>)}
                  </SelectContent>
                </Select>
                {selectedProduct && <p className="text-xs text-[#555] mt-1">Stock disponible: {selectedProduct.stock_actual}</p>}
              </div>
              <div>
                <Label className="text-xs font-semibold">Cantidad *</Label>
                <Input data-testid="transfer-qty-input" className="mt-1 rounded-none border-[#E4E4E7]" type="number" min="1" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Sucursal Origen *</Label>
                <Select value={form.origen_branch_id} onValueChange={(v) => setForm({ ...form, origen_branch_id: v })}>
                  <SelectTrigger data-testid="transfer-origin-select" className="mt-1 rounded-none border-[#E4E4E7]"><SelectValue placeholder="Seleccione" /></SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.nombre} ({b.canton})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Sucursal Destino *</Label>
                <Select value={form.destino_branch_id} onValueChange={(v) => setForm({ ...form, destino_branch_id: v })}>
                  <SelectTrigger data-testid="transfer-dest-select" className="mt-1 rounded-none border-[#E4E4E7]"><SelectValue placeholder="Seleccione" /></SelectTrigger>
                  <SelectContent>
                    {branches.filter((b) => b.id !== form.origen_branch_id).map((b) => <SelectItem key={b.id} value={b.id}>{b.nombre} ({b.canton})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Notas</Label>
                <Input className="mt-1 rounded-none border-[#E4E4E7]" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Opcional" />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-none">Cancelar</Button>
                <Button data-testid="confirm-transfer-btn" onClick={handleTransfer} className="rounded-none bg-[#002fa7] hover:bg-[#001f7a] gap-1">
                  <ArrowRightLeft className="w-4 h-4" /> Transferir
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
