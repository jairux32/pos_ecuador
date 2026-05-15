import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, DollarSign, CreditCard,
  ArrowRightLeft, X, Banknote, Calculator, Lock, Unlock, Camera
} from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";
import BarcodeScanner from "../components/BarcodeScanner";
import { savePendingSale, getCachedProducts, cacheProducts } from "../lib/offlineDb";

export default function POSPage() {
  const { user } = useAuth();
  const searchRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState([]);
  const [descuentoGlobal, setDescuentoGlobal] = useState(0);
  const [register, setRegister] = useState(null);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [montoInicial, setMontoInicial] = useState("0");
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [efectivoContado, setEfectivoContado] = useState("");

  const [cliente, setCliente] = useState({
    tipo_identificacion: "consumidor_final", identificacion: "",
    nombre: "Consumidor Final", email: "", telefono: "", direccion: "",
  });
  const [tipoDocumento, setTipoDocumento] = useState("ninguno");
  const [pagos, setPagos] = useState([{ metodo: "efectivo", monto: "", referencia: "" }]);
  const [processing, setProcessing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const branchId = user?.branch_ids?.[0] || "";

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  useEffect(() => {
    // Cache products for offline use
    const cacheAll = async () => {
      try {
        const res = await api.get("/inventory/products?limit=500");
        await cacheProducts(res.data.products || []);
      } catch {}
    };
    if (isOnline) cacheAll();
  }, [isOnline]);

  useEffect(() => {
    const loadRegister = async () => {
      try {
        const res = await api.get(`/pos/active-register?branch_id=${branchId}`);
        setRegister(res.data.register);
        if (!res.data.register) setRegisterDialogOpen(true);
      } catch (e) { console.error(e); }
    };
    loadRegister();
  }, [branchId]);

  const searchProducts = useCallback(async (q) => {
    if (!q || q.length < 2) { setProducts([]); return; }
    try {
      if (isOnline) {
        const res = await api.get(`/inventory/products?search=${encodeURIComponent(q)}&limit=10`);
        setProducts(res.data.products || []);
      } else {
        const cached = await getCachedProducts(q);
        setProducts(cached.slice(0, 10));
      }
    } catch (e) {
      // Fallback to offline cache
      try {
        const cached = await getCachedProducts(q);
        setProducts(cached.slice(0, 10));
      } catch { console.error(e); }
    }
  }, [isOnline]);

  useEffect(() => {
    const timer = setTimeout(() => searchProducts(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchProducts]);

  const addToCart = (product) => {
    const existing = cart.find((c) => c.producto_id === product.id);
    if (existing) {
      if (existing.cantidad >= product.stock_actual) { toast.error("Stock insuficiente"); return; }
      setCart(cart.map((c) => c.producto_id === product.id ? { ...c, cantidad: c.cantidad + 1 } : c));
    } else {
      if (product.stock_actual <= 0) { toast.error("Sin stock"); return; }
      setCart([...cart, {
        producto_id: product.id, nombre: product.nombre,
        cantidad: 1, precio_unitario: product.precio_venta,
        descuento: 0, iva_porcentaje: product.iva_porcentaje || 15,
        stock_disponible: product.stock_actual,
      }]);
    }
    setSearchQuery("");
    setProducts([]);
    searchRef.current?.focus();
  };

  const updateQty = (id, delta) => {
    setCart(cart.map((c) => {
      if (c.producto_id !== id) return c;
      const newQty = c.cantidad + delta;
      if (newQty <= 0) return c;
      if (newQty > c.stock_disponible) { toast.error("Stock insuficiente"); return c; }
      return { ...c, cantidad: newQty };
    }));
  };

  const removeFromCart = (id) => setCart(cart.filter((c) => c.producto_id !== id));

  const handleBarcodeScan = (code) => {
    setScannerOpen(false);
    setSearchQuery(code);
    toast.success(`Código: ${code}`);
  };

  const subtotalSinIva = cart.reduce((sum, c) => sum + (c.cantidad * c.precio_unitario - c.descuento), 0);
  const totalIva = cart.reduce((sum, c) => {
    const sub = c.cantidad * c.precio_unitario - c.descuento;
    return sum + sub * (c.iva_porcentaje / 100);
  }, 0);
  const total = subtotalSinIva - descuentoGlobal + totalIva;
  const totalPagado = pagos.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
  const cambio = totalPagado - total;

  const openRegister = async () => {
    try {
      const res = await api.post("/pos/open-register", { monto_inicial: parseFloat(montoInicial) || 0, branch_id: branchId });
      setRegister(res.data);
      setRegisterDialogOpen(false);
      toast.success("Caja abierta");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const handleCloseRegister = async () => {
    if (!register) return;
    try {
      const res = await api.post("/pos/close-register", {
        register_id: register.id,
        efectivo_contado: parseFloat(efectivoContado) || 0,
      });
      toast.success("Caja cerrada exitosamente");
      setCloseDialogOpen(false);
      setRegister(null);
      setRegisterDialogOpen(true);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const handleSell = async () => {
    if (cart.length === 0) { toast.error("Agregue productos al carrito"); return; }
    if (totalPagado < total) { toast.error("El pago es insuficiente"); return; }
    setProcessing(true);
    try {
      const res = await api.post("/pos/sell", {
        items: cart.map((c) => ({
          producto_id: c.producto_id, nombre: c.nombre,
          cantidad: c.cantidad, precio_unitario: c.precio_unitario,
          descuento: c.descuento, iva_porcentaje: c.iva_porcentaje,
        })),
        pagos: pagos.filter((p) => parseFloat(p.monto) > 0).map((p) => ({
          metodo: p.metodo, monto: parseFloat(p.monto), referencia: p.referencia,
        })),
        cliente,
        tipo_documento: tipoDocumento,
        descuento_global: descuentoGlobal,
        branch_id: branchId,
      });

      if (tipoDocumento !== "ninguno") {
        try {
          const tipoDoc = tipoDocumento === "factura" ? "01" : "02";
          await api.post("/invoices/generate", { sale_id: res.data.id, tipo_documento: tipoDoc });
          toast.success("Venta completada y comprobante generado");
        } catch (invErr) {
          toast.success("Venta completada (error generando comprobante)");
        }
      } else {
        toast.success(`Venta completada — Cambio: $${res.data.cambio?.toFixed(2)}`);
      }

      setCart([]);
      setDescuentoGlobal(0);
      setCliente({ tipo_identificacion: "consumidor_final", identificacion: "", nombre: "Consumidor Final", email: "", telefono: "", direccion: "" });
      setTipoDocumento("ninguno");
      setPagos([{ metodo: "efectivo", monto: "", referencia: "" }]);
      setPayDialogOpen(false);
      searchRef.current?.focus();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setProcessing(false);
    }
  };

  const openPayDialog = () => {
    if (cart.length === 0) { toast.error("Agregue productos"); return; }
    setPagos([{ metodo: "efectivo", monto: String(total.toFixed(2)), referencia: "" }]);
    setPayDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      <header className="bg-white border-b border-[#E4E4E7] px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-5 h-5 text-[#002fa7]" />
          <span className="font-bold text-[#111]">Punto de Venta</span>
          {register && (
            <Badge className="rounded-none bg-green-50 text-green-700 border-green-200">
              <Unlock className="w-3 h-3 mr-1" /> Caja Abierta
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {register && (
            <Button data-testid="close-register-btn" variant="outline" size="sm" onClick={() => { setEfectivoContado(""); setCloseDialogOpen(true); }} className="rounded-none gap-1 text-xs">
              <Lock className="w-3 h-3" /> Cerrar Caja
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => window.history.back()} className="rounded-none text-xs">
            Volver
          </Button>
        </div>
      </header>

      <div data-testid="pos-page" className="flex-1 flex flex-col lg:flex-row">
        <div className="flex-1 p-4 flex flex-col">
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA]" />
              <Input
                ref={searchRef}
                data-testid="pos-search"
                placeholder="Buscar producto (nombre, código, código de barras)..."
                className="pl-9 rounded-none border-[#E4E4E7] h-12 text-base"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              {products.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border border-[#E4E4E7] border-t-0 z-10 max-h-64 overflow-y-auto shadow-lg">
                {products.map((p) => (
                  <button
                    key={p.id}
                    data-testid={`pos-product-${p.id}`}
                    onClick={() => addToCart(p)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#F4F4F5] transition-colors text-left border-b border-[#E4E4E7] last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#111]">{p.nombre}</p>
                      <p className="text-xs text-[#555]">{p.codigo_interno} — Stock: {p.stock_actual}</p>
                    </div>
                    <p className="text-sm font-bold text-[#002fa7]">${p.precio_venta?.toFixed(2)}</p>
                  </button>
                ))}
              </div>
            )}
            </div>
            <Button data-testid="pos-scan-btn" variant="outline" onClick={() => setScannerOpen(true)} className="rounded-none h-12 px-4"><Camera className="w-5 h-5" /></Button>
          </div>

          <div className="flex-1 bg-white border border-[#E4E4E7] overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[#A1A1AA]">
                <div className="text-center">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Busque y agregue productos</p>
                </div>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-[#FAFAFA] sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider">Producto</th>
                    <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider">Cant.</th>
                    <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider">P.Unit</th>
                    <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider">Subtotal</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.producto_id} className="border-b border-[#E4E4E7]">
                      <td className="px-3 py-2">
                        <p className="text-sm font-medium text-[#111]">{item.nombre}</p>
                        <p className="text-xs text-[#A1A1AA]">IVA {item.iva_porcentaje}%</p>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button data-testid={`qty-minus-${item.producto_id}`} onClick={() => updateQty(item.producto_id, -1)} className="w-7 h-7 border border-[#E4E4E7] flex items-center justify-center hover:bg-[#F4F4F5]">
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-8 text-center text-sm font-semibold">{item.cantidad}</span>
                          <button data-testid={`qty-plus-${item.producto_id}`} onClick={() => updateQty(item.producto_id, 1)} className="w-7 h-7 border border-[#E4E4E7] flex items-center justify-center hover:bg-[#F4F4F5]">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm">${item.precio_unitario.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-sm font-semibold">
                        ${(item.cantidad * item.precio_unitario - item.descuento).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeFromCart(item.producto_id)} className="p-1 hover:bg-red-50 text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="w-full lg:w-[340px] bg-white border-l border-[#E4E4E7] flex flex-col">
          <div className="p-4 border-b border-[#E4E4E7]">
            <p className="text-xs font-bold uppercase tracking-wider text-[#555] mb-2">Resumen</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-[#555]">Subtotal</span><span>${subtotalSinIva.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-[#555]">IVA</span><span>${totalIva.toFixed(2)}</span></div>
              {descuentoGlobal > 0 && (
                <div className="flex justify-between text-red-500"><span>Descuento</span><span>-${descuentoGlobal.toFixed(2)}</span></div>
              )}
              <div className="flex justify-between text-xl font-black pt-2 border-t border-[#E4E4E7]">
                <span>Total</span>
                <span data-testid="pos-total">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="p-4 flex-1">
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold">Documento</Label>
                <Select value={tipoDocumento} onValueChange={setTipoDocumento}>
                  <SelectTrigger data-testid="doc-type-select" className="mt-1 rounded-none border-[#E4E4E7] text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">Sin Comprobante</SelectItem>
                    <SelectItem value="factura">Factura</SelectItem>
                    <SelectItem value="nota_venta">Nota de Venta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Cliente</Label>
                <Input
                  data-testid="pos-client-name"
                  className="mt-1 rounded-none border-[#E4E4E7] text-sm"
                  value={cliente.nombre}
                  onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })}
                  placeholder="Consumidor Final"
                />
              </div>
              {tipoDocumento !== "ninguno" && (
                <div>
                  <Label className="text-xs font-semibold">Identificación</Label>
                  <Input
                    data-testid="pos-client-id"
                    className="mt-1 rounded-none border-[#E4E4E7] text-sm"
                    value={cliente.identificacion}
                    onChange={(e) => setCliente({ ...cliente, identificacion: e.target.value })}
                    placeholder="Cédula o RUC"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-t border-[#E4E4E7]">
            <Button
              data-testid="pos-pay-btn"
              onClick={openPayDialog}
              disabled={cart.length === 0 || !register}
              className="w-full h-14 rounded-none bg-[#002fa7] hover:bg-[#001f7a] text-lg font-bold gap-2"
            >
              <DollarSign className="w-5 h-5" /> Cobrar ${total.toFixed(2)}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={registerDialogOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm rounded-none border-[#E4E4E7]" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Abrir Caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-[#555]">Ingrese el monto inicial en caja para comenzar.</p>
            <div>
              <Label className="text-xs font-semibold">Monto Inicial ($)</Label>
              <Input data-testid="register-initial-amount" className="mt-1 rounded-none border-[#E4E4E7]" type="number" step="0.01" value={montoInicial} onChange={(e) => setMontoInicial(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.history.back()} className="flex-1 rounded-none">Cancelar</Button>
              <Button data-testid="open-register-btn" onClick={openRegister} className="flex-1 rounded-none bg-[#002fa7] hover:bg-[#001f7a]">Abrir Caja</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-md rounded-none border-[#E4E4E7]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Cobro — ${total.toFixed(2)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {pagos.map((pago, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs font-semibold">Método</Label>
                  <Select value={pago.metodo} onValueChange={(v) => { const p = [...pagos]; p[idx].metodo = v; setPagos(p); }}>
                    <SelectTrigger className="mt-1 rounded-none border-[#E4E4E7] text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs font-semibold">Monto ($)</Label>
                  <Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" type="number" step="0.01" value={pago.monto} onChange={(e) => { const p = [...pagos]; p[idx].monto = e.target.value; setPagos(p); }} />
                </div>
                {pagos.length > 1 && (
                  <button onClick={() => setPagos(pagos.filter((_, i) => i !== idx))} className="p-2 text-red-500"><X className="w-4 h-4" /></button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setPagos([...pagos, { metodo: "efectivo", monto: "", referencia: "" }])} className="rounded-none text-xs gap-1">
              <Plus className="w-3 h-3" /> Agregar Método
            </Button>

            <div className="border-t border-[#E4E4E7] pt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Total a cobrar</span><span className="font-bold">${total.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Total pagado</span><span className="font-bold">${totalPagado.toFixed(2)}</span></div>
              {cambio >= 0 && totalPagado > 0 && (
                <div className="flex justify-between text-green-600 font-bold text-lg">
                  <span>Cambio</span><span data-testid="pos-change">${cambio.toFixed(2)}</span>
                </div>
              )}
            </div>

            <Button data-testid="confirm-sale-btn" onClick={handleSell} disabled={processing || totalPagado < total} className="w-full rounded-none bg-[#002fa7] hover:bg-[#001f7a] h-12 font-bold">
              {processing ? "Procesando..." : "Confirmar Venta"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="max-w-sm rounded-none border-[#E4E4E7]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Cerrar Caja</DialogTitle>
          </DialogHeader>
          {register && (
            <div className="space-y-4 mt-2">
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-[#555]">Monto Inicial</span><span>${register.monto_inicial?.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-[#555]">Ventas Efectivo</span><span>${register.ventas_efectivo?.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-[#555]">Ventas Tarjeta</span><span>${register.ventas_tarjeta?.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-[#555]">Ventas Transferencia</span><span>${register.ventas_transferencia?.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1"><span>Total Ventas</span><span>${register.total_ventas?.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-[#555]"># Ventas</span><span>{register.num_ventas}</span></div>
              </div>
              <div>
                <Label className="text-xs font-semibold">Efectivo Contado ($)</Label>
                <Input data-testid="close-register-amount" className="mt-1 rounded-none border-[#E4E4E7]" type="number" step="0.01" value={efectivoContado} onChange={(e) => setEfectivoContado(e.target.value)} />
              </div>
              <Button data-testid="confirm-close-register-btn" onClick={handleCloseRegister} className="w-full rounded-none bg-[#FF3333] hover:bg-red-700 text-white">Cerrar Caja</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleBarcodeScan} />
    </div>
  );
}
