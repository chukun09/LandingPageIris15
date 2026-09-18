/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Nguồn nhạc nền cho trình phát Radio. Mặc định /audio/bgm.mp3 (tự host). */
  readonly VITE_BGM_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
