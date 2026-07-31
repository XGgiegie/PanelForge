import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { defineConfig } from 'vite'
import electronSimpleModule from 'vite-plugin-electron/simple'

const electron =
  typeof electronSimpleModule === 'function'
    ? electronSimpleModule
    : (electronSimpleModule as unknown as { default: typeof electronSimpleModule }).default

function createElectronEnv() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

export default defineConfig({
  server: {
    watch: {
      ignored: ['**/dist/**', '**/dist-electron/**', '**/release/**'],
    },
  },
  plugins: [
    vue(),
    electron({
      main: {
        entry: 'electron/main.ts',
        onstart({ startup }) {
          startup(['.', '--no-sandbox'], {
            env: createElectronEnv(),
          })
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
  ],
})