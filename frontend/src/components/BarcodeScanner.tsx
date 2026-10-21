import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/Notice';
import { startBarcodeScanner, type ScannerError } from '@/lib/barcodeScanner';
const messages: Record<ScannerError, string> = {
  permission:
    'No tenemos permiso para usar la cámara. Habilitalo en tu navegador o buscá por nombre.',
  unavailable:
    'No pudimos abrir la cámara. Cerrá otras aplicaciones o buscá por nombre.',
  insecure: 'Para usar la cámara, abrí la aplicación mediante HTTPS.',
  failure: 'No pudimos iniciar el escaneo. Reintentá o buscá por nombre.',
};

export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected(raw: string): void;
  onClose(): void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const detected = useRef(onDetected);
  detected.current = onDetected;
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<ScannerError | null>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let session: { stop(): void } | undefined;
    const pause = () => {
      controller.abort();
      session?.stop();
      setPaused(true);
    };
    const hidden = () => {
      if (document.hidden) pause();
    };
    window.addEventListener('pagehide', pause);
    document.addEventListener('visibilitychange', hidden);
    void startBarcodeScanner({
      video: video.current!,
      signal: controller.signal,
      onCode: (raw) => {
        if (!controller.signal.aborted) detected.current(raw);
      },
      onError: (value) => {
        if (!controller.signal.aborted) setError(value);
      },
    }).then((value) => {
      session = value;
      if (controller.signal.aborted) value.stop();
    });
    return () => {
      controller.abort();
      session?.stop();
      window.removeEventListener('pagehide', pause);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [attempt]);
  return (
    <section
      aria-label="Escáner de códigos"
      className="space-y-3 rounded-lg border bg-background p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Escanear código de barras</h2>
        <Button
          type="button"
          variant="outline"
          className="h-12"
          onClick={onClose}
        >
          Cerrar cámara
        </Button>
      </div>
      <p>Apuntá al código completo del envase, con buena luz.</p>
      <video
        ref={video}
        aria-label="Vista de la cámara"
        autoPlay
        muted
        playsInline
        className="aspect-video w-full rounded-md bg-black object-contain"
      />
      {error && <Notice tone="error">{messages[error]}</Notice>}
      {paused && (
        <Notice>Cámara pausada. Tocá Reintentar para volver a escanear.</Notice>
      )}
      <div className="flex flex-wrap gap-2">
        {(error || paused) && (
          <Button
            type="button"
            className="h-12"
            onClick={() => {
              setError(null);
              setPaused(false);
              setAttempt((value) => value + 1);
            }}
          >
            Reintentar
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="h-12"
          onClick={onClose}
        >
          Buscar por nombre
        </Button>
      </div>
    </section>
  );
}
