import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Package, ShoppingCart, AlertTriangle, Users, TrendingUp, DollarSign } from "lucide-react";
import api from "../lib/api";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.business_id) {
      navigate("/setup");
      return;
    }
    const load = async () => {
      try {
        const [statsRes, lowStockRes, salesRes] = await Promise.all([
          api.get("/pos/dashboard-stats"),
          api.get("/inventory/low-stock"),
          api.get("/pos/sales?limit=5"),
        ]);
        setStats(statsRes.data);
        setLowStockProducts(lowStockRes.data.products || []);
        setRecentSales(salesRes.data.sales || []);
      } catch (e) {
        console.error("Error loading dashboard", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, navigate]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-[#002fa7] border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  const statCards = [
    { label: "Productos", value: stats?.total_products || 0, icon: Package, color: "text-[#002fa7]", bg: "bg-blue-50" },
    { label: "Ventas Hoy", value: stats?.num_ventas_hoy || 0, icon: ShoppingCart, color: "text-green-600", bg: "bg-green-50" },
    { label: "Ingresos Hoy", value: `$${(stats?.ventas_hoy || 0).toFixed(2)}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Stock Bajo", value: stats?.low_stock_count || 0, icon: AlertTriangle, color: stats?.low_stock_count > 0 ? "text-[#FF3333]" : "text-[#555]", bg: stats?.low_stock_count > 0 ? "bg-red-50" : "bg-gray-50" },
    { label: "Clientes", value: stats?.total_clients || 0, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <Layout>
      <div data-testid="dashboard-page" className="space-y-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#111]">Panel de Control</h1>
          <p className="text-sm text-[#555] mt-1">Bienvenido, {user?.name}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="border border-[#E4E4E7] rounded-none shadow-none hover:-translate-y-0.5 transition-transform duration-150">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-8 h-8 ${card.bg} flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${card.color}`} />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-[#111]">{card.value}</p>
                  <p className="text-xs text-[#555] uppercase tracking-wider font-bold mt-1">{card.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border border-[#E4E4E7] rounded-none shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-[#111]">
                Alertas de Stock Bajo
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lowStockProducts.length === 0 ? (
                <p className="text-sm text-[#555]">Sin alertas de stock bajo</p>
              ) : (
                <div className="space-y-2">
                  {lowStockProducts.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-2 border-b border-[#E4E4E7] last:border-0">
                      <div>
                        <p className="text-sm font-medium text-[#111]">{p.nombre}</p>
                        <p className="text-xs text-[#555]">{p.codigo_interno}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="destructive" className="rounded-none text-xs">
                          Stock: {p.stock_actual} / Mín: {p.stock_minimo}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border border-[#E4E4E7] rounded-none shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-[#111]">
                Ventas Recientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentSales.length === 0 ? (
                <p className="text-sm text-[#555]">Sin ventas recientes</p>
              ) : (
                <div className="space-y-2">
                  {recentSales.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2 border-b border-[#E4E4E7] last:border-0">
                      <div>
                        <p className="text-sm font-medium text-[#111]">
                          {s.cliente?.nombre || "Consumidor Final"}
                        </p>
                        <p className="text-xs text-[#555]">
                          {new Date(s.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-[#111]">${s.total?.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
