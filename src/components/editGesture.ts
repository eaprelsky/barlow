import { createContext, useContext, useEffect, useId } from 'react';
interface GestureController {
  begin: (id: string) => void;
  commit: (id?: string) => void;
  cancel: (id?: string) => void;
}
export const EditGestureContext = createContext<GestureController | null>(null);
export function useEditGesture() {
  const owner = useContext(EditGestureContext);
  const id = useId();
  useEffect(() => () => owner?.commit(id), [owner, id]);
  return { begin: () => owner?.begin(id), commit: () => owner?.commit(id), cancel: () => owner?.cancel(id) };
}
