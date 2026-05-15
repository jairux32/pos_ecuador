import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { TrendingUp, DollarSign, ShoppingCart, Package, Download, FileText, Calendar } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";

const COLORS = ["#002fa7", "#FF3333", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [salesSummary, setSalesSummary] = useState(null);
  const [byCategory, setByCategory] = useState([]);
  const [byProduct, setByProduct] = useState([]);
  const [byVendor, setByVendor] = useState([]);
  const [invValuation, setInvValuation] = useState(null);
  const [invSummary, setInvSummary] = useState(null);
  const [cashHistory, setCashHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { date_from: dateFrom, date_to: dateTo };
      const [sumRes, catRes, prodRes, vendorRes, valRes, invRes, cashRes] = await Promise.all([
        api.get("/reports/sales-summary", { params }),
        api.get("/reports/sales-by-category", { params }),
        api.get("/reports/sales-by-product", { params }),
        api.get("/reports/sales-by-vendor", { params }),
        api.get("/reports/inventory-valuation"),
        api.get("/reports/invoices-summary", { params }),
        api.get("/reports/cash-register-history"),
      ]);
      setSalesSummary(sumRes.data);
      setByCategory(catRes.data.categories || []);
      setByProduct(prodRes.data.products || []);
      setByVendor(vendorRes.data.vendors || []);
      setInvValuation(valRes.data);
      setInvSummary(invRes.data);
      setCashHistory(cashRes.data.registers || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  const exportSalesExcel = async () => {
    try {
      const res = await api.get(`/reports/export/sales-excel?date_from=${dateFrom}&date_to=${dateTo}`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url; a.download = "ventas.xlsx"; a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel descargado");
    } catch { toast.error("Error exportando"); }
  };
  const exportSalesPdf = async () => {
    try {
      const res = await api.get(`/reports/export/sales-pdf?date_from=${dateFrom}&date_to=${dateTo}`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = "reporte_ventas.pdf"; a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF descargado");
    } catch { toast.error("Error exportando"); }
  };
  const exportInventoryExcel = async () => {
    try {
      const res = await api.get("/reports/export/inventory-excel", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url; a.download = "inventario.xlsx"; a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel descargado");
    } catch { toast.error("Error exportando"); }
  };

  return (
    <Layout>
      <div data-testid="reports-page" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-black tracking-tight text-[#111]">Reportes</h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4 text-[#555]" />
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-none border-[#E4E4E7] text-sm w-36" />
              <span className="text-[#555] text-sm">—</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-none border-[#E4E4E7] text-sm w-36" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40"><div className="animate-spin w-8 h-8 border-2 border-[#002fa7] border-t-transparent rounded-full" /></div>
        ) : (
          <Tabs defaultValue="ventas">
            <TabsList className="rounded-none border border-[#E4E4E7] bg-white">
              <TabsTrigger value="ventas" className="rounded-none text-sm data-[state=active]:bg-[#002fa7] data-[state=active]:text-white">Ventas</TabsTrigger>
              <TabsTrigger value="inventario" className="rounded-none text-sm data-[state=active]:bg-[#002fa7] data-[state=active]:text-white">Inventario</TabsTrigger>
              <TabsTrigger value="comprobantes" className="rounded-none text-sm data-[state=active]:bg-[#002fa7] data-[state=active]:text-white">Comprobantes</TabsTrigger>
              <TabsTrigger value="cierres" className="rounded-none text-sm data-[state=active]:bg-[#002fa7] data-[state=active]:text-white">Cierres de Caja</TabsTrigger>
            </TabsList>

            <TabsContent value="ventas" className="space-y-4 mt-4">
              <div className="flex gap-2">
                <Button data-testid="export-sales-excel" variant="outline" size="sm" onClick={exportSalesExcel} className="rounded-none gap-1 text-xs"><Download className="w-3 h-3" /> Excel</Button>
                <Button data-testid="export-sales-pdf" variant="outline" size="sm" onClick={exportSalesPdf} className="rounded-none gap-1 text-xs"><FileText className="w-3 h-3" /> PDF</Button>
              </div>

              {salesSummary && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      { label: "Total Ventas", value: `$${salesSummary.total_ventas}`, icon: DollarSign },
                      { label: "# Ventas", value: salesSummary.num_ventas, icon: ShoppingCart },
                      { label: "Promedio", value: `$${salesSummary.promedio_venta}`, icon: TrendingUp },
                      { label: "IVA Cobrado", value: `$${salesSummary.total_iva}`, icon: DollarSign },
                      { label: "Descuentos", value: `$${salesSummary.total_descuentos}`, icon: DollarSign },
                    ].map((c) => (
                      <Card key={c.label} className="border border-[#E4E4E7] rounded-none shadow-none">
                        <CardContent className="p-3">
                          <p className="text-xs text-[#555] uppercase tracking-wider font-bold">{c.label}</p>
                          <p className="text-xl font-black text-[#111] mt-1">{c.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {salesSummary.chart_diario?.length > 0 && (
                    <Card className="border border-[#E4E4E7] rounded-none shadow-none">
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-bold uppercase tracking-wider">Ventas por Día</CardTitle></CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                          <LineChart data={salesSummary.chart_diario}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
                            <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Line type="monotone" dataKey="total" stroke="#002fa7" strokeWidth={2} dot={{ fill: "#002fa7" }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {byCategory.length > 0 && (
                      <Card className="border border-[#E4E4E7] rounded-none shadow-none">
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-bold uppercase tracking-wider">Ventas por Categoría</CardTitle></CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie data={byCategory} dataKey="total" nameKey="categoria" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}
                    {byVendor.length > 0 && (
                      <Card className="border border-[#E4E4E7] rounded-none shadow-none">
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-bold uppercase tracking-wider">Ventas por Vendedor</CardTitle></CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={byVendor} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
                              <XAxis type="number" tick={{ fontSize: 10 }} />
                              <YAxis dataKey="vendedor" type="category" width={100} tick={{ fontSize: 10 }} />
                              <Tooltip />
                              <Bar dataKey="total" fill="#002fa7" />
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {byProduct.length > 0 && (
                    <Card className="border border-[#E4E4E7] rounded-none shadow-none">
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-bold uppercase tracking-wider">Top Productos Vendidos</CardTitle></CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader><TableRow className="bg-[#FAFAFA]">
                            <TableHead className="text-xs font-bold uppercase">Producto</TableHead>
                            <TableHead className="text-xs font-bold uppercase text-right">Cantidad</TableHead>
                            <TableHead className="text-xs font-bold uppercase text-right">Total</TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {byProduct.slice(0, 10).map((p, i) => (
                              <TableRow key={i}><TableCell className="text-sm">{p.nombre}</TableCell><TableCell className="text-sm text-right">{p.cantidad}</TableCell><TableCell className="text-sm text-right font-semibold">${p.total}</TableCell></TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="inventario" className="space-y-4 mt-4">
              <Button data-testid="export-inventory-excel" variant="outline" size="sm" onClick={exportInventoryExcel} className="rounded-none gap-1 text-xs"><Download className="w-3 h-3" /> Exportar Inventario Excel</Button>
              {invValuation && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      { label: "Productos", value: invValuation.total_productos },
                      { label: "Items en Stock", value: invValuation.total_items },
                      { label: "Valor Costo", value: `$${invValuation.valor_costo}` },
                      { label: "Valor Venta", value: `$${invValuation.valor_venta}` },
                      { label: "Margen Bruto", value: `$${invValuation.margen_bruto}` },
                    ].map((c) => (
                      <Card key={c.label} className="border border-[#E4E4E7] rounded-none shadow-none">
                        <CardContent className="p-3">
                          <p className="text-xs text-[#555] uppercase tracking-wider font-bold">{c.label}</p>
                          <p className="text-xl font-black text-[#111] mt-1">{c.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  {invValuation.por_categoria?.length > 0 && (
                    <Card className="border border-[#E4E4E7] rounded-none shadow-none">
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-bold uppercase tracking-wider">Valorización por Categoría</CardTitle></CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={invValuation.por_categoria}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
                            <XAxis dataKey="categoria" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Bar dataKey="costo" fill="#A1A1AA" name="Costo" />
                            <Bar dataKey="venta" fill="#002fa7" name="Venta" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="comprobantes" className="space-y-4 mt-4">
              {invSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="border border-[#E4E4E7] rounded-none shadow-none"><CardContent className="p-3"><p className="text-xs text-[#555] uppercase font-bold">Total Comprobantes</p><p className="text-xl font-black mt-1">{invSummary.total_comprobantes}</p></CardContent></Card>
                  {Object.entries(invSummary.por_estado || {}).map(([k, v]) => (
                    <Card key={k} className="border border-[#E4E4E7] rounded-none shadow-none"><CardContent className="p-3"><p className="text-xs text-[#555] uppercase font-bold">{k}</p><p className="text-xl font-black mt-1">{v}</p></CardContent></Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="cierres" className="space-y-4 mt-4">
              <Card className="border border-[#E4E4E7] rounded-none shadow-none">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-bold uppercase tracking-wider">Historial de Cierres</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow className="bg-[#FAFAFA]">
                      <TableHead className="text-xs font-bold uppercase">Fecha Cierre</TableHead>
                      <TableHead className="text-xs font-bold uppercase">Cajero</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-right">Ventas</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-right">Esperado</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-right">Contado</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-right">Diferencia</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {cashHistory.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-4 text-[#555]">Sin cierres</TableCell></TableRow>
                      ) : cashHistory.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm">{r.closed_at ? new Date(r.closed_at).toLocaleString("es-EC") : "—"}</TableCell>
                          <TableCell className="text-sm">{r.usuario_nombre}</TableCell>
                          <TableCell className="text-sm text-right">${r.total_ventas?.toFixed(2)}</TableCell>
                          <TableCell className="text-sm text-right">${r.efectivo_esperado?.toFixed(2)}</TableCell>
                          <TableCell className="text-sm text-right">${r.efectivo_contado?.toFixed(2)}</TableCell>
                          <TableCell className={`text-sm text-right font-semibold ${(r.diferencia || 0) < 0 ? "text-red-600" : "text-green-600"}`}>
                            ${r.diferencia?.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </Layout>
  );
}
