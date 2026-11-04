import { create } from 'zustand';
import { PickedPhoto } from '../images/imageImport';

interface DraftState {
  description: string;
  photos: PickedPhoto[];
  setDescription(v: string): void;
  addPhotos(p: PickedPhoto[]): void;
  removePhoto(id: string): void;
  clear(): void;
}
/** The report being composed (not yet submitted). Kept outside the screen so tab switches don't lose it. */
export const useDraftStore = create<DraftState>(set => ({
  description: '',
  photos: [],
  setDescription: description => set({ description }),
  addPhotos: p => set(s => ({ photos: [...s.photos, ...p] })),
  removePhoto: id => set(s => ({ photos: s.photos.filter(p => p.id !== id) })),
  clear: () => set({ description: '', photos: [] }),
}));
