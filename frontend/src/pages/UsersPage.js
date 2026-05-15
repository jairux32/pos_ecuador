import React, { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Users, Plus, Edit2, UserX } from "lucide-react";
import api, { formatApiError } from "../lib/api";
import { toast } from "sonner";

const ROLE_LABELS = {
  superadmin: "Superadmin",
  administrador: "Administrador",
  vendedor: "Vendedor",
  bodeguero: "Bodeguero",
  contador: "Contador",
};

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);

  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "vendedor", branch_ids: [],
  });

  const loadUsers = async () => {
    try {
      const [usersRes, branchesRes] = await Promise.all([
        api.get("/users/"),
        api.get("/business/branches"),
      ]);
      setUsers(usersRes.data.users || []);
      setBranches(branchesRes.data.branches || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { loadUsers(); }, []);

  const resetForm = () => {
    setForm({ name: "", email: "", password: "", role: "vendedor", branch_ids: [] });
    setEditUser(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (u) => {
    setEditUser(u);
    setForm({ name: u.name || "", email: u.email, password: "", role: u.role, branch_ids: u.branch_ids || [] });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || (!editUser && !form.email)) { toast.error("Complete los campos obligatorios"); return; }
    try {
      if (editUser) {
        await api.put(`/users/${editUser.id}`, { name: form.name, role: form.role, branch_ids: form.branch_ids });
        toast.success("Usuario actualizado");
      } else {
        if (!form.password || form.password.length < 8) { toast.error("La contraseña debe tener mínimo 8 caracteres"); return; }
        await api.post("/users/", form);
        toast.success("Usuario creado");
      }
      setDialogOpen(false);
      loadUsers();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm("¿Desactivar este usuario?")) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success("Usuario desactivado");
      loadUsers();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const roleBadgeColors = {
    superadmin: "bg-purple-50 text-purple-700 border-purple-200",
    administrador: "bg-blue-50 text-blue-700 border-blue-200",
    vendedor: "bg-green-50 text-green-700 border-green-200",
    bodeguero: "bg-amber-50 text-amber-700 border-amber-200",
    contador: "bg-gray-100 text-gray-700 border-gray-200",
  };

  return (
    <Layout>
      <div data-testid="users-page" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#111]">Usuarios</h1>
            <p className="text-sm text-[#555]">{users.length} usuarios registrados</p>
          </div>
          <Button data-testid="add-user-btn" onClick={openCreate} className="rounded-none bg-[#002fa7] hover:bg-[#001f7a] gap-2">
            <Plus className="w-4 h-4" /> Nuevo Usuario
          </Button>
        </div>

        <div className="border border-[#E4E4E7] bg-white overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#FAFAFA]">
                <TableHead className="text-xs font-bold uppercase tracking-wider">Nombre</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Email</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Rol</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-center">Estado</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-[#555]">Sin usuarios</TableCell></TableRow>
              ) : users.map((u) => (
                <TableRow key={u.id} className="hover:bg-[#FAFAFA]">
                  <TableCell className="text-sm font-medium">{u.name}</TableCell>
                  <TableCell className="text-sm text-[#555]">{u.email}</TableCell>
                  <TableCell>
                    <Badge className={`rounded-none text-xs ${roleBadgeColors[u.role] || ""}`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={`rounded-none text-xs ${u.is_active !== false ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                      {u.is_active !== false ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button data-testid={`edit-user-${u.id}`} onClick={() => openEdit(u)} className="p-1.5 hover:bg-[#F4F4F5]" title="Editar">
                        <Edit2 className="w-4 h-4 text-[#555]" />
                      </button>
                      <button data-testid={`deactivate-user-${u.id}`} onClick={() => handleDeactivate(u.id)} className="p-1.5 hover:bg-red-50" title="Desactivar">
                        <UserX className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md rounded-none border-[#E4E4E7]">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">{editUser ? "Editar Usuario" : "Nuevo Usuario"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-xs font-semibold">Nombre *</Label>
                <Input data-testid="user-name-input" className="mt-1 rounded-none border-[#E4E4E7]" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              {!editUser && (
                <>
                  <div>
                    <Label className="text-xs font-semibold">Email *</Label>
                    <Input data-testid="user-email-input" className="mt-1 rounded-none border-[#E4E4E7]" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Contraseña *</Label>
                    <Input data-testid="user-password-input" className="mt-1 rounded-none border-[#E4E4E7]" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  </div>
                </>
              )}
              <div>
                <Label className="text-xs font-semibold">Rol</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger data-testid="user-role-select" className="mt-1 rounded-none border-[#E4E4E7]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="administrador">Administrador de Local</SelectItem>
                    <SelectItem value="vendedor">Vendedor / Cajero</SelectItem>
                    <SelectItem value="bodeguero">Bodeguero</SelectItem>
                    <SelectItem value="contador">Contador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-none">Cancelar</Button>
                <Button data-testid="save-user-btn" onClick={handleSave} className="rounded-none bg-[#002fa7] hover:bg-[#001f7a]">
                  {editUser ? "Guardar" : "Crear"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
