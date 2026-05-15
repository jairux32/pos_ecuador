import React, { useState, useEffect, useCallback, useRef } from "react";
import Layout from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Package, Plus, Search, Edit2, Trash2, AlertTriangle, ArrowUpDown, Upload, Download, Camera } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import BarcodeScanner from "../components/BarcodeScanner";

export default function InventoryPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showLowStock, setShowLowStock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [units, setUnits] = useState([]);
  const [ivaRates, setIvaRates] = useState([]);
  const [adjustReasons, setAdjustReasons] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    nombre: "", codigo_interno: "", codigo_barras: "", descripcion: "",
    categoria_nombre: "General", unidad_medida: "Unidad",
    precio_costo: "", precio_venta: "", iva_porcentaje: "15",
    stock_actual: "0", stock_minimo: "0", stock_maximo: "1000", ubicacion: "",
  });

  const [adjustForm, setAdjustForm] = useState({ tipo: "entrada", cantidad: "", motivo: "", notas: "" });

  const loadProducts = useCallback(async () => {
    try {
      const params = { page, limit: 50 };
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      if (showLowStock) params.low_stock = true;
      const res = await api.get("/inventory/products", { params });
      setProducts(res.data.products);
      setTotal(res.data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, showLowStock]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const [catRes, unitRes, ivaRes, adjRes] = await Promise.all([
          api.get("/inventory/categories"),
          api.get("/inventory/units"),
          api.get("/inventory/iva-rates"),
          api.get("/inventory/adjustment-reasons"),
        ]);
        setCategories(catRes.data.categories || []);
        setUnits(unitRes.data.units || []);
        setIvaRates(ivaRes.data.rates || []);
        setAdjustReasons(adjRes.data.reasons || []);
      } catch (e) { console.error(e); }
    };
    loadMeta();
  }, []);

  const resetForm = () => {
    setForm({ nombre: "", codigo_interno: "", codigo_barras: "", descripcion: "", categoria_nombre: "General", unidad_medida: "Unidad", precio_costo: "", precio_venta: "", iva_porcentaje: "15", stock_actual: "0", stock_minimo: "0", stock_maximo: "1000", ubicacion: "" });
    setEditProduct(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (p) => {
    setEditProduct(p);
    setForm({
      nombre: p.nombre, codigo_interno: p.codigo_interno || "", codigo_barras: p.codigo_barras || "",
      descripcion: p.descripcion || "", categoria_nombre: p.categoria_nombre || "General",
      unidad_medida: p.unidad_medida || "Unidad", precio_costo: String(p.precio_costo || ""),
      precio_venta: String(p.precio_venta || ""), iva_porcentaje: String(p.iva_porcentaje ?? "15"),
      stock_actual: String(p.stock_actual || "0"), stock_minimo: String(p.stock_minimo || "0"),
      stock_maximo: String(p.stock_maximo || "1000"), ubicacion: p.ubicacion || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nombre || !form.precio_venta) { toast.error("Nombre y precio de venta son obligatorios"); return; }
    try {
      const data = {
        ...form,
        precio_costo: parseFloat(form.precio_costo) || 0,
        precio_venta: parseFloat(form.precio_venta) || 0,
        iva_porcentaje: parseFloat(form.iva_porcentaje) || 15,
        stock_actual: parseFloat(form.stock_actual) || 0,
        stock_minimo: parseFloat(form.stock_minimo) || 0,
        stock_maximo: parseFloat(form.stock_maximo) || 1000,
      };
      if (editProduct) {
        await api.put(`/inventory/products/${editProduct.id}`, data);
        toast.success("Producto actualizado");
      } else {
        await api.post("/inventory/products", data);
        toast.success("Producto creado");
      }
      setDialogOpen(false);
      loadProducts();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar este producto?")) return;
    try {
      await api.delete(`/inventory/products/${id}`);
      toast.success("Producto eliminado");
      loadProducts();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const handleAdjust = async () => {
    if (!adjustForm.cantidad || !adjustForm.motivo) { toast.error("Cantidad y motivo son obligatorios"); return; }
    try {
      await api.post("/inventory/stock-adjustment", {
        producto_id: adjustProduct.id,
        tipo: adjustForm.tipo,
        cantidad: parseFloat(adjustForm.cantidad),
        motivo: adjustForm.motivo,
        notas: adjustForm.notas,
      });
      toast.success("Stock ajustado");
      setAdjustDialogOpen(false);
      loadProducts();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const handleBarcodeScan = (code) => {
    setScannerOpen(false);
    setSearch(code);
    setPage(1);
    toast.success(`Código escaneado: ${code}`);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/inventory/import-csv", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(res.data.message);
      if (res.data.errors?.length > 0) {
        toast.error(`Errores: ${res.data.errors.slice(0, 3).join("; ")}`);
      }
      loadProducts();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await api.get("/inventory/export-template", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url; a.download = "plantilla_productos.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Error descargando plantilla"); }
  };

  return (
    <Layout>
      <div data-testid="inventory-page" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#111]">Inventario</h1>
            <p className="text-sm text-[#555]">{total} productos</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleImport} className="hidden" />
            <Button data-testid="download-template-btn" variant="outline" size="sm" onClick={downloadTemplate} className="rounded-none gap-1 text-xs">
              <Download className="w-3 h-3" /> Plantilla
            </Button>
            <Button data-testid="import-products-btn" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing} className="rounded-none gap-1 text-xs">
              <Upload className="w-3 h-3" /> {importing ? "Importando..." : "Importar"}
            </Button>
            <Button data-testid="add-product-btn" onClick={openCreate} className="rounded-none bg-[#002fa7] hover:bg-[#001f7a] gap-2">
              <Plus className="w-4 h-4" /> Nuevo Producto
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA]" />
            <Input
              data-testid="inventory-search"
              placeholder="Buscar por nombre, código..."
              className="pl-9 rounded-none border-[#E4E4E7]"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Button data-testid="scan-barcode-btn" variant="outline" onClick={() => setScannerOpen(true)} className="rounded-none gap-2">
            <Camera className="w-4 h-4" /> Escanear
          </Button>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger data-testid="category-filter" className="w-[180px] rounded-none border-[#E4E4E7]"><SelectValue placeholder="Categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categories.map((c) => (<SelectItem key={c.id} value={c.nombre}>{c.nombre}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button
            data-testid="low-stock-filter"
            variant={showLowStock ? "default" : "outline"}
            onClick={() => { setShowLowStock(!showLowStock); setPage(1); }}
            className={`rounded-none gap-2 ${showLowStock ? "bg-[#FF3333] hover:bg-red-700" : ""}`}
          >
            <AlertTriangle className="w-4 h-4" /> Stock Bajo
          </Button>
        </div>

        <div className="border border-[#E4E4E7] bg-white overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#FAFAFA]">
                <TableHead className="text-xs font-bold uppercase tracking-wider">Código</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Producto</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Categoría</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-right">P. Venta</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-right">Stock</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-center">IVA</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-[#555]">Cargando...</TableCell></TableRow>
              ) : products.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-[#555]">Sin productos</TableCell></TableRow>
              ) : products.map((p) => (
                <TableRow key={p.id} className="hover:bg-[#FAFAFA] transition-colors">
                  <TableCell className="text-sm font-mono">{p.codigo_interno}</TableCell>
                  <TableCell>
                    <p className="text-sm font-medium text-[#111]">{p.nombre}</p>
                    {p.codigo_barras && <p className="text-xs text-[#A1A1AA]">{p.codigo_barras}</p>}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="rounded-none text-xs">{p.categoria_nombre}</Badge></TableCell>
                  <TableCell className="text-sm text-right font-semibold">${p.precio_venta?.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <span className={`text-sm font-semibold ${p.stock_actual <= p.stock_minimo ? "text-[#FF3333]" : "text-[#111]"}`}>
                      {p.stock_actual}
                    </span>
                    <span className="text-xs text-[#A1A1AA]"> / {p.stock_minimo}</span>
                  </TableCell>
                  <TableCell className="text-center text-sm">{p.iva_porcentaje}%</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button data-testid={`adjust-stock-${p.id}`} onClick={() => { setAdjustProduct(p); setAdjustForm({ tipo: "entrada", cantidad: "", motivo: "", notas: "" }); setAdjustDialogOpen(true); }} className="p-1.5 hover:bg-[#F4F4F5] transition-colors" title="Ajustar Stock">
                        <ArrowUpDown className="w-4 h-4 text-[#555]" />
                      </button>
                      <button data-testid={`edit-product-${p.id}`} onClick={() => openEdit(p)} className="p-1.5 hover:bg-[#F4F4F5] transition-colors" title="Editar">
                        <Edit2 className="w-4 h-4 text-[#555]" />
                      </button>
                      <button data-testid={`delete-product-${p.id}`} onClick={() => handleDelete(p.id)} className="p-1.5 hover:bg-red-50 transition-colors" title="Eliminar">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl rounded-none border-[#E4E4E7]">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#111]">
                {editProduct ? "Editar Producto" : "Nuevo Producto"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <Label className="text-xs font-semibold">Nombre *</Label>
                <Input data-testid="product-name-input" className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Código Interno</Label>
                <Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={form.codigo_interno} onChange={(e) => setForm({ ...form, codigo_interno: e.target.value })} placeholder="Auto-generado" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Código de Barras</Label>
                <Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={form.codigo_barras} onChange={(e) => setForm({ ...form, codigo_barras: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Categoría</Label>
                <Select value={form.categoria_nombre} onValueChange={(v) => setForm({ ...form, categoria_nombre: v })}>
                  <SelectTrigger className="mt-1 rounded-none border-[#E4E4E7] text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (<SelectItem key={c.id} value={c.nombre}>{c.nombre}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Unidad de Medida</Label>
                <Select value={form.unidad_medida} onValueChange={(v) => setForm({ ...form, unidad_medida: v })}>
                  <SelectTrigger className="mt-1 rounded-none border-[#E4E4E7] text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (<SelectItem key={u} value={u}>{u}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">IVA</Label>
                <Select value={form.iva_porcentaje} onValueChange={(v) => setForm({ ...form, iva_porcentaje: v })}>
                  <SelectTrigger className="mt-1 rounded-none border-[#E4E4E7] text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ivaRates.map((r) => (<SelectItem key={r.codigo} value={String(r.porcentaje)}>{r.descripcion}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Precio Costo ($)</Label>
                <Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" type="number" step="0.01" value={form.precio_costo} onChange={(e) => setForm({ ...form, precio_costo: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Precio Venta ($) *</Label>
                <Input data-testid="product-price-input" className="mt-1 rounded-none border-[#E4E4E7] text-sm" type="number" step="0.01" value={form.precio_venta} onChange={(e) => setForm({ ...form, precio_venta: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Stock Actual</Label>
                <Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" type="number" value={form.stock_actual} onChange={(e) => setForm({ ...form, stock_actual: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Stock Mínimo</Label>
                <Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" type="number" value={form.stock_minimo} onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs font-semibold">Descripción</Label>
                <Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-none">Cancelar</Button>
              <Button data-testid="save-product-btn" onClick={handleSave} className="rounded-none bg-[#002fa7] hover:bg-[#001f7a]">
                {editProduct ? "Guardar Cambios" : "Crear Producto"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
          <DialogContent className="max-w-md rounded-none border-[#E4E4E7]">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-[#111]">Ajustar Stock</DialogTitle>
            </DialogHeader>
            {adjustProduct && (
              <div className="space-y-4 mt-2">
                <p className="text-sm"><strong>{adjustProduct.nombre}</strong> — Stock actual: {adjustProduct.stock_actual}</p>
                <div>
                  <Label className="text-xs font-semibold">Tipo</Label>
                  <Select value={adjustForm.tipo} onValueChange={(v) => setAdjustForm({ ...adjustForm, tipo: v })}>
                    <SelectTrigger className="mt-1 rounded-none border-[#E4E4E7]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entrada">Entrada</SelectItem>
                      <SelectItem value="salida">Salida</SelectItem>
                      <SelectItem value="ajuste">Ajuste (Nuevo valor)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Cantidad</Label>
                  <Input className="mt-1 rounded-none border-[#E4E4E7]" type="number" value={adjustForm.cantidad} onChange={(e) => setAdjustForm({ ...adjustForm, cantidad: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Motivo</Label>
                  <Select value={adjustForm.motivo} onValueChange={(v) => setAdjustForm({ ...adjustForm, motivo: v })}>
                    <SelectTrigger className="mt-1 rounded-none border-[#E4E4E7]"><SelectValue placeholder="Seleccione" /></SelectTrigger>
                    <SelectContent>
                      {adjustReasons.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setAdjustDialogOpen(false)} className="rounded-none">Cancelar</Button>
                  <Button data-testid="confirm-adjust-btn" onClick={handleAdjust} className="rounded-none bg-[#002fa7] hover:bg-[#001f7a]">Confirmar</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleBarcodeScan} />
      </div>
    </Layout>
  );
}
