const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('engineFlat', {
  projects: {
    create: (payload) => ipcRenderer.invoke('projects:create', payload),
    getLocation: () => ipcRenderer.invoke('projects:get-location'),
    listRecent: () => ipcRenderer.invoke('projects:list-recent'),
    openDialog: () => ipcRenderer.invoke('projects:open-dialog'),
    openFolder: () => ipcRenderer.invoke('projects:open-folder'),
    openRecent: (projectId) => ipcRenderer.invoke('projects:open-recent', projectId),
    rename: (projectId, name) => ipcRenderer.invoke('projects:rename', projectId, name),
    delete: (projectId) => ipcRenderer.invoke('projects:delete', projectId),
    save: (projectId, changes) => ipcRenderer.invoke('projects:save', projectId, changes),
    exportGlb: (projectId, payload) => ipcRenderer.invoke('projects:export-glb', projectId, payload)
  },
  onMenuAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('menu:action', listener);
    return () => ipcRenderer.removeListener('menu:action', listener);
  }
});
