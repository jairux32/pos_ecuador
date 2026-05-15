import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Printer, Download } from "lucide-react";
import api from "../lib/api";
import { toast } from "sonner";

export default function CashRegisterTicket({ registerId, open, onClose }) {
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef(null);

  useEffect(() => {
    if (!open || !registerId) return;
    const load = async () => {
      try {
        const res = await api.get(`/pos/register-ticket/${registerId}`);
        setTicket(res.data);
      } catch (e) {
        toast.error("Error cargando datos del cierre");
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, registerId]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank", "width=320,height=600");
    printWindow.document.write(`
      <html><head><title>Cierre de Caja</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 11px; width: 280px; margin: 0 auto; padding: 10px; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; }
        .big { font-size: 14px; font-weight: bold; }
        h2 { margin: 4px 0; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; }
        td { padding: 1px 2px; }
        @media print { body { width: 72mm; } }
      </style></head><body>
      ${content.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
  };

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/pos/register-ticket-pdf/${registerId}`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `cierre_caja_${registerId?.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Error descargando PDF");
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm rounded-none border-[#E4E4E7]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Ticket de Cierre de Caja</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-[#002fa7] border-t-transparent rounded-full" />
          </div>
        ) : ticket ? (
          <div className="space-y-3">
            <div ref={printRef} className="bg-white p-4 text-xs font-mono border border-[#E4E4E7]" style={{ maxHeight: "400px", overflowY: "auto" }}>
              <div className="text-center">
                <p className="font-bold text-sm">{ticket.negocio}</p>
                {ticket.ruc && <p>RUC: {ticket.ruc}</p>}
                {ticket.sucursal && <p>{ticket.sucursal}</p>}
                {ticket.direccion && <p>{ticket.direccion}</p>}
              </div>
              <div className="border-t border-dashed border-gray-400 my-2" />
              <p className="text-center font-bold">CIERRE DE CAJA</p>
              <div className="border-t border-dashed border-gray-400 my-2" />
              <p>Cajero: {ticket.cajero}</p>
              {ticket.apertura && <p>Apertura: {ticket.apertura.slice(0, 16).replace("T", " ")}</p>}
              {ticket.cierre && <p>Cierre: {ticket.cierre.slice(0, 16).replace("T", " ")}</p>}
              <div className="border-t border-dashed border-gray-400 my-2" />
              <p className="font-bold">RESUMEN</p>
              <div className="flex justify-between"><span>Monto Inicial</span><span>${ticket.monto_inicial?.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Ventas Efectivo</span><span>${ticket.ventas_efectivo?.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Ventas Tarjeta</span><span>${ticket.ventas_tarjeta?.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Ventas Transfer.</span><span>${ticket.ventas_transferencia?.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Ingresos Manual.</span><span>${ticket.ingresos_manuales?.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Egresos Manual.</span><span>${ticket.egresos_manuales?.toFixed(2)}</span></div>
              <div className="border-t border-dashed border-gray-400 my-2" />
              <div className="flex justify-between font-bold"><span>Total Ventas</span><span>${ticket.total_ventas?.toFixed(2)}</span></div>
              <div className="flex justify-between"><span># Transacciones</span><span>{ticket.num_ventas}</span></div>
              <div className="border-t border-dashed border-gray-400 my-2" />
              <div className="flex justify-between font-bold"><span>Efectivo Esperado</span><span>${ticket.efectivo_esperado?.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold"><span>Efectivo Contado</span><span>${ticket.efectivo_contado?.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-sm mt-1">
                <span>DIFERENCIA</span>
                <span className={ticket.diferencia < 0 ? "text-red-600" : ""}>${ticket.diferencia?.toFixed(2)}</span>
              </div>

              {ticket.ventas_detalle?.length > 0 && (
                <>
                  <div className="border-t border-dashed border-gray-400 my-2" />
                  <p className="font-bold">DETALLE DE VENTAS</p>
                  <table>
                    <thead><tr><td className="font-bold">Hora</td><td className="font-bold">Cliente</td><td className="font-bold text-right">Total</td></tr></thead>
                    <tbody>
                      {ticket.ventas_detalle.map((v, i) => (
                        <tr key={i}><td>{v.hora}</td><td>{v.cliente?.slice(0, 12)}</td><td className="text-right">${v.total?.toFixed(2)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              <div className="border-t border-dashed border-gray-400 my-3" />
              <div className="mt-4 text-center">
                <p>Firma Cajero: _______________</p>
                <p className="mt-3">Firma Supervisor: _______________</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button data-testid="print-ticket-btn" onClick={handlePrint} className="flex-1 rounded-none bg-[#002fa7] hover:bg-[#001f7a] gap-1">
                <Printer className="w-4 h-4" /> Imprimir
              </Button>
              <Button data-testid="download-ticket-pdf" variant="outline" onClick={downloadPdf} className="flex-1 rounded-none gap-1">
                <Download className="w-4 h-4" /> PDF
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#555] py-4">No se encontraron datos</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
