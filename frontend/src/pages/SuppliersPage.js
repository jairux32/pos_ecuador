import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Truck, Plus, Edit2, Trash2, Search, ClipboardList, PackageCheck } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [sForm, setSForm] = useState({ ruc: "", razon_social: "", nombre_comercial: "", contacto_nombre: "", contacto_telefono: "", contacto_email: "", direccion: "", condiciones_pago: "Contado" });
  const [oForm, setOForm] = useState({ proveedor_id: "", items: [{ producto_id: "", producto_nombre: "", cantidad: "", precio_unitario: "" }], notas: "" });

  const loadData = useCallback(async () => {
    try {
      const [sRes, oRes, pRes] = await Promise.all([
        api.get(`/suppliers/?search=${search}`),
        api.get("/suppliers/purchase-orders?limit=50"),
        api.get("/inventory/products?limit=500"),
      ]);
      setSuppliers(sRes.data.suppliers || []);
      setOrders(oRes.data.orders || []);
      setProducts(pRes.data.products || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { loadData(); }, [loadData]);

  const resetSForm = () => { setSForm({ ruc: "", razon_social: "", nombre_comercial: "", contacto_nombre: "", contacto_telefono: "", contacto_email: "", direccion: "", condiciones_pago: "Contado" }); setEditSupplier(null); };

  const handleSaveSupplier = async () => {
    if (!sForm.ruc || !sForm.razon_social) { toast.error("RUC y Razón Social son obligatorios"); return; }
    try {
      if (editSupplier) {
        await api.put(`/suppliers/${editSupplier.id}`, sForm);
        toast.success("Proveedor actualizado");
      } else {
        await api.post("/suppliers/", sForm);
        toast.success("Proveedor creado");
      }
      setSupplierDialogOpen(false);
      loadData();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const handleDeleteSupplier = async (id) => {
    if (!window.confirm("¿Desactivar este proveedor?")) return;
    try { await api.delete(`/suppliers/${id}`); toast.success("Proveedor desactivado"); loadData(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const openEditSupplier = (s) => {
    setEditSupplier(s);
    setSForm({ ruc: s.ruc, razon_social: s.razon_social, nombre_comercial: s.nombre_comercial || "", contacto_nombre: s.contacto_nombre || "", contacto_telefono: s.contacto_telefono || "", contacto_email: s.contacto_email || "", direccion: s.direccion || "", condiciones_pago: s.condiciones_pago || "Contado" });
    setSupplierDialogOpen(true);
  };

  const addOrderItem = () => setOForm({ ...oForm, items: [...oForm.items, { producto_id: "", producto_nombre: "", cantidad: "", precio_unitario: "" }] });
  const removeOrderItem = (i) => setOForm({ ...oForm, items: oForm.items.filter((_, idx) => idx !== i) });
  const updateOrderItem = (i, field, value) => {
    const items = [...oForm.items];
    items[i] = { ...items[i], [field]: value };
    if (field === "producto_id") {
      const p = products.find((pr) => pr.id === value);
      if (p) { items[i].producto_nombre = p.nombre; items[i].precio_unitario = String(p.precio_costo || 0); }
    }
    setOForm({ ...oForm, items });
  };

  const handleCreateOrder = async () => {
    if (!oForm.proveedor_id) { toast.error("Seleccione un proveedor"); return; }
    const validItems = oForm.items.filter((i) => i.producto_id && parseFloat(i.cantidad) > 0);
    if (validItems.length === 0) { toast.error("Agregue al menos un producto"); return; }
    try {
      await api.post("/suppliers/purchase-orders", {
        proveedor_id: oForm.proveedor_id,
        items: validItems.map((i) => ({ producto_id: i.producto_id, producto_nombre: i.producto_nombre, cantidad: parseFloat(i.cantidad), precio_unitario: parseFloat(i.precio_unitario) || 0 })),
        notas: oForm.notas,
      });
      toast.success("Orden de compra creada");
      setOrderDialogOpen(false);
      loadData();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const handleReceive = async () => {
    if (!selectedOrder) return;
    try {
      await api.post("/suppliers/receive-merchandise", {
        order_id: selectedOrder.id,
        items_received: selectedOrder.items.map((i) => ({ producto_id: i.producto_id, cantidad_recibida: i.cantidad })),
      });
      toast.success("Mercadería recibida y stock actualizado");
      setReceiveDialogOpen(false);
      loadData();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const estadoColors = { pendiente: "bg-amber-50 text-amber-700", recibida: "bg-green-50 text-green-700", cancelada: "bg-red-50 text-red-700" };

  return (
    <Layout>
      <div data-testid="suppliers-page" className="space-y-4">
        <h1 className="text-2xl font-black tracking-tight text-[#111]">Proveedores y Compras</h1>
        <Tabs defaultValue="proveedores">
          <TabsList className="rounded-none border border-[#E4E4E7] bg-white">
            <TabsTrigger value="proveedores" className="rounded-none text-sm data-[state=active]:bg-[#002fa7] data-[state=active]:text-white">Proveedores</TabsTrigger>
            <TabsTrigger value="ordenes" className="rounded-none text-sm data-[state=active]:bg-[#002fa7] data-[state=active]:text-white">Órdenes de Compra</TabsTrigger>
          </TabsList>

          <TabsContent value="proveedores" className="space-y-4 mt-4">
            <div className="flex flex-col sm:flex-row gap-3 justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA]" />
                <Input data-testid="supplier-search" placeholder="Buscar proveedor..." className="pl-9 rounded-none border-[#E4E4E7]" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Button data-testid="add-supplier-btn" onClick={() => { resetSForm(); setSupplierDialogOpen(true); }} className="rounded-none bg-[#002fa7] hover:bg-[#001f7a] gap-2"><Plus className="w-4 h-4" /> Nuevo Proveedor</Button>
            </div>
            <div className="border border-[#E4E4E7] bg-white overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-[#FAFAFA]">
                  <TableHead className="text-xs font-bold uppercase">RUC</TableHead>
                  <TableHead className="text-xs font-bold uppercase">Razón Social</TableHead>
                  <TableHead className="text-xs font-bold uppercase">Contacto</TableHead>
                  <TableHead className="text-xs font-bold uppercase">Teléfono</TableHead>
                  <TableHead className="text-xs font-bold uppercase">Condiciones</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-right">Acciones</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {suppliers.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-[#555]">Sin proveedores</TableCell></TableRow>
                  ) : suppliers.map((s) => (
                    <TableRow key={s.id} className="hover:bg-[#FAFAFA]">
                      <TableCell className="text-sm font-mono">{s.ruc}</TableCell>
                      <TableCell className="text-sm font-medium">{s.razon_social}</TableCell>
                      <TableCell className="text-sm text-[#555]">{s.contacto_nombre}</TableCell>
                      <TableCell className="text-sm text-[#555]">{s.contacto_telefono}</TableCell>
                      <TableCell className="text-sm">{s.condiciones_pago}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEditSupplier(s)} className="p-1.5 hover:bg-[#F4F4F5]"><Edit2 className="w-4 h-4 text-[#555]" /></button>
                          <button onClick={() => handleDeleteSupplier(s.id)} className="p-1.5 hover:bg-red-50"><Trash2 className="w-4 h-4 text-red-500" /></button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="ordenes" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button data-testid="create-order-btn" onClick={() => { setOForm({ proveedor_id: "", items: [{ producto_id: "", producto_nombre: "", cantidad: "", precio_unitario: "" }], notas: "" }); setOrderDialogOpen(true); }} className="rounded-none bg-[#002fa7] hover:bg-[#001f7a] gap-2"><ClipboardList className="w-4 h-4" /> Nueva Orden</Button>
            </div>
            <div className="border border-[#E4E4E7] bg-white overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-[#FAFAFA]">
                  <TableHead className="text-xs font-bold uppercase">Fecha</TableHead>
                  <TableHead className="text-xs font-bold uppercase">Proveedor</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-right">Total</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-center">Estado</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-right">Acciones</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-[#555]">Sin órdenes</TableCell></TableRow>
                  ) : orders.map((o) => (
                    <TableRow key={o.id} className="hover:bg-[#FAFAFA]">
                      <TableCell className="text-sm">{new Date(o.created_at).toLocaleDateString("es-EC")}</TableCell>
                      <TableCell className="text-sm font-medium">{o.proveedor_nombre}</TableCell>
                      <TableCell className="text-sm text-right font-semibold">${o.total?.toFixed(2)}</TableCell>
                      <TableCell className="text-center"><Badge className={`rounded-none text-xs ${estadoColors[o.estado] || ""}`}>{o.estado}</Badge></TableCell>
                      <TableCell className="text-right">
                        {o.estado === "pendiente" && (
                          <Button data-testid={`receive-order-${o.id}`} variant="outline" size="sm" onClick={() => { setSelectedOrder(o); setReceiveDialogOpen(true); }} className="rounded-none text-xs gap-1"><PackageCheck className="w-3 h-3" /> Recibir</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
          <DialogContent className="max-w-lg rounded-none border-[#E4E4E7]">
            <DialogHeader><DialogTitle className="text-lg font-bold">{editSupplier ? "Editar Proveedor" : "Nuevo Proveedor"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div><Label className="text-xs font-semibold">RUC *</Label><Input data-testid="supplier-ruc" className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={sForm.ruc} onChange={(e) => setSForm({ ...sForm, ruc: e.target.value.replace(/\D/g, "").slice(0, 13) })} maxLength={13} /></div>
              <div><Label className="text-xs font-semibold">Razón Social *</Label><Input data-testid="supplier-name" className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={sForm.razon_social} onChange={(e) => setSForm({ ...sForm, razon_social: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold">Nombre Comercial</Label><Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={sForm.nombre_comercial} onChange={(e) => setSForm({ ...sForm, nombre_comercial: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold">Contacto</Label><Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={sForm.contacto_nombre} onChange={(e) => setSForm({ ...sForm, contacto_nombre: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold">Teléfono</Label><Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={sForm.contacto_telefono} onChange={(e) => setSForm({ ...sForm, contacto_telefono: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold">Email</Label><Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" type="email" value={sForm.contacto_email} onChange={(e) => setSForm({ ...sForm, contacto_email: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs font-semibold">Dirección</Label><Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={sForm.direccion} onChange={(e) => setSForm({ ...sForm, direccion: e.target.value })} /></div>
              <div><Label className="text-xs font-semibold">Condiciones de Pago</Label>
                <Select value={sForm.condiciones_pago} onValueChange={(v) => setSForm({ ...sForm, condiciones_pago: v })}>
                  <SelectTrigger className="mt-1 rounded-none border-[#E4E4E7] text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Contado", "15 días", "30 días", "60 días", "90 días"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setSupplierDialogOpen(false)} className="rounded-none">Cancelar</Button>
              <Button data-testid="save-supplier-btn" onClick={handleSaveSupplier} className="rounded-none bg-[#002fa7] hover:bg-[#001f7a]">{editSupplier ? "Guardar" : "Crear"}</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
          <DialogContent className="max-w-2xl rounded-none border-[#E4E4E7]">
            <DialogHeader><DialogTitle className="text-lg font-bold">Nueva Orden de Compra</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div><Label className="text-xs font-semibold">Proveedor *</Label>
                <Select value={oForm.proveedor_id} onValueChange={(v) => setOForm({ ...oForm, proveedor_id: v })}>
                  <SelectTrigger className="mt-1 rounded-none border-[#E4E4E7]"><SelectValue placeholder="Seleccione" /></SelectTrigger>
                  <SelectContent>{suppliers.filter((s) => s.is_active !== false).map((s) => <SelectItem key={s.id} value={s.id}>{s.razon_social}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Productos</Label>
                {oForm.items.map((item, i) => (
                  <div key={i} className="flex items-end gap-2 mt-2">
                    <div className="flex-1">
                      <Select value={item.producto_id} onValueChange={(v) => updateOrderItem(i, "producto_id", v)}>
                        <SelectTrigger className="rounded-none border-[#E4E4E7] text-sm"><SelectValue placeholder="Producto" /></SelectTrigger>
                        <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Input className="w-20 rounded-none border-[#E4E4E7] text-sm" type="number" placeholder="Cant." value={item.cantidad} onChange={(e) => updateOrderItem(i, "cantidad", e.target.value)} />
                    <Input className="w-24 rounded-none border-[#E4E4E7] text-sm" type="number" step="0.01" placeholder="P.Unit" value={item.precio_unitario} onChange={(e) => updateOrderItem(i, "precio_unitario", e.target.value)} />
                    {oForm.items.length > 1 && <button onClick={() => removeOrderItem(i)} className="p-2 text-red-500"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addOrderItem} className="mt-2 rounded-none text-xs gap-1"><Plus className="w-3 h-3" /> Agregar</Button>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setOrderDialogOpen(false)} className="rounded-none">Cancelar</Button>
                <Button data-testid="save-order-btn" onClick={handleCreateOrder} className="rounded-none bg-[#002fa7] hover:bg-[#001f7a]">Crear Orden</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
          <DialogContent className="max-w-md rounded-none border-[#E4E4E7]">
            <DialogHeader><DialogTitle className="text-lg font-bold">Recibir Mercadería</DialogTitle></DialogHeader>
            {selectedOrder && (
              <div className="space-y-3 mt-2">
                <p className="text-sm text-[#555]">Orden de: <strong>{selectedOrder.proveedor_nombre}</strong></p>
                <div className="border border-[#E4E4E7]">
                  {selectedOrder.items?.map((item, i) => (
                    <div key={i} className="flex justify-between px-3 py-2 border-b border-[#E4E4E7] last:border-0 text-sm">
                      <span>{item.producto_nombre}</span>
                      <span className="font-semibold">{item.cantidad} unidades</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-[#555]">Al confirmar, el stock de cada producto se incrementará automáticamente.</p>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setReceiveDialogOpen(false)} className="rounded-none">Cancelar</Button>
                  <Button data-testid="confirm-receive-btn" onClick={handleReceive} className="rounded-none bg-green-600 hover:bg-green-700 text-white gap-1"><PackageCheck className="w-4 h-4" /> Confirmar Recepción</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
