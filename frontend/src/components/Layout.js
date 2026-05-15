import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Package, ShoppingCart, FileText, Users, Settings,
  LogOut, Menu, X, ChevronDown, AlertTriangle, Store, BarChart3, Truck
} from "lucide-react";
import { Button } from "../components/ui/button";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Panel", icon: LayoutDashboard, roles: ["superadmin", "administrador", "vendedor", "bodeguero", "contador"] },
  { path: "/inventory", label: "Inventario", icon: Package, roles: ["superadmin", "administrador", "vendedor", "bodeguero"] },
  { path: "/pos", label: "Punto de Venta", icon: ShoppingCart, roles: ["superadmin", "administrador", "vendedor"] },
  { path: "/invoices", label: "Comprobantes", icon: FileText, roles: ["superadmin", "administrador", "contador"] },
  { path: "/suppliers", label: "Proveedores", icon: Truck, roles: ["superadmin", "administrador", "bodeguero"] },
  { path: "/reports", label: "Reportes", icon: BarChart3, roles: ["superadmin", "administrador", "contador"] },
  { path: "/users", label: "Usuarios", icon: Users, roles: ["superadmin", "administrador"] },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredNav = NAV_ITEMS.filter((item) =>
    item.roles.includes(user?.role)
  );

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const roleLabels = {
    superadmin: "Superadmin",
    administrador: "Administrador",
    vendedor: "Vendedor",
    bodeguero: "Bodeguero",
    contador: "Contador",
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        data-testid="main-sidebar"
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-[240px] bg-white border-r border-[#E4E4E7] flex flex-col transition-transform duration-150 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-4 border-b border-[#E4E4E7]">
          <div className="flex items-center gap-2">
            <Store className="w-6 h-6 text-[#002fa7]" />
            <span className="font-bold text-[#111] text-lg tracking-tight">POS Ecuador</span>
          </div>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                data-testid={`nav-${item.path.slice(1)}`}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? "bg-[#002fa7] text-white"
                    : "text-[#555] hover:bg-[#F4F4F5] hover:text-[#111]"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#E4E4E7]">
          <div className="mb-3">
            <p className="text-sm font-semibold text-[#111] truncate">{user?.name}</p>
            <p className="text-xs text-[#555]">{roleLabels[user?.role] || user?.role}</p>
          </div>
          <Button
            data-testid="logout-btn"
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 text-[#555] hover:text-red-600 hover:border-red-200"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 bg-white border-b border-[#E4E4E7] px-4 py-3 flex items-center gap-3 lg:hidden">
          <button
            data-testid="mobile-menu-btn"
            onClick={() => setSidebarOpen(true)}
            className="p-1"
          >
            <Menu className="w-6 h-6 text-[#111]" />
          </button>
          <span className="font-bold text-[#111]">POS Ecuador</span>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
