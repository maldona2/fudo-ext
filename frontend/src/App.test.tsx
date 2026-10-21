import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('@/contexts/AuthContext',()=>({AuthProvider:({children}:{children:ReactNode})=>children,useAuth:()=>({user:{role:'counter',name:'Cajero'},loading:false,logout:vi.fn()})}));
vi.mock('@/pages/CountPage',()=>({CountPage:()=> <p>Conteo permitido</p>}));
vi.mock('@/pages/BarcodesPage',()=>({BarcodesPage:()=> <p>Administrar códigos</p>}));
import App from './App';
beforeEach(()=>window.history.replaceState({},'', '/codigos'));
it('redirects a counter away from barcode configuration and hides its link',async()=>{
 render(<App/>);
 expect(await screen.findByText('Conteo permitido')).toBeInTheDocument();
 expect(screen.queryByText('Administrar códigos')).not.toBeInTheDocument();
 expect(screen.queryByRole('link',{name:'Códigos'})).not.toBeInTheDocument();
});
