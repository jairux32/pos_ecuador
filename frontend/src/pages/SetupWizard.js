import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Store, ChevronRight, ChevronLeft, Check, Plus, Trash2, RefreshCw, X } from "lucide-react";
import api, { formatApiError } from "../lib/api";

const STEPS = ["Datos del Negocio", "Sucursales", "Administrador"];

function generateValidEcuadorCedula() {
  const nums = [];
  for (let i = 0; i < 9; i++) nums.push(Math.floor(Math.random() * 10));
  const coefs = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let total = 0;
  for (let i = 0; i < 9; i++) {
    let v = nums[i] * coefs[i];
    if (v >= 10) v -= 9;
    total += v;
  }
  let check = 10 - (total % 10);
  if (check === 10) check = 0;
  return nums.join("") + String(check);
}

function generateValidRuc() {
  return generateValidEcuadorCedula() + "001";
}

export default function SetupWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rucStatus, setRucStatus] = useState("");

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
        setError("No se pudieron cargar las opciones de provincia. Verifica tu conexión y recarga la página.");
      }
    };
    load();
  }, []);

  useEffect(() => {
    const ruc = business.ruc.trim();
    if (ruc.length === 0) { setRucStatus(""); return; }
    if (!/^\d+$/.test(ruc)) { setRucStatus("Solo dígitos"); return; }
    if (ruc.length < 13) { setRucStatus(`${ruc.length}/13 dígitos`); return; }
    if (ruc.length > 13) { setRucStatus("Máximo 13 dígitos"); return; }
    setRucStatus("OK");
  }, [business.ruc]);

  const updateBranch = (idx, field, value) => {
    setBranches((prev) => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  };

  const addBranch = () => {
    setBranches((prev) => [...prev, {
      nombre: "", provincia: "", canton: "", direccion: "",
      telefono: "", codigo_establecimiento: String(prev.length + 1).padStart(3, "0"),
      punto_emision: "001",
    }]);
  };

  const removeBranch = (idx) => {
    if (branches.length <= 1) return;
    setBranches((prev) => prev.filter((_, i) => i !== idx));
  };

  const generateRuc = () => {
    setBusiness((prev) => ({ ...prev, ruc: generateValidRuc() }));
  };

  const validateStep = () => {
    setError("");
    if (step === 0) {
      if (!business.nombre_comercial || !business.razon_social || !business.ruc || !business.sector || !business.regimen_tributario) {
        setError("Complete todos los campos obligatorios");
        return false;
      }
      if (business.ruc.length !== 13 || !/^\d{13}$/.test(business.ruc)) {
        setError("El RUC debe tener 13 dígitos numéricos");
        return false;
      }
    } else if (step === 1) {
      for (let i = 0; i < branches.length; i++) {
        const b = branches[i];
        if (!b.nombre || !b.provincia || !b.canton || !b.direccion) {
          setError(`Complete todos los campos de la sucursal ${i + 1}`);
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
    if (validateStep()) setStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setLoading(true);
    setError("");
    try {
      await api.post("/business/setup", {
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

  const provincesLoaded = Object.keys(provinces).length > 0;

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
              {!provincesLoaded && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  Cargando opciones... Si este mensaje persiste, verifica la conexión con el backend.
                </div>
              )}
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
              <div>
                <Label className="text-sm font-semibold text-[#111]">RUC *</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    data-testid="business-ruc-input"
                    className={`rounded-none border-[#E4E4E7] ${rucStatus === "OK" ? "border-green-500" : rucStatus && rucStatus !== "" ? "border-red-400" : ""}`}
                    value={business.ruc}
                    onChange={(e) => setBusiness({ ...business, ruc: e.target.value.replace(/\D/g, "").slice(0, 13) })}
                    placeholder="1234567890001"
                    maxLength={13}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={generateRuc}
                    title="Generar un RUC ecuatoriano válido de prueba"
                    className="rounded-none border-[#E4E4E7] text-xs whitespace-nowrap gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Generar
                  </Button>
                </div>
                {rucStatus && (
                  <p className={`text-xs mt-1 ${rucStatus === "OK" ? "text-green-700" : "text-amber-700"}`}>
                    {rucStatus === "OK" ? "✓ RUC con 13 dígitos. La validación final la hace el backend." : rucStatus}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold text-[#111]">Sector *</Label>
                  <Select value={business.sector} onValueChange={(v) => setBusiness({ ...business, sector: v })}>
                    <SelectTrigger data-testid="business-sector-select" className="mt-1 rounded-none border-[#E4E4E7]">
                      <SelectValue placeholder="Seleccione" />
                    </SelectTrigger>
                    <SelectContent>
                      {sectors.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold text-[#111]">Dirección Matriz</Label>
                <Input className="mt-1 rounded-none border-[#E4E4E7]" value={business.direccion_matriz} onChange={(e) => setBusiness({ ...business, direccion_matriz: e.target.value })} placeholder="Av. Principal 123 y Secundaria" />
              </div>
              <div>
                <Label className="text-sm font-semibold text-[#111]">Régimen Tributario *</Label>
                <Select value={business.regimen_tributario} onValueChange={(v) => setBusiness({ ...business, regimen_tributario: v })}>
                  <SelectTrigger data-testid="business-regime-select" className="mt-1 rounded-none border-[#E4E4E7]">
                    <SelectValue placeholder="Seleccione" />
                  </SelectTrigger>
                  <SelectContent>
                    {regimes.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div data-testid="setup-step-branches" className="space-y-6">
              {!provincesLoaded && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  Cargando provincias... Si este mensaje persiste, recarga la página.
                </div>
              )}
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
                    <div className="md:col-span-2">
                      <Label className="text-xs font-semibold">Nombre *</Label>
                      <Input className="mt-1 rounded-none border-[#E4E4E7] text-sm" value={branch.nombre} onChange={(e) => updateBranch(idx, "nombre", e.target.value)} placeholder="Local Principal" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Provincia *</Label>
                      {provincesLoaded ? (
                        <Select
                          value={branch.provincia}
                          onValueChange={(v) => { updateBranch(idx, "provincia", v); updateBranch(idx, "canton", ""); }}
                        >
                          <SelectTrigger className="mt-1 rounded-none border-[#E4E4E7] text-sm" data-testid={`branch-${idx}-provincia`}>
                            <SelectValue placeholder="Seleccione provincia" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.keys(provinces).map((p) => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input className="mt-1 rounded-none border-[#E4E4E7] text-sm bg-gray-50" disabled value="Cargando..." />
                      )}
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Cantón *</Label>
                      {provincesLoaded && branch.provincia ? (
                        <Select
                          value={branch.canton}
                          onValueChange={(v) => updateBranch(idx, "canton", v)}
                        >
                          <SelectTrigger className="mt-1 rounded-none border-[#E4E4E7] text-sm" data-testid={`branch-${idx}-canton`}>
                            <SelectValue placeholder="Seleccione cantón" />
                          </SelectTrigger>
                          <SelectContent>
                            {(provinces[branch.provincia] || []).map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          className="mt-1 rounded-none border-[#E4E4E7] text-sm bg-gray-50"
                          disabled
                          value={branch.provincia ? "Seleccione provincia primero" : "Cargando..."}
                        />
                      )}
                    </div>
                    <div className="md:col-span-2">
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
