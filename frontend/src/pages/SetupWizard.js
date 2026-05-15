import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Store, ChevronRight, ChevronLeft, Check, Plus, Trash2 } from "lucide-react";
import api, { formatApiError } from "../lib/api";

const STEPS = ["Datos del Negocio", "Sucursales", "Administrador"];

export default function SetupWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [provinces, setProvinces] = useState({});
  const [sectors, setSectors] = useState([]);
  const [regimes, setRegimes] = useState([]);

  const [business, setBusiness] = useState({
    nombre_comercial: "", razon_social: "", ruc: "",
    direccion_matriz: "", sector: "", regimen_tributario: "", logo_path: null,
  });

  const [branches, setBranches] = useState([{
    nombre: "", provincia: "", canton: "", direccion: "",
    telefono: "", codigo_establecimiento: "001", punto_emision: "001",
  }]);

  const [admin, setAdmin] = useState({
    name: "", email: "", password: "", confirmPassword: "",
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [pRes, sRes, rRes] = await Promise.all([
          api.get("/business/provinces"),
          api.get("/business/sectors"),
          api.get("/business/tax-regimes"),
        ]);
        setProvinces(pRes.data.provinces);
        setSectors(sRes.data.sectors);
        setRegimes(rRes.data.regimes);
      } catch (e) {
        console.error("Error loading config", e);
      }
    };
    load();
  }, []);

  const updateBranch = (idx, field, value) => {
    const updated = [...branches];
    updated[idx] = { ...updated[idx], [field]: value };
    setBranches(updated);
  };

  const addBranch = () => {
    setBranches([...branches, {
      nombre: "", provincia: "", canton: "", direccion: "",
      telefono: "", codigo_establecimiento: String(branches.length + 1).padStart(3, "0"), punto_emision: "001",
    }]);
  };

  const removeBranch = (idx) => {
    if (branches.length <= 1) return;
    setBranches(branches.filter((_, i) => i !== idx));
  };

  const validateStep = () => {
    setError("");
    if (step === 0) {
      if (!business.nombre_comercial || !business.razon_social || !business.ruc || !business.sector || !business.regimen_tributario) {
        setError("Complete todos los campos obligatorios");
        return false;
      }
      if (business.ruc.length !== 13) {
        setError("El RUC debe tener 13 dígitos");
        return false;
      }
    } else if (step === 1) {
      for (const b of branches) {
        if (!b.nombre || !b.provincia || !b.canton || !b.direccion) {
          setError("Complete todos los campos de cada sucursal");
          return false;
        }
      }
    } else if (step === 2) {
      if (!admin.name || !admin.email || !admin.password) {
        setError("Complete todos los campos del administrador");
        return false;
      }
      if (admin.password.length < 8) {
        setError("La contraseña debe tener mínimo 8 caracteres");
        return false;
      }
      if (admin.password !== admin.confirmPassword) {
        setError("Las contraseñas no coinciden");
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) setStep(step + 1);
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/business/setup", {
        business,
        branches,
        admin_email: admin.email,
        admin_password: admin.password,
        admin_name: admin.name,
      });
      const loginRes = await api.post("/auth/login", {
        email: admin.email,
        password: admin.password,
      });
      navigate("/dashboard");
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-[#E4E4E7]">
        <div className="p-6 border-b border-[#E4E4E7]">
          <div className="flex items-center gap-3 mb-4">
            <Store className="w-6 h-6 text-[#002fa7]" />
            <h1 className="text-2xl font-black tracking-tight text-[#111]">Configurar Negocio</h1>
          </div>
          <div className="flex gap-1">
            {STEPS.map((s, i) => (
              <div key={i} className="flex-1">
                <div className={`h-1 ${i <= step ? "bg-[#002fa7]" : "bg-[#E4E4E7]"} transition-colors`} />
                <p className={`text-xs mt-1 ${i <= step ? "text-[#002fa7] font-semibold" : "text-[#A1A1AA]"}`}>
                  {i + 1}. {s}
                </p>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div data-testid="setup-error" className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="p-6">
          {step === 0 && (
            <div data-testid="setup-step-business" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold text-[#111]">Nombre Comercial *</Label>
                  <Input data-testid="business-name-input" className="mt-1 rounded-none border-[#E4E4E7]" value={business.nombre_comercial} onChange={(e) => setBusiness({ ...business, nombre_comercial: e.target.value })} placeholder="Mi Tienda" />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-[#111]">Razón Social *</Label>
                  <Input data-testid="business-razon-input" className="mt-1 rounded-none border-[#E4E4E7]" value={business.razon_social} onChange={(e) => setBusiness({ ...business, razon_social: e.target.value })} placeholder="Mi Tienda S.A." />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold text-[#111]">RUC *</Label>
                  <Input data-testid="business-ruc-input" className="mt-1 rounded-none border-[#E4E4E7]" value={business.ruc} onChange={(e) => setBusiness({ ...business, ruc: e.target.value.replace(/\D/g, "").slice(0, 13) })} placeholder="1234567890001" maxLength={13} />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-[#111]">Sector *</Label>
                  <Select value={business.sector} onValueChange={(v) => setBusiness({ ...business, sector: v })}>
                    <SelectTrigger data-testid="business-sector-select" className="mt-1 rounded-none border-[#E4E4E7]"><SelectValue placeholder="Seleccione" /></SelectTrigger>
                    <SelectContent>
                      {sectors.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold text-[#111]">Dirección Matriz</Label>
                <Input className="mt-1 rounded-none border-[#E4E4E7]" value={business.direccion_matriz} onChange={(e) => setBusiness({ ...business, direccion_matriz: e.target.value })} placeholder="Av. Principal 123" />
              </div>
              <div>
                <Label className="text-sm font-semibold text-[#111]">Régimen Tributario *</Label>
                <Select value={business.regimen_tributario} onValueChange={(v) => setBusiness({ ...business, regimen_tributario: v })}>
                  <SelectTrigger data-testid="business-regime-select" className="mt-1 rounded-none border-[#E4E4E7]"><SelectValue placeholder="Seleccione" /></SelectTrigger>
                  <SelectContent>
                    {regimes.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div data-testid="setup-step-branches" className="space-y-6">
              {branches.map((branch, idx) => (
                <div key={idx} className="border border-[#E4E4E7] p-4 relative">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-sm text-[#111]">Sucursal {idx + 1}</h3>
                    {branches.length > 1 && (
                      <button onClick={() => removeBranch(idx)} className="text-red-500 hover:text-red-700">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Nombre *</Label>
                      <Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={branch.nombre} onChange={(e) => updateBranch(idx, "nombre", e.target.value)} placeholder="Local Principal" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Provincia *</Label>
                      <Select value={branch.provincia} onValueChange={(v) => { updateBranch(idx, "provincia", v); updateBranch(idx, "canton", ""); }}>
                        <SelectTrigger className="mt-1 rounded-none border-[#E4E4E7] text-sm"><SelectValue placeholder="Seleccione" /></SelectTrigger>
                        <SelectContent>
                          {Object.keys(provinces).map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Cantón *</Label>
                      <Select value={branch.canton} onValueChange={(v) => updateBranch(idx, "canton", v)} disabled={!branch.provincia}>
                        <SelectTrigger className="mt-1 rounded-none border-[#E4E4E7] text-sm"><SelectValue placeholder="Seleccione" /></SelectTrigger>
                        <SelectContent>
                          {(provinces[branch.provincia] || []).map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Dirección *</Label>
                      <Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={branch.direccion} onChange={(e) => updateBranch(idx, "direccion", e.target.value)} placeholder="Calle y número" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Teléfono</Label>
                      <Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={branch.telefono} onChange={(e) => updateBranch(idx, "telefono", e.target.value)} placeholder="0999999999" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs font-semibold">Cód. Estab. (SRI)</Label>
                        <Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={branch.codigo_establecimiento} onChange={(e) => updateBranch(idx, "codigo_establecimiento", e.target.value.replace(/\D/g, "").slice(0, 3))} maxLength={3} />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold">Pto. Emisión</Label>
                        <Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={branch.punto_emision} onChange={(e) => updateBranch(idx, "punto_emision", e.target.value.replace(/\D/g, "").slice(0, 3))} maxLength={3} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <Button data-testid="add-branch-btn" variant="outline" onClick={addBranch} className="rounded-none border-dashed gap-2">
                <Plus className="w-4 h-4" /> Agregar Sucursal
              </Button>
            </div>
          )}

          {step === 2 && (
            <div data-testid="setup-step-admin" className="space-y-4">
              <p className="text-sm text-[#555] mb-4">
                Cree el usuario administrador principal del negocio.
              </p>
              <div>
                <Label className="text-sm font-semibold text-[#111]">Nombre Completo *</Label>
                <Input data-testid="admin-name-input" className="mt-1 rounded-none border-[#E4E4E7]" value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} placeholder="Juan Pérez" />
              </div>
              <div>
                <Label className="text-sm font-semibold text-[#111]">Correo Electrónico *</Label>
                <Input data-testid="admin-email-input" className="mt-1 rounded-none border-[#E4E4E7]" type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} placeholder="admin@minegocio.com" />
              </div>
              <div>
                <Label className="text-sm font-semibold text-[#111]">Contraseña *</Label>
                <Input data-testid="admin-password-input" className="mt-1 rounded-none border-[#E4E4E7]" type="password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} placeholder="Mínimo 8 caracteres" />
                <p className="text-xs text-[#A1A1AA] mt-1">Mínimo 8 caracteres, una mayúscula, una minúscula y un número</p>
              </div>
              <div>
                <Label className="text-sm font-semibold text-[#111]">Confirmar Contraseña *</Label>
                <Input data-testid="admin-confirm-input" className="mt-1 rounded-none border-[#E4E4E7]" type="password" value={admin.confirmPassword} onChange={(e) => setAdmin({ ...admin, confirmPassword: e.target.value })} placeholder="Repita la contraseña" />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-[#E4E4E7] flex justify-between">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="rounded-none gap-2">
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Button>
          ) : (
            <Button variant="outline" onClick={() => navigate("/login")} className="rounded-none">
              Volver al Login
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button data-testid="setup-next-btn" onClick={handleNext} className="rounded-none bg-[#002fa7] hover:bg-[#001f7a] gap-2">
              Siguiente <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button data-testid="setup-submit-btn" onClick={handleSubmit} disabled={loading} className="rounded-none bg-[#002fa7] hover:bg-[#001f7a] gap-2">
              {loading ? "Configurando..." : <>Finalizar <Check className="w-4 h-4" /></>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
