import { useEffect, useState } from 'react';

const KEYBOARD_MIN_PX = 150;

/** True while the on-screen keyboard shrinks the visual viewport. */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setOpen(window.innerHeight - vv.height > KEYBOARD_MIN_PX);
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);

  return open;
}
