import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Notice } from '@/components/Notice';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { products as productsApi, productBarcodes, errorMessage } from '@/lib/api';
import { normalizeBarcode } from '@/lib/barcodes';
import { normalize } from '@/lib/format';
import type { CountProduct } from '@/types/api';

export function BarcodesPage() {
  const [products,setProducts] = useState<CountProduct[]>([]);
  const [query,setQuery] = useState('');
  const [selectedId,setSelectedId] = useState<string | null>(null);
  const [barcode,setBarcode] = useState('');
  const [scanning,setScanning] = useState(false);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string | null>(null);
  const [message,setMessage] = useState<string | null>(null);
  useEffect(() => {
    productsApi.listForCount().then(setProducts).catch(err=>setError(errorMessage(err))).finally(()=>setLoading(false));
  },[]);
  const selected = products.find(p=>p.id===selectedId);
  const visible = useMemo(()=>products.filter(p=>!query.trim() || normalize(p.name).includes(normalize(query.trim())) || p.code===query.trim()),[products,query]);
  const mutate = async (removeBarcode?:string) => {
    if (!selected || busy) return;
    const canonical=normalizeBarcode(removeBarcode ?? barcode);
    setError(null); setMessage(null);
    if (!canonical) {setError('Ingresá un código EAN o UPC válido.'); return;}
    setBusy(true);
    try {
      const value={productId:selected.id,barcode:canonical};
      if (removeBarcode) await productBarcodes.remove(value);
      else await productBarcodes.save(value);
      // Refresh only after the mutation; failed refresh must remain visible.
      setProducts(await productsApi.listForCount());
      setMessage(removeBarcode ? 'Asociación quitada.' : 'Código asociado.');
      if (!removeBarcode) setBarcode('');
    } catch(err) {
      setError(isAxiosError(err) && err.response?.status===409 ? 'Este código ya está asociado a otro producto.' : errorMessage(err));
    } finally { setBusy(false); }
  };
  const submit=(event:FormEvent)=>{event.preventDefault(); void mutate();};
  return <div className="space-y-4">
    <h1 className="text-2xl font-bold">Códigos de barras</h1>
    <p>Asociá el código de cada unidad a su producto. El código interno de FUDO puede ser diferente.</p>
    {error && <Notice tone="error">{error}</Notice>}
    {message && <Notice tone="success">{message}</Notice>}
    <Label htmlFor="barcode-product-search">Buscar producto</Label>
    <Input id="barcode-product-search" className="h-12" value={query} disabled={busy || scanning} onChange={e=>setQuery(e.target.value)} placeholder="Nombre o código FUDO"/>
    {loading ? <Notice>Cargando productos…</Notice> : <ul className="max-h-64 space-y-2 overflow-y-auto" aria-label="Productos">
      {visible.map(p=><li key={p.id}><Button type="button" variant={p.id===selectedId ? 'default':'outline'} className="h-auto min-h-12 w-full justify-start whitespace-normal text-left" disabled={busy || scanning} aria-pressed={p.id===selectedId} onClick={()=>{setSelectedId(p.id);setBarcode('');setError(null);setMessage(null);}}>{p.name}</Button></li>)}
    </ul>}
    {!loading && visible.length===0 && <Notice>No hay productos con ese nombre.</Notice>}
    {selected && <section className="space-y-4 rounded-lg border bg-background p-4" aria-label="Asociación de código">
      <h2 className="text-lg font-semibold">Producto seleccionado: {selected.name}</h2>
      <ul className="space-y-2">{(selected.barcodes ?? []).map(value=><li key={value} className="flex flex-wrap items-center gap-2"><span className="flex-1 font-mono">{value}</span><Button type="button" variant="outline" className="h-12" disabled={busy || scanning} aria-label={`Quitar ${value}`} onClick={()=>void mutate(value)}>Quitar</Button></li>)}</ul>
      {scanning ? <BarcodeScanner onDetected={raw=>{setBarcode(raw);setScanning(false);}} onClose={()=>setScanning(false)}/> : <Button type="button" variant="outline" className="h-12" disabled={busy} onClick={()=>setScanning(true)}>Escanear código</Button>}
      <form onSubmit={submit} className="space-y-3">
        <Label htmlFor="barcode-value">Código de barras</Label>
        <Input id="barcode-value" className="h-12 font-mono" inputMode="numeric" maxLength={64} autoComplete="off" value={barcode} disabled={busy || scanning} onChange={e=>setBarcode(e.target.value)}/>
        <p className="text-sm text-muted-foreground">Revisá que el envase corresponda a {selected.name} antes de guardar. Escanear no guarda la asociación.</p>
        <Button type="submit" className="h-12 w-full" disabled={busy || scanning}>{busy?'Guardando…':'Guardar asociación'}</Button>
      </form>
    </section>}
  </div>;
}
