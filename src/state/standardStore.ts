
import { create } from 'zustand'; import { persist } from 'zustand/middleware'; import { Standard } from '@/types';
interface StandardState { standards: Standard[]; addStandard: (standard: Standard) => void; deleteStandard: (id: string) => void; getStandardById: (id: string) => Standard | undefined; }
export const useStandardStore = create(persist<StandardState>((set, get) => ({
    standards: [],
    addStandard: (standard) => set(state => ({ standards: [...state.standards, standard] })),
    deleteStandard: (id) => set(state => ({ standards: state.standards.filter(s => s.id !== id) })),
    getStandardById: (id) => get().standards.find(s => s.id === id),
}), { name: 'standard-storage' }));
