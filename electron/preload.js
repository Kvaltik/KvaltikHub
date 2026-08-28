const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kvaltikDesktop", {
  getDiscordConfig: () => ipcRenderer.invoke("discord-config-get"),
  saveDiscordConfig: (config) => ipcRenderer.invoke("discord-config-save", config),
  addMusicFiles: () => ipcRenderer.invoke("music-add-files"),
  getMusicLibrary: () => ipcRenderer.invoke("music-library-get"),
  removeMusicTrack: (id) => ipcRenderer.invoke("music-remove-track", id),

  getUpdateInfo: () => ipcRenderer.invoke("update-get-info"),
  checkForUpdates: (preferences) => ipcRenderer.invoke("update-check", preferences),
  downloadUpdate: () => ipcRenderer.invoke("update-download"),
  installUpdate: (preferences) => ipcRenderer.invoke("update-install", preferences),
  onUpdateStatus: (callback) => {
    ipcRenderer.removeAllListeners("update-status");
    ipcRenderer.on("update-status", (_event, state) => callback(state));
  },
  onOpenUpdateSettings: (callback) => {
    ipcRenderer.removeAllListeners("update-open-settings");
    ipcRenderer.on("update-open-settings", () => callback());
  },

  storageGet: (key) => ipcRenderer.sendSync("storage-get", key),
  storageSet: (key, value) => ipcRenderer.sendSync("storage-set", {key, value}),
  storageRemove: (key) => ipcRenderer.sendSync("storage-remove", key)
});
