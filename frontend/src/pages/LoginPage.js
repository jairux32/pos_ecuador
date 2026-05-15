import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Store, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.success) {
      navigate("/dashboard");
    } else {
      setError(result.error);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundColor: "#FAFAFA",
        backgroundImage: `url('https://static.prod-images.emergentagent.com/jobs/4684dcc8-0062-41d7-a29b-555bb26ff1d9/images/c7bcca872c3a995af4af88bd0923ca01522900b405d57393f7bf010fa853c16a.png')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div
        data-testid="login-form"
        className="w-full max-w-md bg-white border border-[#E4E4E7] p-8"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#002fa7] flex items-center justify-center">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#111]">
              POS Ecuador
            </h1>
            <p className="text-sm text-[#555]">Sistema de Gestión e Inventario</p>
          </div>
        </div>

        {error && (
          <div
            data-testid="login-error"
            className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email" className="text-sm font-semibold text-[#111]">
              Correo electrónico
            </Label>
            <Input
              data-testid="login-email-input"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              required
              className="mt-1 border-[#E4E4E7] rounded-none focus:border-[#002fa7] focus:ring-[#002fa7]"
            />
          </div>
          <div>
            <Label htmlFor="password" className="text-sm font-semibold text-[#111]">
              Contraseña
            </Label>
            <div className="relative mt-1">
              <Input
                data-testid="login-password-input"
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingrese su contraseña"
                required
                className="border-[#E4E4E7] rounded-none focus:border-[#002fa7] focus:ring-[#002fa7] pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button
            data-testid="login-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full bg-[#002fa7] hover:bg-[#001f7a] text-white rounded-none h-11 font-semibold"
          >
            {loading ? "Ingresando..." : "Iniciar Sesión"}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            data-testid="goto-setup-btn"
            onClick={() => navigate("/setup")}
            className="text-sm text-[#002fa7] hover:underline font-medium"
          >
            Registrar un nuevo negocio
          </button>
        </div>
      </div>
    </div>
  );
}
