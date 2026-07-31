import { defineStore } from 'pinia'

const AI_SETTINGS_STORAGE_KEY = 'panelforge:ai-settings'

type StoredAiSettings = {
  aihubmixApiKey?: string
}

function readStoredSettings() {
  if (typeof localStorage === 'undefined') {
    return { aihubmixApiKey: '' }
  }

  try {
    const rawValue = localStorage.getItem(AI_SETTINGS_STORAGE_KEY)
    const settings = rawValue ? (JSON.parse(rawValue) as StoredAiSettings) : {}

    return {
      aihubmixApiKey: settings.aihubmixApiKey ?? '',
    }
  } catch {
    return { aihubmixApiKey: '' }
  }
}

function writeStoredSettings(settings: StoredAiSettings) {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

export const useAiSettingsStore = defineStore('aiSettings', {
  state: () => ({
    aihubmixApiKey: '',
    isLoaded: false,
  }),
  getters: {
    hasApiKey: (state) => state.aihubmixApiKey.trim().length > 0,
  },
  actions: {
    loadSettings() {
      if (this.isLoaded) {
        return
      }

      const settings = readStoredSettings()
      this.aihubmixApiKey = settings.aihubmixApiKey
      this.isLoaded = true
    },
    saveAihubmixApiKey(value: string) {
      this.aihubmixApiKey = value.trim()
      this.isLoaded = true
      writeStoredSettings({ aihubmixApiKey: this.aihubmixApiKey })
    },
    clearAihubmixApiKey() {
      this.aihubmixApiKey = ''
      this.isLoaded = true
      writeStoredSettings({ aihubmixApiKey: '' })
    },
  },
})