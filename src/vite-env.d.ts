/// <reference types="vite/client" />

interface Window {
  companionDesktop?: {
    listCaptureSources(): Promise<Array<{ id: string; name: string; kind: string; thumbnail: string | null }>>;
    captureFrame(sourceId: string): Promise<string>;
    minimize(): Promise<void>;
    close(): Promise<void>;
  };
}
