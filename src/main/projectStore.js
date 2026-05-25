const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const projectsDir = path.join(projectRoot, 'projects');
const indexPath = path.join(projectsDir, 'index.json');
const defaultTileSizePixels = 100;
const minTileSizePixels = 5;
const maxTileSizePixels = 1000;

function nowIso() {
  return new Date().toISOString();
}

function ensureStore() {
  fs.mkdirSync(projectsDir, { recursive: true });

  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, JSON.stringify({ recentProjects: [] }, null, 2));
  }
}

function readIndex() {
  ensureStore();

  try {
    const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    return {
      recentProjects: Array.isArray(data.recentProjects) ? data.recentProjects : []
    };
  } catch {
    return { recentProjects: [] };
  }
}

function writeIndex(index) {
  ensureStore();
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

function normalizeTileSizePixels(value) {
  const numericValue = Number.parseInt(value, 10);

  if (Number.isNaN(numericValue)) {
    return defaultTileSizePixels;
  }

  return Math.min(maxTileSizePixels, Math.max(minTileSizePixels, numericValue));
}

function toProjectSummary(project, projectPath) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    thumbnail: project.thumbnail ?? null,
    grid: {
      tileSizePixels: normalizeTileSizePixels(project.grid?.tileSizePixels)
    },
    tilesets: Array.isArray(project.tilesets) ? project.tilesets : [],
    scene: project.scene,
    path: projectPath
  };
}

function updateRecent(project, projectPath) {
  const index = readIndex();
  const summary = toProjectSummary(project, projectPath);
  const { tilesets: _tilesets, ...recentSummary } = summary;
  const others = index.recentProjects.filter((item) => item.id !== project.id);

  writeIndex({
    recentProjects: [recentSummary, ...others]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 24)
  });

  return summary;
}

function createProject({ name = 'Projeto sem titulo', tileSizePixels = defaultTileSizePixels } = {}) {
  ensureStore();

  const createdAt = nowIso();
  const id = `project-${Date.now()}`;
  const projectPath = path.join(projectsDir, id);
  const projectName = String(name || '').trim() || 'Projeto sem titulo';
  const normalizedTileSizePixels = normalizeTileSizePixels(tileSizePixels);
  const project = {
    formatVersion: 1,
    id,
    name: projectName,
    description: 'Cena 3D inicial sem objeto.',
    createdAt,
    updatedAt: createdAt,
    thumbnail: null,
    grid: {
      tileSizePixels: normalizedTileSizePixels
    },
    tilesets: [],
    scene: {
      units: 'meters',
      groups: [],
      objects: [
        {
          id: 'scene-light',
          name: 'Luz',
          type: 'directional-light',
          transform: {
            position: [0, 4, 3],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          },
          intensity: 1.25
        }
      ],
      camera: {
        position: [6, 5, 8],
        target: [0, 0, 0]
      }
    }
  };

  fs.mkdirSync(projectPath, { recursive: true });
  fs.writeFileSync(path.join(projectPath, 'project.json'), JSON.stringify(project, null, 2));

  return updateRecent(project, projectPath);
}

function readProject(projectPath) {
  const filePath = path.join(projectPath, 'project.json');
  const project = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { project, filePath };
}

function resolveRecentProject(projectId) {
  const index = readIndex();
  const recent = index.recentProjects.find((item) => item.id === projectId);

  if (!recent) {
    throw new Error('Projeto nao encontrado.');
  }

  return { index, recent };
}

function ensureProjectPathInsideStore(projectPath) {
  const resolvedProjectsDir = path.resolve(projectsDir);
  const resolvedProjectPath = path.resolve(projectPath);
  const relativePath = path.relative(resolvedProjectsDir, resolvedProjectPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || relativePath === '') {
    throw new Error('Caminho do projeto invalido.');
  }

  return resolvedProjectPath;
}

function openProject(projectPath) {
  const { project } = readProject(projectPath);
  const opened = {
    ...project,
    updatedAt: nowIso()
  };

  fs.writeFileSync(path.join(projectPath, 'project.json'), JSON.stringify(opened, null, 2));
  return updateRecent(opened, projectPath);
}

function openRecent(projectId) {
  const { recent } = resolveRecentProject(projectId);

  return openProject(recent.path);
}

function saveProject(projectId, changes = {}) {
  const { recent } = resolveRecentProject(projectId);

  const { project } = readProject(recent.path);
  const updated = {
    ...project,
    ...changes,
    id: project.id,
    createdAt: project.createdAt,
    updatedAt: nowIso()
  };

  fs.writeFileSync(path.join(recent.path, 'project.json'), JSON.stringify(updated, null, 2));
  return updateRecent(updated, recent.path);
}

function sanitizeExportFileName(value) {
  const fileName = String(value || 'engine-flat')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return fileName || 'engine-flat';
}

function exportProjectGlb(projectId, { fileName, base64 } = {}) {
  const { recent } = resolveRecentProject(projectId);
  const projectPath = ensureProjectPathInsideStore(recent.path);
  const exportsDir = path.join(projectPath, 'exports');
  const exportFileName = `${sanitizeExportFileName(fileName || recent.name)}.glb`;
  const exportPath = path.join(exportsDir, exportFileName);

  if (!base64 || typeof base64 !== 'string') {
    throw new Error('Arquivo GLB invalido.');
  }

  fs.mkdirSync(exportsDir, { recursive: true });
  fs.writeFileSync(exportPath, Buffer.from(base64, 'base64'));

  return {
    fileName: exportFileName,
    path: exportPath
  };
}

function renameProject(projectId, name) {
  const projectName = String(name || '').trim();

  if (!projectName) {
    throw new Error('Informe um nome para o projeto.');
  }

  return saveProject(projectId, { name: projectName });
}

function deleteProject(projectId) {
  const { index, recent } = resolveRecentProject(projectId);
  const projectPath = ensureProjectPathInsideStore(recent.path);

  if (fs.existsSync(projectPath)) {
    fs.rmSync(projectPath, { recursive: true, force: true });
  }

  writeIndex({
    recentProjects: index.recentProjects.filter((item) => item.id !== projectId)
  });

  return { id: projectId };
}

function listRecentProjects() {
  const index = readIndex();

  return index.recentProjects
    .filter((item) => item.path && fs.existsSync(path.join(item.path, 'project.json')))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

module.exports = {
  createProject,
  deleteProject,
  exportProjectGlb,
  listRecentProjects,
  openProject,
  openRecent,
  projectsDir,
  renameProject,
  saveProject
};
