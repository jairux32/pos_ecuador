import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Camera, X } from "lucide-react";

export default function BarcodeScanner({ open, onClose, onScan }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState("");
  const html5QrCodeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let scanner = null;

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        scanner = new Html5Qrcode("barcode-reader");
        html5QrCodeRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.5 },
          (decodedText) => {
            onScan(decodedText);
            stopScanner();
          },
          () => {}
        );
      } catch (err) {
        setError("No se pudo acceder a la cámara. Verifique los permisos.");
        console.error("Scanner error:", err);
      }
    };

    const stopScanner = async () => {
      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop();
          html5QrCodeRef.current.clear();
        } catch {}
        html5QrCodeRef.current = null;
      }
    };

    const timer = setTimeout(startScanner, 300);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [open, onScan]);

  const handleClose = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch {}
      html5QrCodeRef.current = null;
    }
    setError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md rounded-none border-[#E4E4E7]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Camera className="w-5 h-5 text-[#002fa7]" />
            Escanear Código de Barras
          </DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          {error ? (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          ) : (
            <div
              id="barcode-reader"
              ref={scannerRef}
              className="w-full"
              style={{ minHeight: "200px" }}
            />
          )}
          <p className="text-xs text-[#555] mt-3 text-center">
            Apunte la cámara al código de barras del producto
          </p>
          <Button
            variant="outline"
            onClick={handleClose}
            className="w-full mt-3 rounded-none"
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
