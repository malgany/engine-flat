const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const {
  createProject,
  deleteProject,
  exportProjectGlb,
  listRecentProjects,
  openProject,
  openRecent,
  projectsDir,
  renameProject,
  saveProject
} = require('./projectStore');

let mainWindow;

const appIconPath = path.join(
  __dirname,
  'assets',
  process.platform === 'darwin' ? 'engine-flat.png' : 'engine-flat.ico'
);

function buildMenu() {
  Menu.setApplicationMenu(null);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#131318',
    title: 'Engine Flat',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  app.setName('Engine Flat');

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.engineflat.app');
  }

  if (app.dock) {
    app.dock.setIcon(path.join(__dirname, 'assets', 'engine-flat.png'));
  }

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('projects:list-recent', () => listRecentProjects());

ipcMain.handle('projects:create', (_event, payload) => createProject(payload));

ipcMain.handle('projects:get-location', () => projectsDir);

ipcMain.handle('projects:open-folder', async () => {
  await shell.openPath(projectsDir);
  return projectsDir;
});

ipcMain.handle('projects:open-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir projeto',
    defaultPath: projectsDir,
    properties: ['openDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return openProject(result.filePaths[0]);
});

ipcMain.handle('projects:open-recent', (_event, projectId) => openRecent(projectId));

ipcMain.handle('projects:rename', (_event, projectId, name) => renameProject(projectId, name));

ipcMain.handle('projects:delete', (_event, projectId) => deleteProject(projectId));

ipcMain.handle('projects:save', (_event, projectId, changes) => saveProject(projectId, changes));

ipcMain.handle('projects:export-glb', (_event, projectId, payload) => exportProjectGlb(projectId, payload));
