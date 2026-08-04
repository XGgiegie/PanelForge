/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string
    VITE_PUBLIC: string
    PANELFORGE_AIHUBMIX_API_KEY?: string
    PANELFORGE_AIHUBMIX_APP_CODE?: string
    PANELFORGE_AIHUBMIX_TEXT_MODEL?: string
    PANELFORGE_AIHUBMIX_IMAGE_MODEL?: string
    PANELFORGE_AIHUBMIX_VIDEO_MODEL?: string
    PANELFORGE_MINIO_ENDPOINT?: string
    PANELFORGE_MINIO_PORT?: string
    PANELFORGE_MINIO_USE_SSL?: string
    PANELFORGE_MINIO_ACCESS_KEY?: string
    PANELFORGE_MINIO_SECRET_KEY?: string
    PANELFORGE_MINIO_BUCKET?: string
    PANELFORGE_MINIO_REGION?: string
    PANELFORGE_MINIO_PUBLIC_URL?: string
    PANELFORGE_UPDATE_URL?: string
  }
}
