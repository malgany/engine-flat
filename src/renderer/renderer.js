import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const state = {
  recentProjects: [],
  activeProject: null,
  view: 'home',
  activeCardMenuProjectId: null,
  renameProject: null,
  deleteProject: null,
  deleteTileset: null,
  history: {
    undoStack: [],
    redoStack: [],
    lastSnapshot: null,
    savedSnapshot: null,
    isRestoring: false
  },
  selectedObjectId: 'scene-light',
  selectedObjectIds: new Set(['scene-light']),
  selectedGroupId: null,
  selectionAnchorObjectId: 'scene-light',
  editingGroupId: null,
  expandedGroupIds: new Set(),
  draggedObjectId: null,
  activeTilesetId: 'colors',
  activeTileColor: '#9aa0a6',
  pendingTilesetImportId: null,
  customColorTargetIndex: null,
  activeTool: 'select',
  viewportTool: 'select',
  roundingControlMode: 'edge'
};

const viewport = {
  initialized: false,
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  animationId: null,
  objectGroup: null,
  sceneObjectMeshes: new Map(),
  textureCache: new Map(),
  imageCache: new Map(),
  sceneLight: null,
  lightMarker: null,
  axisGizmoRenderer: null,
  axisGizmoScene: null,
  axisGizmoCamera: null,
  axisGizmoRoot: null,
  axisGizmoTargets: [],
  axisGizmoRaycaster: new THREE.Raycaster(),
  axisGizmoPointer: new THREE.Vector2(),
  bucketPreviewGroup: null,
  transformHandleGroup: null,
  transformHandleTargets: [],
  hoveredTransformTarget: null
};

const viewportInteraction = {
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  groundPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  groundPoint: new THREE.Vector3(),
  isPaintingTiles: false,
  lastPaintTargetKey: null,
  resizeDrag: null,
  moveDrag: null,
  rotateDrag: null,
  roundDrag: null,
  groupResizeDrag: null,
  selectionClick: null
};

viewportInteraction.raycaster.params.Line.threshold = 0.08;

const defaultTileSizePixels = 100;
const minTileSizePixels = 5;
const maxTileSizePixels = 1000;
const tileVisualHeightUnits = 0.02;
const gridHalfCellCount = 10;
const viewportClickMoveTolerance = 6;
const maxHistoryEntries = 120;
const projectThumbnailWidthPixels = 320;
const projectThumbnailHeightPixels = 180;
const projectThumbnailQuality = 0.72;
const defaultTileColor = '#9aa0a6';
const defaultTilesetId = 'colors';
const roundingControlModes = new Set(['edge', 'axis', 'all']);
const roundingHandleMinPercent = 0;
const roundingHandleMaxPercent = 100;
const roundingGeometrySegments = 14;
const tilePaletteColors = createDefaultTilePalette();
const roundingEdgeDefinitions = createRoundingEdgeDefinitions();
const roundingEdgeIds = roundingEdgeDefinitions.map((edge) => edge.id);
let roundingModeMenuCloseTimer = null;

const elements = {
  homeView: document.querySelector('#homeView'),
  editorView: document.querySelector('#editorView'),
  newProjectButton: document.querySelector('#newProjectButton'),
  openProjectButton: document.querySelector('#openProjectButton'),
  emptyNewProjectButton: document.querySelector('#emptyNewProjectButton'),
  refreshButton: document.querySelector('#refreshButton'),
  settingsButton: document.querySelector('#settingsButton'),
  showFolderButton: document.querySelector('#showFolderButton'),
  backHomeButton: document.querySelector('#backHomeButton'),
  editorExportButton: document.querySelector('#editorExportButton'),
  editorSaveButton: document.querySelector('#editorSaveButton'),
  recentGrid: document.querySelector('#recentGrid'),
  emptyState: document.querySelector('#emptyState'),
  projectCount: document.querySelector('#projectCount'),
  objectTree: document.querySelector('#objectTree'),
  axisGizmo: document.querySelector('#axisGizmo'),
  undoButton: document.querySelector('#undoButton'),
  redoButton: document.querySelector('#redoButton'),
  viewportSelectToolButton: document.querySelector('#viewportSelectToolButton'),
  viewportMoveToolButton: document.querySelector('#viewportMoveToolButton'),
  viewportRotateToolButton: document.querySelector('#viewportRotateToolButton'),
  viewportScaleToolButton: document.querySelector('#viewportScaleToolButton'),
  viewportRoundToolItem: document.querySelector('#viewportRoundToolItem'),
  viewportRoundToolButton: document.querySelector('#viewportRoundToolButton'),
  viewportRoundModeMenu: document.querySelector('#viewportRoundModeMenu'),
  viewportRoundModeButtons: [...document.querySelectorAll('[data-rounding-mode]')],
  axisGizmoCanvas: document.querySelector('#axisGizmoCanvas'),
  stampToolButton: document.querySelector('#stampToolButton'),
  bucketToolButton: document.querySelector('#bucketToolButton'),
  addTileButton: document.querySelector('#addTileButton'),
  propertyFields: document.querySelector('#propertyFields'),
  selectedObjectName: document.querySelector('#selectedObjectName'),
  tileStyleName: document.querySelector('#tileStyleName'),
  tileSetTabs: document.querySelector('#tileSetTabs'),
  tileSetContent: document.querySelector('#tileSetContent'),
  tileSetImageInput: document.querySelector('#tileSetImageInput'),
  tileColorPicker: document.querySelector('#tileColorPicker'),
  collapseLeftPanelsButton: document.querySelector('#collapseLeftPanelsButton'),
  collapseRightPanelsButton: document.querySelector('#collapseRightPanelsButton'),
  projectsPath: document.querySelector('#projectsPath'),
  editorProjectName: document.querySelector('#editorProjectName'),
  editorSaveState: document.querySelector('#editorSaveState'),
  viewportProjectLabel: document.querySelector('#viewportProjectLabel'),
  sceneViewport: document.querySelector('#sceneViewport'),
  snackbar: document.querySelector('#snackbar'),
  newProjectModal: document.querySelector('#newProjectModal'),
  newProjectForm: document.querySelector('#newProjectForm'),
  projectNameInput: document.querySelector('#projectNameInput'),
  tileSizeInput: document.querySelector('#tileSizeInput'),
  cancelNewProjectButton: document.querySelector('#cancelNewProjectButton'),
  renameProjectModal: document.querySelector('#renameProjectModal'),
  renameProjectForm: document.querySelector('#renameProjectForm'),
  renameProjectNameInput: document.querySelector('#renameProjectNameInput'),
  cancelRenameProjectButton: document.querySelector('#cancelRenameProjectButton'),
  deleteProjectModal: document.querySelector('#deleteProjectModal'),
  deleteProjectForm: document.querySelector('#deleteProjectForm'),
  deleteProjectMessage: document.querySelector('#deleteProjectMessage'),
  cancelDeleteProjectButton: document.querySelector('#cancelDeleteProjectButton'),
  deleteTilesetModal: document.querySelector('#deleteTilesetModal'),
  deleteTilesetForm: document.querySelector('#deleteTilesetForm'),
  deleteTilesetMessage: document.querySelector('#deleteTilesetMessage'),
  cancelDeleteTilesetButton: document.querySelector('#cancelDeleteTilesetButton'),
  outlinerContextMenu: document.querySelector('#outlinerContextMenu')
};

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function defaultProjectName() {
  const time = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date());

  return `Projeto sem título ${time}`;
}

function normalizeTileSizePixels(value) {
  const numericValue = Number.parseInt(value, 10);

  if (Number.isNaN(numericValue)) {
    return defaultTileSizePixels;
  }

  return Math.min(maxTileSizePixels, Math.max(minTileSizePixels, numericValue));
}

function normalizeHexColor(value) {
  const color = String(value || '').trim();

  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color.toLowerCase();
  }

  return defaultTileColor;
}

function normalizeTileCoordinate(value) {
  const numericValue = Number.parseInt(value, 10);
  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

function normalizeTileMaterial(material = {}) {
  if (typeof material === 'string') {
    return {
      color: normalizeHexColor(material)
    };
  }

  const normalizedMaterial = {
    color: normalizeHexColor(material.color || defaultTileColor)
  };

  if (material.texture?.tilesetId) {
    normalizedMaterial.color = normalizeHexColor(material.color || '#ffffff');
    normalizedMaterial.texture = {
      tilesetId: String(material.texture.tilesetId),
      tileX: normalizeTileCoordinate(material.texture.tileX),
      tileY: normalizeTileCoordinate(material.texture.tileY)
    };
  }

  return normalizedMaterial;
}

function cloneTileMaterial(material) {
  return cloneJson(normalizeTileMaterial(material));
}

function componentToHex(value) {
  return Math.round(value).toString(16).padStart(2, '0');
}

function hslToHex(hue, saturation, lightness) {
  const chroma = (1 - Math.abs((2 * lightness) - 1)) * saturation;
  const intermediate = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - (chroma / 2);
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) {
    red = chroma;
    green = intermediate;
  } else if (hue < 120) {
    red = intermediate;
    green = chroma;
  } else if (hue < 180) {
    green = chroma;
    blue = intermediate;
  } else if (hue < 240) {
    green = intermediate;
    blue = chroma;
  } else if (hue < 300) {
    red = intermediate;
    blue = chroma;
  } else {
    red = chroma;
    blue = intermediate;
  }

  return `#${componentToHex((red + match) * 255)}${componentToHex((green + match) * 255)}${componentToHex((blue + match) * 255)}`;
}

function createDefaultTilePalette() {
  const neutralColors = [
    '#ffffff', '#f3f4f6', '#d1d5db', '#9ca3af', '#6b7280', '#374151', '#111827', '#000000',
    '#f5efe6', '#d8c3a5', '#b88a5a', '#8b5e34', '#5a3a22', '#3a2a1b', defaultTileColor, '#7a8172'
  ];
  const hues = [0, 16, 32, 48, 62, 80, 108, 142, 170, 190, 210, 230, 252, 272, 292, 318, 340];
  const colorFamilies = hues.flatMap((hue) => [
    hslToHex(hue, 0.78, 0.36),
    hslToHex(hue, 0.72, 0.52),
    hslToHex(hue, 0.66, 0.68),
    hslToHex(hue, 0.52, 0.82)
  ]);

  return [...neutralColors, ...colorFamilies, defaultTileColor];
}

function createRoundingEdgeDefinitions() {
  const groups = [
    {
      axis: 'x',
      label: 'Bordas X',
      fixedAxes: ['y', 'z'],
      labels: {
        y: { 1: 'Y+', [-1]: 'Y-' },
        z: { 1: 'Z+', [-1]: 'Z-' }
      }
    },
    {
      axis: 'y',
      label: 'Bordas Y',
      fixedAxes: ['x', 'z'],
      labels: {
        x: { 1: 'X+', [-1]: 'X-' },
        z: { 1: 'Z+', [-1]: 'Z-' }
      }
    },
    {
      axis: 'z',
      label: 'Bordas Z',
      fixedAxes: ['x', 'y'],
      labels: {
        x: { 1: 'X+', [-1]: 'X-' },
        y: { 1: 'Y+', [-1]: 'Y-' }
      }
    }
  ];

  return groups.flatMap((group) => {
    const [firstAxis, secondAxis] = group.fixedAxes;

    return [1, -1].flatMap((firstSign) => [1, -1].map((secondSign) => ({
      id: `${group.axis}_${firstAxis}_${firstSign > 0 ? 'pos' : 'neg'}_${secondAxis}_${secondSign > 0 ? 'pos' : 'neg'}`,
      axis: group.axis,
      groupLabel: group.label,
      label: `${group.labels[firstAxis][firstSign]} ${group.labels[secondAxis][secondSign]}`,
      fixedAxes: [
        { axis: firstAxis, sign: firstSign },
        { axis: secondAxis, sign: secondSign }
      ]
    })));
  });
}

function clampRoundingPercent(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(roundingHandleMaxPercent, Math.max(roundingHandleMinPercent, numericValue));
}

function normalizeTileRounding(rounding = {}) {
  const sourceEdges = rounding.edges || {};
  const edges = {};

  roundingEdgeIds.forEach((edgeId) => {
    edges[edgeId] = clampRoundingPercent(sourceEdges[edgeId]);
  });

  return { edges };
}

function cloneTileRounding(rounding) {
  return cloneJson(normalizeTileRounding(rounding));
}

function getRoundingEdgeValue(rounding, edgeId) {
  return clampRoundingPercent(normalizeTileRounding(rounding).edges[edgeId]);
}

function setRoundingEdgeValue(rounding, edgeId, value) {
  const normalizedRounding = normalizeTileRounding(rounding);

  if (roundingEdgeIds.includes(edgeId)) {
    normalizedRounding.edges[edgeId] = clampRoundingPercent(value);
  }

  return normalizedRounding;
}

function setRoundingEdgeValues(rounding, edgeIds, value) {
  const normalizedRounding = normalizeTileRounding(rounding);
  const nextValue = clampRoundingPercent(value);

  edgeIds.forEach((edgeId) => {
    if (roundingEdgeIds.includes(edgeId)) {
      normalizedRounding.edges[edgeId] = nextValue;
    }
  });

  return normalizedRounding;
}

function setAllRoundingEdges(value) {
  const edges = {};
  const nextValue = clampRoundingPercent(value);

  roundingEdgeIds.forEach((edgeId) => {
    edges[edgeId] = nextValue;
  });

  return { edges };
}

function getRoundingAveragePercent(rounding) {
  const normalizedRounding = normalizeTileRounding(rounding);
  const total = roundingEdgeIds.reduce((sum, edgeId) => sum + normalizedRounding.edges[edgeId], 0);

  return total / roundingEdgeIds.length;
}

function getRoundingEdgesAveragePercent(rounding, edgeIds = roundingEdgeIds) {
  const normalizedRounding = normalizeTileRounding(rounding);
  const validEdgeIds = edgeIds.filter((edgeId) => roundingEdgeIds.includes(edgeId));

  if (validEdgeIds.length === 0) {
    return 0;
  }

  const total = validEdgeIds.reduce((sum, edgeId) => sum + normalizedRounding.edges[edgeId], 0);

  return total / validEdgeIds.length;
}

function hasTileRounding(rounding) {
  const normalizedRounding = normalizeTileRounding(rounding);
  return roundingEdgeIds.some((edgeId) => normalizedRounding.edges[edgeId] > 0);
}

function createDefaultLightObject() {
  return {
    id: 'scene-light',
    name: 'Luz',
    type: 'directional-light',
    transform: {
      position: [0, 4, 3],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    },
    intensity: 1.25,
    visible: true,
    locked: false,
    moveSnap: true,
    rotateSnap: true
  };
}

function normalizeSceneObject(object, tileSizePixels) {
  const commonObject = {
    ...object,
    visible: object.visible !== false,
    locked: object.locked === true,
    moveSnap: object.moveSnap !== false,
    rotateSnap: object.rotateSnap !== false
  };

  if (object.type !== 'tile') {
    return commonObject;
  }

  const existingPosition = object.transform?.position;
  const fallbackPosition = existingPosition || [0, 0, 0];
  const widthPixels = object.size?.widthPixels || tileSizePixels;
  const depthPixels = object.size?.depthPixels || tileSizePixels;
  const heightPixels = object.size?.heightPixels || 1;
  const heightUnits = getTileHeightUnits(tileSizePixels, heightPixels);
  const gridPosition = object.gridPosition || [
    Math.floor(fallbackPosition[0]),
    Math.floor(fallbackPosition[2])
  ];
  const position = existingPosition || [gridPosition[0] + 0.5, heightUnits / 2, gridPosition[1] + 0.5];

  return {
    ...commonObject,
    gridPosition,
    transform: {
      position,
      rotation: object.transform?.rotation || [0, 0, 0],
      scale: object.transform?.scale || [1, 1, 1]
    },
    size: {
      widthPixels,
      depthPixels,
      heightPixels
    },
    material: normalizeTileMaterial(object.material),
    rounding: normalizeTileRounding(object.rounding),
    resizeSnap: object.resizeSnap !== false,
    moveSnap: object.moveSnap !== false,
    rotateSnap: object.rotateSnap !== false
  };
}

function normalizeTilesets(tilesets) {
  if (!Array.isArray(tilesets)) {
    return [];
  }

  return tilesets
    .filter((tileset) => tileset?.type === 'image')
    .map((tileset, index) => ({
      id: String(tileset.id || `tileset-${Date.now()}-${index}`),
      type: 'image',
      name: String(tileset.name || `Imagem ${index + 1}`),
      imageName: String(tileset.imageName || ''),
      imageDataUrl: String(tileset.imageDataUrl || ''),
      imageWidth: Math.max(0, Number.parseInt(tileset.imageWidth, 10) || 0),
      imageHeight: Math.max(0, Number.parseInt(tileset.imageHeight, 10) || 0),
      selectedTile: [
        normalizeTileCoordinate(tileset.selectedTile?.[0]),
        normalizeTileCoordinate(tileset.selectedTile?.[1])
      ],
      zoom: Math.min(8, Math.max(0.25, Number(tileset.zoom) || 1))
    }));
}

function normalizeProject(project) {
  const tileSizePixels = normalizeTileSizePixels(project.grid?.tileSizePixels);
  const objects = Array.isArray(project.scene?.objects)
    ? project.scene.objects
    : [createDefaultLightObject()];
  const objectIds = new Set(objects.map((object) => object.id));
  const groups = Array.isArray(project.scene?.groups)
    ? project.scene.groups.map((group, index) => ({
      id: group.id || `group-${Date.now()}-${index}`,
      name: group.name || `Grupo ${index + 1}`,
      visible: group.visible !== false,
      locked: group.locked === true,
      transform: {
        position: group.transform?.position || [0, 0, 0],
        rotation: group.transform?.rotation || [0, 0, 0],
        scale: group.transform?.scale || [1, 1, 1]
      },
      moveSnap: group.moveSnap !== false,
      rotateSnap: group.rotateSnap !== false,
      resizeSnap: group.resizeSnap !== false,
      objectIds: Array.isArray(group.objectIds)
        ? group.objectIds.filter((objectId) => objectIds.has(objectId))
        : []
    })).filter((group) => group.objectIds.length > 0)
    : [];

  return {
    ...project,
    grid: {
      tileSizePixels
    },
    tilesets: normalizeTilesets(project.tilesets),
    scene: {
      units: project.scene?.units || 'meters',
      objects: objects.map((object) => normalizeSceneObject(object, tileSizePixels)),
      groups,
      camera: project.scene?.camera || {
        position: [6, 5, 8],
        target: [0, 0, 0]
      }
    }
  };
}

function showMessage(message) {
  elements.snackbar.textContent = message;
  elements.snackbar.classList.add('snackbar-visible');

  window.clearTimeout(showMessage.timeoutId);
  showMessage.timeoutId = window.setTimeout(() => {
    elements.snackbar.classList.remove('snackbar-visible');
  }, 3200);
}

function setView(view) {
  state.view = view;
  elements.homeView.hidden = view !== 'home';
  elements.editorView.hidden = view !== 'editor';

  if (view === 'editor') {
    window.requestAnimationFrame(() => {
      initViewport();
      resizeViewport();
    });
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function getEditableProjectHistoryPayload() {
  if (!state.activeProject) {
    return null;
  }

  return {
    description: state.activeProject.description || '',
    grid: cloneJson(state.activeProject.grid || {}),
    tilesets: cloneJson(state.activeProject.tilesets || []),
    scene: cloneJson(state.activeProject.scene || {})
  };
}

function getCurrentHistorySnapshot() {
  const payload = getEditableProjectHistoryPayload();
  return payload ? JSON.stringify(payload) : null;
}

function pushHistoryEntry(stack, snapshot) {
  if (!snapshot) {
    return;
  }

  stack.push(snapshot);

  if (stack.length > maxHistoryEntries) {
    stack.shift();
  }
}

function updateUndoRedoButtons() {
  if (!elements.undoButton || !elements.redoButton) {
    return;
  }

  elements.undoButton.disabled = !state.activeProject || state.history.undoStack.length === 0;
  elements.redoButton.disabled = !state.activeProject || state.history.redoStack.length === 0;
}

function updateEditorSaveState() {
  if (!state.activeProject) {
    updateUndoRedoButtons();
    return;
  }

  const currentSnapshot = getCurrentHistorySnapshot();
  elements.editorSaveState.textContent = currentSnapshot === state.history.savedSnapshot ? 'Salvo' : 'Não salvo';
  updateUndoRedoButtons();
}

function resetEditorHistory() {
  const snapshot = getCurrentHistorySnapshot();
  state.history.undoStack = [];
  state.history.redoStack = [];
  state.history.lastSnapshot = snapshot;
  state.history.savedSnapshot = snapshot;
  updateEditorSaveState();
}

function recordEditorHistory() {
  if (state.history.isRestoring || !state.activeProject) {
    return;
  }

  const snapshot = getCurrentHistorySnapshot();

  if (!snapshot || snapshot === state.history.lastSnapshot) {
    updateEditorSaveState();
    return;
  }

  pushHistoryEntry(state.history.undoStack, state.history.lastSnapshot);
  state.history.redoStack = [];
  state.history.lastSnapshot = snapshot;
  updateEditorSaveState();
}

function reconcileSelectionAfterHistoryRestore(previousSelection) {
  const groupIds = new Set(getSceneGroups().map((group) => group.id));
  state.expandedGroupIds = new Set([
    ...getSceneGroups().map((group) => group.id),
    ...[...state.expandedGroupIds].filter((groupId) => groupIds.has(groupId))
  ]);

  if (previousSelection.groupId && groupIds.has(previousSelection.groupId)) {
    selectGroup(previousSelection.groupId);
    return;
  }

  const objectIds = previousSelection.objectIds.filter((objectId) => getObjectById(objectId));

  if (objectIds.length > 0) {
    setSelectedObjects(objectIds, previousSelection.primaryObjectId);
    return;
  }

  setSelectedObjects([]);
}

function restoreEditorHistorySnapshot(snapshot) {
  if (!state.activeProject || !snapshot) {
    return;
  }

  const previousSelection = {
    groupId: state.selectedGroupId,
    objectIds: [...state.selectedObjectIds],
    primaryObjectId: state.selectedObjectId
  };
  const payload = JSON.parse(snapshot);

  state.history.isRestoring = true;
  try {
    state.activeProject = normalizeProject({
      ...state.activeProject,
      description: payload.description,
      grid: payload.grid,
      tilesets: payload.tilesets,
      scene: payload.scene
    });
    elements.viewportProjectLabel.textContent = state.activeProject.description || 'Cena 3D inicial sem objeto.';
    reconcileSelectionAfterHistoryRestore(previousSelection);
    syncProjectSceneToViewport();
    renderObjectTree();
    renderPropertiesPanel();
    renderTileStylePanel();
  } finally {
    state.history.isRestoring = false;
  }

  state.history.lastSnapshot = snapshot;
  updateEditorSaveState();
}

function undoEditorAction() {
  if (!state.activeProject || state.history.undoStack.length === 0) {
    return;
  }

  const currentSnapshot = getCurrentHistorySnapshot();
  const previousSnapshot = state.history.undoStack.pop();

  pushHistoryEntry(state.history.redoStack, currentSnapshot);
  restoreEditorHistorySnapshot(previousSnapshot);
}

function redoEditorAction() {
  if (!state.activeProject || state.history.redoStack.length === 0) {
    return;
  }

  const currentSnapshot = getCurrentHistorySnapshot();
  const nextSnapshot = state.history.redoStack.pop();

  pushHistoryEntry(state.history.undoStack, currentSnapshot);
  restoreEditorHistorySnapshot(nextSnapshot);
}

function setActiveProject(project, options = {}) {
  const shouldResetHistory = options.resetHistory !== false;
  clearBucketPreview();
  disposeTextureCache();
  state.activeProject = normalizeProject(project);
  state.activeTilesetId = defaultTilesetId;
  state.pendingTilesetImportId = null;
  state.expandedGroupIds = new Set(getSceneGroups().map((group) => group.id));
  setSelectedObjects(['scene-light']);
  elements.editorProjectName.textContent = state.activeProject.name;
  elements.viewportProjectLabel.textContent = state.activeProject.description || 'Cena 3D inicial sem objeto.';
  elements.editorSaveState.textContent = 'Salvo';
  renderObjectTree();
  renderPropertiesPanel();
  renderTileStylePanel();
  if (shouldResetHistory) {
    resetEditorHistory();
  } else {
    state.history.savedSnapshot = getCurrentHistorySnapshot();
    state.history.lastSnapshot = state.history.savedSnapshot;
    updateEditorSaveState();
  }

  if (viewport.initialized) {
    syncProjectSceneToViewport();
  }
}

function markEditorDirty() {
  recordEditorHistory();
}

function openNewProjectModal() {
  elements.projectNameInput.value = '';
  elements.tileSizeInput.value = String(defaultTileSizePixels);
  elements.newProjectModal.hidden = false;
  window.setTimeout(() => elements.projectNameInput.focus(), 0);
}

function closeNewProjectModal() {
  elements.newProjectModal.hidden = true;
}

function closeCardMenus() {
  state.activeCardMenuProjectId = null;
  document.querySelectorAll('.project-card-menu').forEach((menu) => {
    menu.hidden = true;
  });
  document.querySelectorAll('.project-card-menu-button').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
  });
}

function toggleCardMenu(projectId) {
  const shouldOpen = state.activeCardMenuProjectId !== projectId;

  closeCardMenus();

  if (!shouldOpen) {
    return;
  }

  const menu = document.querySelector(`[data-project-menu="${projectId}"]`);
  const button = document.querySelector(`[data-project-menu-button="${projectId}"]`);

  if (!menu || !button) {
    return;
  }

  state.activeCardMenuProjectId = projectId;
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
}

function openRenameProjectModal(project) {
  state.renameProject = project;
  elements.renameProjectNameInput.value = project.name;
  elements.renameProjectModal.hidden = false;
  window.setTimeout(() => {
    elements.renameProjectNameInput.focus();
    elements.renameProjectNameInput.select();
  }, 0);
}

function closeRenameProjectModal() {
  state.renameProject = null;
  elements.renameProjectModal.hidden = true;
}

function openDeleteProjectModal(project) {
  state.deleteProject = project;
  elements.deleteProjectMessage.textContent = `Deseja mesmo excluir "${project.name}"? Esta ação remove a pasta local do projeto.`;
  elements.deleteProjectModal.hidden = false;
  window.setTimeout(() => elements.cancelDeleteProjectButton.focus(), 0);
}

function closeDeleteProjectModal() {
  state.deleteProject = null;
  elements.deleteProjectModal.hidden = true;
}

function openDeleteTilesetModal(tileset) {
  state.deleteTileset = tileset;
  elements.deleteTilesetMessage.textContent = `Deseja mesmo remover "${tileset.name}"? Os tiles que usam este TileSet voltam para a cor padrao.`;
  elements.deleteTilesetModal.hidden = false;
  window.setTimeout(() => elements.cancelDeleteTilesetButton.focus(), 0);
}

function closeDeleteTilesetModal() {
  state.deleteTileset = null;
  elements.deleteTilesetModal.hidden = true;
}

function getSceneObjects() {
  return state.activeProject?.scene?.objects || [];
}

function getObjectVisibility(object) {
  return object?.visible !== false;
}

function getObjectLocked(object) {
  return object?.locked === true;
}

function getGroupVisibility(group) {
  return group?.visible !== false;
}

function getGroupLocked(group) {
  return group?.locked === true;
}

function isObjectEffectivelyLocked(object) {
  if (!object) {
    return false;
  }

  return getObjectLocked(object) || getGroupLocked(getGroupContainingObject(object.id));
}

function getSceneGroups() {
  if (!state.activeProject) {
    return [];
  }

  state.activeProject.scene.groups = Array.isArray(state.activeProject.scene.groups)
    ? state.activeProject.scene.groups
    : [];

  return state.activeProject.scene.groups;
}

function getGroupById(groupId) {
  return getSceneGroups().find((group) => group.id === groupId) || null;
}

function getSelectedGroup() {
  return state.selectedGroupId ? getGroupById(state.selectedGroupId) : null;
}

function getGroupObjects(group) {
  if (!group) {
    return [];
  }

  return group.objectIds.map((objectId) => getObjectById(objectId)).filter(Boolean);
}

function getObjectById(objectId) {
  return getSceneObjects().find((object) => object.id === objectId) || null;
}

function getOutlinerObjectOrder() {
  const objects = getSceneObjects();
  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const groupedObjectIds = new Set();
  const orderedObjects = [];

  getSceneGroups().forEach((group) => {
    group.objectIds.forEach((objectId) => {
      const object = objectsById.get(objectId);

      if (object) {
        groupedObjectIds.add(objectId);
        orderedObjects.push(object);
      }
    });
  });

  objects.forEach((object) => {
    if (!groupedObjectIds.has(object.id)) {
      orderedObjects.push(object);
    }
  });

  return orderedObjects;
}

function createIconElement(iconId) {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const iconUse = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  icon.classList.add('icon');
  icon.setAttribute('aria-hidden', 'true');
  iconUse.setAttribute('href', iconId);
  icon.append(iconUse);
  return icon;
}

function setSelectedObjects(objectIds, primaryObjectId = objectIds.at(-1) || null) {
  const validObjectIds = objectIds.filter((objectId) => getObjectById(objectId));
  state.selectedObjectIds = new Set(validObjectIds);
  state.selectedObjectId = validObjectIds.includes(primaryObjectId)
    ? primaryObjectId
    : validObjectIds.at(-1) || null;
  state.selectedGroupId = null;
  state.selectionAnchorObjectId = state.selectedObjectId;
  const selectedObject = getObjectById(state.selectedObjectId);

  if (selectedObject?.type === 'tile') {
    const selectedMaterial = normalizeTileMaterial(selectedObject.material);

    if (selectedMaterial.texture && getTilesetById(selectedMaterial.texture.tilesetId)) {
      const tileset = getTilesetById(selectedMaterial.texture.tilesetId);
      state.activeTilesetId = selectedMaterial.texture.tilesetId;
      tileset.selectedTile = [selectedMaterial.texture.tileX, selectedMaterial.texture.tileY];
    } else {
      state.activeTilesetId = defaultTilesetId;
      state.activeTileColor = selectedMaterial.color;
    }
  }

  applyViewportSelectionState();
  renderTransformHandles();
  renderTileStylePanel();
}

function selectOnlyObject(objectId) {
  if (state.selectedObjectIds.size === 1 && state.selectedObjectIds.has(objectId)) {
    setSelectedObjects([]);
    return;
  }

  setSelectedObjects([objectId], objectId);
}

function toggleObjectSelection(objectId) {
  const objectIds = new Set(state.selectedObjectIds);

  if (objectIds.has(objectId)) {
    objectIds.delete(objectId);
  } else {
    objectIds.add(objectId);
  }

  setSelectedObjects([...objectIds], objectIds.has(objectId) ? objectId : [...objectIds].at(-1) || null);
}

function selectRangeTo(objectId) {
  const orderedObjectIds = getOutlinerObjectOrder().map((object) => object.id);
  const anchorId = state.selectionAnchorObjectId || state.selectedObjectId || orderedObjectIds[0];
  const anchorIndex = orderedObjectIds.indexOf(anchorId);
  const targetIndex = orderedObjectIds.indexOf(objectId);

  if (anchorIndex < 0 || targetIndex < 0) {
    setSelectedObjects([objectId], objectId);
    return;
  }

  const [start, end] = anchorIndex < targetIndex
    ? [anchorIndex, targetIndex]
    : [targetIndex, anchorIndex];

  setSelectedObjects(orderedObjectIds.slice(start, end + 1), objectId);
  state.selectionAnchorObjectId = anchorId;
}

function selectAllObjects() {
  setSelectedObjects(getOutlinerObjectOrder().map((object) => object.id));
}

function selectGroup(groupId) {
  state.selectedGroupId = groupId;
  state.selectedObjectIds = new Set();
  state.selectedObjectId = null;
  state.selectionAnchorObjectId = null;
  applyViewportSelectionState();
  renderTransformHandles();
  renderTileStylePanel();
}

function isGroupExpanded(groupId) {
  return state.expandedGroupIds.has(groupId);
}

function toggleGroupExpanded(groupId) {
  if (state.expandedGroupIds.has(groupId)) {
    state.expandedGroupIds.delete(groupId);
  } else {
    state.expandedGroupIds.add(groupId);
  }
}

function getSelectedObject() {
  if (!state.selectedObjectId) {
    return null;
  }

  return getObjectById(state.selectedObjectId);
}

function formatMeters(value) {
  return `${Number(value || 0).toFixed(3)} m`;
}

function formatPixels(value) {
  return `${Number(value || 0).toFixed(0)} px`;
}

function formatPropertyNumber(value, precision = 3) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return precision === 0 ? '0' : Number(0).toFixed(precision);
  }

  return precision === 0 ? String(Math.round(numericValue)) : numericValue.toFixed(precision);
}

function parsePropertyNumber(value) {
  const normalizedValue = String(value || '')
    .trim()
    .replace(',', '.')
    .replace(/[^\d+\-.eE]/g, '');
  const numericValue = Number.parseFloat(normalizedValue);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function getTileDimensionUnits(object) {
  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;

  return {
    tileSizePixels,
    widthUnits: (object.size?.widthPixels || tileSizePixels) / tileSizePixels,
    depthUnits: (object.size?.depthPixels || tileSizePixels) / tileSizePixels,
    heightUnits: getTileHeightUnits(tileSizePixels, object.size?.heightPixels || 1)
  };
}

function getTilePositionPixels(object) {
  const position = object.transform?.position || [0, 0, 0];
  const { tileSizePixels, widthUnits, depthUnits, heightUnits } = getTileDimensionUnits(object);

  return [
    (position[0] - (widthUnits / 2)) * tileSizePixels,
    (position[1] - (heightUnits / 2)) * tileSizePixels,
    (position[2] - (depthUnits / 2)) * tileSizePixels
  ];
}

function getObjectUniformScale(object) {
  const scale = object.transform?.scale || [1, 1, 1];
  const numericScale = Number(scale[0]);

  return Number.isFinite(numericScale) && numericScale > 0 ? numericScale : 1;
}

function createNumericProperty(label, propertyKey, value, options = {}) {
  const precision = options.precision ?? 3;
  const unitLabel = options.unit ? ` (${options.unit})` : '';
  const minAttribute = options.min === undefined ? '' : ` min="${options.min}"`;
  const maxAttribute = options.max === undefined ? '' : ` max="${options.max}"`;
  const stepAttribute = options.step === undefined ? '' : ` step="${options.step}"`;
  const disabledAttribute = options.disabled ? ' disabled aria-disabled="true"' : '';

  return `<label>${label}${unitLabel} <input type="number" inputmode="decimal" data-property-key="${propertyKey}" value="${formatPropertyNumber(value, precision)}"${minAttribute}${maxAttribute}${stepAttribute}${disabledAttribute}></label>`;
}

function createToggleProperty(label, attributeName, isChecked, isDisabled = false) {
  const checkedAttribute = isChecked ? ' checked' : '';
  const disabledAttribute = isDisabled ? ' disabled aria-disabled="true"' : '';

  return `<label class="property-toggle">${label} <input type="checkbox" ${attributeName}${checkedAttribute}${disabledAttribute}></label>`;
}

function createPropertyDivider() {
  return '<div class="property-divider" role="separator" aria-hidden="true"></div>';
}

function createRoundingProperties(tile, isDisabled = false) {
  const rounding = normalizeTileRounding(tile.rounding);
  const properties = [
    '<div class="property-section-title">Arredondamento</div>',
    createNumericProperty('Todas as bordas', 'rounding-all', getRoundingAveragePercent(rounding), {
      precision: 0,
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      disabled: isDisabled
    })
  ];

  ['Bordas X', 'Bordas Y', 'Bordas Z'].forEach((groupLabel) => {
    properties.push(`<div class="property-subsection-title">${groupLabel}</div>`);
    roundingEdgeDefinitions
      .filter((edge) => edge.groupLabel === groupLabel)
      .forEach((edge) => {
        properties.push(createNumericProperty(edge.label, `rounding-edge-${edge.id}`, rounding.edges[edge.id], {
          precision: 0,
          min: 0,
          max: 100,
          step: 1,
          unit: '%',
          disabled: isDisabled
        }));
      });
  });

  return properties;
}

function getGroupScale(group) {
  const numericScale = Number(group?.transform?.scale?.[0]);
  return Number.isFinite(numericScale) && numericScale > 0 ? numericScale : 1;
}

function getGroupTransformBounds(group) {
  const objectBounds = getGroupObjects(group).map((object) => getSelectedTransformBounds(object));

  if (objectBounds.length === 0) {
    const position = group?.transform?.position || [0, 0, 0];

    return {
      center: new THREE.Vector3(position[0], position[1], position[2]),
      half: new THREE.Vector3(0.5, 0.5, 0.5),
      radius: 0.7
    };
  }

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  objectBounds.forEach((bounds) => {
    min.min(bounds.center.clone().sub(bounds.half));
    max.max(bounds.center.clone().add(bounds.half));
  });

  const center = min.clone().add(max).multiplyScalar(0.5);
  const half = max.clone().sub(min).multiplyScalar(0.5);
  const radius = Math.max(half.x * 2, half.y * 2, half.z * 2, 1) * 0.68;

  return { center, half, radius };
}

function getGroupDimensionPixels(group, bounds = getGroupTransformBounds(group)) {
  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  const widthUnits = bounds.half.x * 2;
  const heightUnits = bounds.half.y * 2;
  const depthUnits = bounds.half.z * 2;

  return {
    tileSizePixels,
    originPixels: [
      (bounds.center.x - bounds.half.x) * tileSizePixels,
      (bounds.center.y - bounds.half.y) * tileSizePixels,
      (bounds.center.z - bounds.half.z) * tileSizePixels
    ],
    widthPixels: Math.max(tileSizePixels, Math.round(widthUnits * tileSizePixels)),
    depthPixels: Math.max(tileSizePixels, Math.round(depthUnits * tileSizePixels)),
    heightPixels: getTileHeightPixelsFromUnits(heightUnits, tileSizePixels)
  };
}

function renderPropertiesPanel() {
  const selectedGroup = getSelectedGroup();

  if (selectedGroup) {
    renderGroupPropertiesPanel(selectedGroup);
    return;
  }

  const selectedObject = getSelectedObject();

  if (!selectedObject) {
    elements.selectedObjectName.textContent = 'Nenhum';
    elements.propertyFields.innerHTML = '<div class="property-empty">Nenhum objeto selecionado.</div>';
    return;
  }

  elements.selectedObjectName.textContent = selectedObject.name;
  const isLocked = isObjectEffectivelyLocked(selectedObject);

  const position = selectedObject.transform?.position || [0, 0, 0];
  const rotation = selectedObject.transform?.rotation || [0, 0, 0];
  const scale = selectedObject.transform?.scale || [1, 1, 1];
  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  const gridPosition = selectedObject.gridPosition || [0, 0];
  const tilePositionPixels = selectedObject.type === 'tile' ? getTilePositionPixels(selectedObject) : [0, 0, 0];

  const properties = [
    createNumericProperty('Localização X', 'position-x', selectedObject.type === 'tile' ? tilePositionPixels[0] : position[0], {
      precision: selectedObject.type === 'tile' ? 0 : 3,
      step: selectedObject.type === 'tile' ? 1 : 0.01,
      unit: selectedObject.type === 'tile' ? 'px' : 'm'
    }),
    createNumericProperty('Localização Y', 'position-y', selectedObject.type === 'tile' ? tilePositionPixels[1] : position[1], {
      precision: selectedObject.type === 'tile' ? 0 : 3,
      step: selectedObject.type === 'tile' ? 1 : 0.01,
      unit: selectedObject.type === 'tile' ? 'px' : 'm'
    }),
    createNumericProperty('Localização Z', 'position-z', selectedObject.type === 'tile' ? tilePositionPixels[2] : position[2], {
      precision: selectedObject.type === 'tile' ? 0 : 3,
      step: selectedObject.type === 'tile' ? 1 : 0.01,
      unit: selectedObject.type === 'tile' ? 'px' : 'm'
    }),
    `<label class="property-toggle">Movimento magnético <input type="checkbox" data-object-move-snap ${selectedObject.moveSnap !== false ? 'checked' : ''}></label>`,
    createPropertyDivider(),
    createNumericProperty('Rotação X', 'rotation-x', Number(rotation[0] || 0), { step: 0.1, unit: 'deg' }),
    createNumericProperty('Rotação Y', 'rotation-y', Number(rotation[1] || 0), { step: 0.1, unit: 'deg' }),
    createNumericProperty('Rotação Z', 'rotation-z', Number(rotation[2] || 0), { step: 0.1, unit: 'deg' }),
    `<label class="property-toggle">Rotação magnética <input type="checkbox" data-object-rotate-snap ${selectedObject.rotateSnap !== false ? 'checked' : ''}></label>`,
    createPropertyDivider()
  ];

  if (selectedObject.type === 'tile') {
    properties.push(
      createNumericProperty('Largura', 'width', selectedObject.size?.widthPixels || tileSizePixels, { precision: 0, min: tileSizePixels, step: 1, unit: 'px' }),
      createNumericProperty('Profundidade', 'depth', selectedObject.size?.depthPixels || tileSizePixels, { precision: 0, min: tileSizePixels, step: 1, unit: 'px' }),
      createNumericProperty('Altura', 'height', selectedObject.size?.heightPixels || 1, { precision: 0, min: 1, step: 1, unit: 'px' }),
      createNumericProperty('Escala', 'scale', Number(scale[0] || 1), { min: 0.01, step: 0.01 }),
      `<label class="property-toggle">Transformação magnética <input type="checkbox" data-tile-resize-snap ${selectedObject.resizeSnap !== false ? 'checked' : ''}></label>`,
      createPropertyDivider(),
      ...createRoundingProperties(selectedObject, isLocked),
      createPropertyDivider(),
      `<div class="property-note"><span>Célula</span><span>${gridPosition[0]}, ${gridPosition[1]}</span></div>`,
      `<div class="property-note"><span>Quadrado</span><span>${tileSizePixels} x ${tileSizePixels} px</span></div>`
    );
  } else {
    properties.push(createNumericProperty('Escala', 'scale', Number(scale[0] || 1), { min: 0.01, step: 0.01 }));
  }

  if (selectedObject.type === 'directional-light') {
    properties.push(createPropertyDivider(), `
      <div class="light-controls" aria-label="Mover luz">
        <button type="button" data-light-action="orbit-left">Órbita -</button>
        <button type="button" data-light-action="orbit-right">Órbita +</button>
        <button type="button" data-light-action="height-up">Altura +</button>
        <button type="button" data-light-action="height-down">Altura -</button>
        <button type="button" data-light-action="distance-in">Distância -</button>
        <button type="button" data-light-action="distance-out">Distância +</button>
      </div>
    `);
  }

  elements.propertyFields.innerHTML = properties.join('');

  if (isLocked) {
    setPropertiesDisabled('Objeto bloqueado. Desbloqueie o cadeado para editar propriedades e transformações.');
  }
}

function setPropertiesDisabled(message) {
  const lockedNote = document.createElement('div');
  lockedNote.className = 'property-locked';
  lockedNote.textContent = message;
  elements.propertyFields.prepend(lockedNote);
  elements.propertyFields.querySelectorAll('input, button').forEach((control) => {
    control.disabled = true;
    control.setAttribute('aria-disabled', 'true');
  });
}

function renderGroupPropertiesPanel(group) {
  const groupObjects = getGroupObjects(group);
  const bounds = getGroupTransformBounds(group);
  const groupMetrics = getGroupDimensionPixels(group, bounds);
  const rotation = group.transform?.rotation || [0, 0, 0];
  const scale = group.transform?.scale || [1, 1, 1];
  const isLocked = getGroupLocked(group);

  elements.selectedObjectName.textContent = group.name;

  if (groupObjects.length === 0) {
    elements.propertyFields.innerHTML = '<div class="property-empty">Grupo vazio.</div>';
    return;
  }

  const properties = [
    createNumericProperty('Localização X', 'position-x', groupMetrics.originPixels[0], { precision: 0, step: 1, unit: 'px', disabled: isLocked }),
    createNumericProperty('Localização Y', 'position-y', groupMetrics.originPixels[1], { precision: 0, step: 1, unit: 'px', disabled: isLocked }),
    createNumericProperty('Localização Z', 'position-z', groupMetrics.originPixels[2], { precision: 0, step: 1, unit: 'px', disabled: isLocked }),
    createToggleProperty('Movimento magnético', 'data-object-move-snap', group.moveSnap !== false, isLocked),
    createPropertyDivider(),
    createNumericProperty('Rotação X', 'rotation-x', Number(rotation[0] || 0), { step: 0.1, unit: 'deg', disabled: isLocked }),
    createNumericProperty('Rotação Y', 'rotation-y', Number(rotation[1] || 0), { step: 0.1, unit: 'deg', disabled: isLocked }),
    createNumericProperty('Rotação Z', 'rotation-z', Number(rotation[2] || 0), { step: 0.1, unit: 'deg', disabled: isLocked }),
    createToggleProperty('Rotação magnética', 'data-object-rotate-snap', group.rotateSnap !== false, isLocked),
    createPropertyDivider(),
    createNumericProperty('Largura', 'width', groupMetrics.widthPixels, { precision: 0, min: groupMetrics.tileSizePixels, step: 1, unit: 'px', disabled: isLocked }),
    createNumericProperty('Profundidade', 'depth', groupMetrics.depthPixels, { precision: 0, min: groupMetrics.tileSizePixels, step: 1, unit: 'px', disabled: isLocked }),
    createNumericProperty('Altura', 'height', groupMetrics.heightPixels, { precision: 0, min: 1, step: 1, unit: 'px', disabled: isLocked }),
    createNumericProperty('Escala', 'scale', Number(scale[0] || 1), { min: 0.01, step: 0.01, disabled: isLocked }),
    createToggleProperty('Transformação magnética', 'data-tile-resize-snap', group.resizeSnap !== false, isLocked),
    createPropertyDivider(),
    `<div class="property-note"><span>Itens</span><span>${groupObjects.length}</span></div>`,
    `<div class="property-note"><span>Quadrado</span><span>${groupMetrics.tileSizePixels} x ${groupMetrics.tileSizePixels} px</span></div>`
  ];

  elements.propertyFields.innerHTML = properties.join('');

  if (isLocked) {
    setPropertiesDisabled('Grupo bloqueado. Desbloqueie o cadeado para editar o grupo.');
  }
}

function updateSelectedNumericProperty(input, options = {}) {
  if (state.selectedGroupId) {
    updateSelectedGroupNumericProperty(input, options);
    return;
  }

  const selectedObject = getSelectedObject();
  const propertyKey = input.dataset.propertyKey;
  const numericValue = parsePropertyNumber(input.value);
  const shouldRender = options.render !== false;
  const shouldRecordHistory = options.recordHistory !== false;

  if (!selectedObject || !propertyKey || numericValue === null) {
    if (shouldRender) {
      renderPropertiesPanel();
    }
    return;
  }

  if (isObjectEffectivelyLocked(selectedObject)) {
    if (shouldRender) {
      renderPropertiesPanel();
    }
    return;
  }

  const position = [...(selectedObject.transform?.position || [0, 0, 0])];
  const rotation = [...(selectedObject.transform?.rotation || [0, 0, 0])];

  if (propertyKey.startsWith('position-')) {
    const axisIndex = propertyKey.endsWith('x') ? 0 : propertyKey.endsWith('y') ? 1 : 2;

    if (selectedObject.type === 'tile') {
      const { tileSizePixels, widthUnits, depthUnits, heightUnits } = getTileDimensionUnits(selectedObject);
      const offsets = [widthUnits / 2, heightUnits / 2, depthUnits / 2];
      position[axisIndex] = (numericValue / tileSizePixels) + offsets[axisIndex];
    } else {
      position[axisIndex] = numericValue;
    }

    selectedObject.transform = {
      ...selectedObject.transform,
      position
    };
  } else if (propertyKey.startsWith('rotation-')) {
    const axisIndex = propertyKey.endsWith('x') ? 0 : propertyKey.endsWith('y') ? 1 : 2;
    rotation[axisIndex] = numericValue;
    selectedObject.transform = {
      ...selectedObject.transform,
      rotation
    };
  } else if (propertyKey === 'rounding-all' && selectedObject.type === 'tile') {
    selectedObject.rounding = setAllRoundingEdges(numericValue);
  } else if (propertyKey.startsWith('rounding-edge-') && selectedObject.type === 'tile') {
    const edgeId = propertyKey.slice('rounding-edge-'.length);
    selectedObject.rounding = setRoundingEdgeValue(selectedObject.rounding, edgeId, numericValue);
  } else if (propertyKey === 'scale') {
    const scaleValue = Math.max(0.01, numericValue);
    selectedObject.transform = {
      ...selectedObject.transform,
      scale: [scaleValue, scaleValue, scaleValue]
    };
  } else if (selectedObject.type === 'tile') {
    updateSelectedTileNumericProperty(selectedObject, propertyKey, numericValue);
  }

  updateTileGridPositionFromTransform(selectedObject);
  syncProjectSceneToViewport();

  if (shouldRender) {
    renderObjectTree();
    renderPropertiesPanel();
  }

  if (shouldRecordHistory) {
    markEditorDirty();
  }
}

function updateSelectedGroupNumericProperty(input, options = {}) {
  const group = getSelectedGroup();
  const propertyKey = input.dataset.propertyKey;
  const numericValue = parsePropertyNumber(input.value);
  const shouldRender = options.render !== false;
  const shouldRecordHistory = options.recordHistory !== false;

  if (!group || !propertyKey || numericValue === null) {
    if (shouldRender) {
      renderPropertiesPanel();
    }
    return;
  }

  if (getGroupLocked(group)) {
    if (shouldRender) {
      renderPropertiesPanel();
    }
    return;
  }

  const bounds = getGroupTransformBounds(group);
  const groupMetrics = getGroupDimensionPixels(group, bounds);

  if (propertyKey.startsWith('position-')) {
    const axisIndex = propertyKey.endsWith('x') ? 0 : propertyKey.endsWith('y') ? 1 : 2;
    const currentPositionPixels = groupMetrics.originPixels;
    const nextPositionPixels = [...currentPositionPixels];
    nextPositionPixels[axisIndex] = numericValue;
    moveGroupByDelta(group, [
      (nextPositionPixels[0] - currentPositionPixels[0]) / groupMetrics.tileSizePixels,
      (nextPositionPixels[1] - currentPositionPixels[1]) / groupMetrics.tileSizePixels,
      (nextPositionPixels[2] - currentPositionPixels[2]) / groupMetrics.tileSizePixels
    ]);
  } else if (propertyKey.startsWith('rotation-')) {
    const axisIndex = propertyKey.endsWith('x') ? 0 : propertyKey.endsWith('y') ? 1 : 2;
    const rotation = [...(group.transform?.rotation || [0, 0, 0])];
    const deltaDegrees = numericValue - rotationOrZero(rotation[axisIndex]);
    rotation[axisIndex] = numericValue;
    group.transform = {
      ...group.transform,
      rotation
    };
    rotateGroupByDelta(group, axisIndex, deltaDegrees, bounds.center);
  } else if (propertyKey === 'scale') {
    const nextScale = Math.max(0.01, numericValue);
    scaleGroupTo(group, nextScale, bounds.center);
  } else if (propertyKey === 'width' || propertyKey === 'depth' || propertyKey === 'height') {
    const axis = propertyKey === 'width' ? 'x' : propertyKey === 'height' ? 'y' : 'z';
    const minimumUnits = getGroupResizeMinimumUnits(axis);
    const nextUnits = propertyKey === 'height'
      ? getTileHeightUnits(groupMetrics.tileSizePixels, Math.max(1, Math.round(numericValue)))
      : Math.max(minimumUnits, Math.round(numericValue) / groupMetrics.tileSizePixels);
    const startUnits = Math.max(bounds.half[axis] * 2, minimumUnits);
    applyGroupResizeFromStart(group, cloneGroupObjectTransforms(group), axis, 1, bounds.center, startUnits, nextUnits);
  }

  syncProjectSceneToViewport();

  if (shouldRender) {
    renderObjectTree();
    renderPropertiesPanel();
  }

  if (shouldRecordHistory) {
    markEditorDirty();
  }
}

function updateSelectedTileNumericProperty(tile, propertyKey, numericValue) {
  const { tileSizePixels } = getTileDimensionUnits(tile);
  const originPixels = getTilePositionPixels(tile);
  const nextSize = {
    widthPixels: tile.size?.widthPixels || tileSizePixels,
    depthPixels: tile.size?.depthPixels || tileSizePixels,
    heightPixels: tile.size?.heightPixels || 1
  };

  if (propertyKey === 'width') {
    nextSize.widthPixels = Math.max(tileSizePixels, Math.round(numericValue));
  } else if (propertyKey === 'depth') {
    nextSize.depthPixels = Math.max(tileSizePixels, Math.round(numericValue));
  } else if (propertyKey === 'height') {
    nextSize.heightPixels = Math.max(1, Math.round(numericValue));
  } else {
    return;
  }

  tile.size = nextSize;

  const widthUnits = nextSize.widthPixels / tileSizePixels;
  const depthUnits = nextSize.depthPixels / tileSizePixels;
  const heightUnits = getTileHeightUnits(tileSizePixels, nextSize.heightPixels);
  const originX = originPixels[0] / tileSizePixels;
  const originY = originPixels[1] / tileSizePixels;
  const originZ = originPixels[2] / tileSizePixels;

  tile.transform = {
    ...tile.transform,
    position: [
      originX + (widthUnits / 2),
      originY + (heightUnits / 2),
      originZ + (depthUnits / 2)
    ]
  };
}

function getSelectedTiles() {
  return [...state.selectedObjectIds]
    .map((objectId) => getObjectById(objectId))
    .filter((object) => object?.type === 'tile');
}

function getTileStylePanelName() {
  const selectedTiles = getSelectedTiles();

  if (selectedTiles.length === 1) {
    return selectedTiles[0].name;
  }

  if (selectedTiles.length > 1) {
    return `${selectedTiles.length} tiles`;
  }

  return 'Padrão';
}

function getTilesets() {
  return state.activeProject?.tilesets || [];
}

function getTilesetById(tilesetId) {
  return getTilesets().find((tileset) => tileset.id === tilesetId) || null;
}

function getActiveTileset() {
  return state.activeTilesetId === defaultTilesetId ? null : getTilesetById(state.activeTilesetId);
}

function getActiveTilesetLabel() {
  const activeTileset = getActiveTileset();
  return activeTileset?.name || 'Cores';
}

function ensureActiveTileset() {
  if (state.activeTilesetId !== defaultTilesetId && !getActiveTileset()) {
    state.activeTilesetId = defaultTilesetId;
  }
}

function clampTilesetSelection(tileset) {
  if (!tileset?.imageWidth || !tileset?.imageHeight) {
    return;
  }

  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  const maxTileX = Math.max(0, Math.ceil(tileset.imageWidth / tileSizePixels) - 1);
  const maxTileY = Math.max(0, Math.ceil(tileset.imageHeight / tileSizePixels) - 1);

  tileset.selectedTile = [
    Math.min(maxTileX, normalizeTileCoordinate(tileset.selectedTile?.[0])),
    Math.min(maxTileY, normalizeTileCoordinate(tileset.selectedTile?.[1]))
  ];
}

function getTilesetTileBounds(tileset, tileX = 0, tileY = 0) {
  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  const sourceX = tileX * tileSizePixels;
  const sourceY = tileY * tileSizePixels;

  return {
    sourceX,
    sourceY,
    width: Math.max(0, Math.min(tileSizePixels, tileset.imageWidth - sourceX)),
    height: Math.max(0, Math.min(tileSizePixels, tileset.imageHeight - sourceY))
  };
}

function getActiveTileMaterial() {
  const activeTileset = getActiveTileset();

  if (activeTileset?.imageDataUrl && activeTileset.imageWidth > 0 && activeTileset.imageHeight > 0) {
    clampTilesetSelection(activeTileset);

    return {
      color: '#ffffff',
      texture: {
        tilesetId: activeTileset.id,
        tileX: normalizeTileCoordinate(activeTileset.selectedTile?.[0]),
        tileY: normalizeTileCoordinate(activeTileset.selectedTile?.[1])
      }
    };
  }

  return {
    color: state.activeTileColor
  };
}

function getTileMaterialKey(material) {
  const normalizedMaterial = normalizeTileMaterial(material);

  if (normalizedMaterial.texture) {
    return `texture:${normalizedMaterial.texture.tilesetId}:${normalizedMaterial.texture.tileX}:${normalizedMaterial.texture.tileY}`;
  }

  return `color:${normalizedMaterial.color}`;
}

function getTileMaterialPreviewColor(material) {
  const normalizedMaterial = normalizeTileMaterial(material);
  return normalizedMaterial.texture ? '#ffffff' : normalizedMaterial.color;
}

function setActiveTileset(tilesetId) {
  state.activeTilesetId = tilesetId || defaultTilesetId;
  ensureActiveTileset();
  renderTileStylePanel();
}

function renderTilesetTab(label, tilesetId, options = {}) {
  const button = document.createElement('button');
  const isActive = state.activeTilesetId === tilesetId;

  button.type = 'button';
  button.className = 'tileset-tab';
  button.textContent = label;
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', String(isActive));
  button.classList.toggle('active', isActive);
  button.addEventListener('click', () => setActiveTileset(tilesetId));

  if (options.closable) {
    const item = document.createElement('div');
    const closeButton = document.createElement('button');

    item.className = 'tileset-tab-item';
    item.classList.toggle('active', isActive);
    button.classList.add('tileset-tab-closable');
    closeButton.type = 'button';
    closeButton.className = 'tileset-tab-close';
    closeButton.setAttribute('aria-label', `Remover ${label}`);
    closeButton.title = 'Remover TileSet';
    closeButton.append(createIconElement('#icon-close'));
    closeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const tileset = getTilesetById(tilesetId);

      if (tileset) {
        openDeleteTilesetModal(tileset);
      }
    });
    item.append(button, closeButton);
    return item;
  }

  return button;
}

function renderTileStylePanel() {
  ensureActiveTileset();
  elements.tileStyleName.textContent = getActiveTilesetLabel();
  elements.tileSetTabs.replaceChildren();
  elements.tileSetContent.replaceChildren();

  elements.tileSetTabs.append(renderTilesetTab('Cores', defaultTilesetId));

  getTilesets().forEach((tileset) => {
    elements.tileSetTabs.append(renderTilesetTab(tileset.name, tileset.id, { closable: true }));
  });

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'tileset-add-tab';
  addButton.setAttribute('aria-label', 'Adicionar TileSet');
  addButton.title = 'Adicionar TileSet';
  addButton.append(createIconElement('#icon-add'));
  addButton.addEventListener('click', addTilesetTab);
  elements.tileSetTabs.append(addButton);

  if (state.activeTilesetId !== defaultTilesetId) {
    renderImageTilesetContent(getActiveTileset());
    return;
  }

  renderColorTilesetContent();
}

function renderColorTilesetContent() {
  const colorPanel = document.createElement('div');
  const colorGrid = document.createElement('div');

  colorPanel.className = 'tile-color-panel';
  colorGrid.className = 'tile-color-grid';
  colorGrid.setAttribute('aria-label', 'Cores do tile');

  tilePaletteColors.forEach((color, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile-color-swatch';
    button.style.setProperty('--swatch-color', color);
    button.setAttribute('aria-label', `Selecionar cor ${color}`);
    button.classList.toggle('selected', state.activeTilesetId === defaultTilesetId && normalizeHexColor(color) === state.activeTileColor);
    button.addEventListener('click', () => selectTileColor(color));
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      state.customColorTargetIndex = index;
      elements.tileColorPicker.value = color;
      elements.tileColorPicker.click();
    });
    colorGrid.append(button);
  });

  colorPanel.append(colorGrid);
  elements.tileSetContent.append(colorPanel);
}

function renderImageTilesetContent(tileset) {
  if (!tileset) {
    return;
  }

  if (!tileset.imageDataUrl) {
    const empty = document.createElement('div');
    const importButton = document.createElement('button');

    empty.className = 'tileset-empty';
    importButton.type = 'button';
    importButton.className = 'tileset-import-button';
    importButton.textContent = 'Importar';
    importButton.addEventListener('click', () => triggerTilesetImport(tileset.id));
    empty.append(importButton);
    elements.tileSetContent.append(empty);
    return;
  }

  clampTilesetSelection(tileset);

  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  const zoom = Math.min(8, Math.max(0.25, Number(tileset.zoom) || 1));
  const [tileX, tileY] = tileset.selectedTile || [0, 0];
  const selectedBounds = getTilesetTileBounds(tileset, tileX, tileY);
  const scroll = document.createElement('div');
  const stage = document.createElement('div');
  const image = document.createElement('img');
  const grid = document.createElement('div');
  const selection = document.createElement('div');

  tileset.zoom = zoom;
  scroll.className = 'tileset-image-scroll';
  stage.className = 'tileset-image-stage';
  stage.style.setProperty('--tileset-stage-width', `${tileset.imageWidth * zoom}px`);
  stage.style.setProperty('--tileset-stage-height', `${tileset.imageHeight * zoom}px`);
  stage.style.setProperty('--tileset-grid-size', `${tileSizePixels * zoom}px`);
  image.src = tileset.imageDataUrl;
  image.alt = tileset.imageName || tileset.name;
  grid.className = 'tileset-grid-overlay';
  selection.className = 'tileset-selection';
  selection.style.left = `${selectedBounds.sourceX * zoom}px`;
  selection.style.top = `${selectedBounds.sourceY * zoom}px`;
  selection.style.width = `${selectedBounds.width * zoom}px`;
  selection.style.height = `${selectedBounds.height * zoom}px`;

  stage.append(image, grid, selection);
  scroll.append(stage);
  scroll.addEventListener('click', (event) => selectTilesetImageTile(event, tileset.id, stage));
  scroll.addEventListener('wheel', (event) => zoomTilesetImage(event, tileset.id));
  elements.tileSetContent.append(scroll);
}

function selectTileColor(color) {
  state.activeTilesetId = defaultTilesetId;
  state.activeTileColor = normalizeHexColor(color);
  renderTileStylePanel();
}

function addTilesetTab() {
  if (!state.activeProject) {
    return;
  }

  const nextIndex = getTilesets().length + 1;
  const tileset = {
    id: `tileset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'image',
    name: `Imagem ${nextIndex}`,
    imageName: '',
    imageDataUrl: '',
    imageWidth: 0,
    imageHeight: 0,
    selectedTile: [0, 0],
    zoom: 1
  };

  state.activeProject.tilesets = getTilesets();
  state.activeProject.tilesets.push(tileset);
  state.activeTilesetId = tileset.id;
  renderTileStylePanel();
  markEditorDirty();
}

function replaceRemovedTilesetMaterials(tilesetId) {
  getSceneObjects().forEach((object) => {
    const material = normalizeTileMaterial(object.material);

    if (material.texture?.tilesetId === tilesetId) {
      object.material = {
        color: defaultTileColor
      };
    }
  });
}

function removeTileset(tilesetId) {
  if (!state.activeProject || tilesetId === defaultTilesetId) {
    return null;
  }

  const tileset = getTilesetById(tilesetId);

  if (!tileset) {
    return null;
  }

  state.activeProject.tilesets = getTilesets().filter((item) => item.id !== tilesetId);
  replaceRemovedTilesetMaterials(tilesetId);

  if (state.activeTilesetId === tilesetId) {
    state.activeTilesetId = defaultTilesetId;
  }

  if (state.pendingTilesetImportId === tilesetId) {
    state.pendingTilesetImportId = null;
  }

  disposeTextureCache();
  syncProjectSceneToViewport();
  renderTileStylePanel();
  markEditorDirty();

  return tileset;
}

function triggerTilesetImport(tilesetId) {
  state.pendingTilesetImportId = tilesetId;
  elements.tileSetImageInput.value = '';
  elements.tileSetImageInput.click();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function readImageSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener('load', () => resolve({
      width: image.naturalWidth,
      height: image.naturalHeight,
      image
    }));
    image.addEventListener('error', () => reject(new Error('Não foi possível carregar a imagem.')));
    image.src = dataUrl;
  });
}

async function importTilesetImage(file) {
  const tileset = getTilesetById(state.pendingTilesetImportId || state.activeTilesetId);

  if (!tileset || !file) {
    return;
  }

  if (!file.type.startsWith('image/')) {
    showMessage('Importe uma imagem PNG, JPG, WebP ou GIF.');
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  const imageSize = await readImageSize(dataUrl);
  const baseName = file.name.replace(/\.[^.]+$/, '') || tileset.name;

  tileset.name = baseName;
  tileset.imageName = file.name;
  tileset.imageDataUrl = dataUrl;
  tileset.imageWidth = imageSize.width;
  tileset.imageHeight = imageSize.height;
  tileset.selectedTile = [0, 0];
  tileset.zoom = 1;
  state.activeTilesetId = tileset.id;
  disposeTextureCache();
  cacheTilesetImageElement(tileset, imageSize.image);
  syncProjectSceneToViewport();
  renderTileStylePanel();
  markEditorDirty();
  showMessage(`TileSet importado: ${file.name}`);
}

function selectTilesetImageTile(event, tilesetId, stage) {
  const tileset = getTilesetById(tilesetId);

  if (!tileset) {
    return;
  }

  const zoom = Number(tileset.zoom) || 1;
  const rect = stage.getBoundingClientRect();
  const imageX = (event.clientX - rect.left) / zoom;
  const imageY = (event.clientY - rect.top) / zoom;

  if (imageX < 0 || imageY < 0 || imageX >= tileset.imageWidth || imageY >= tileset.imageHeight) {
    return;
  }

  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  tileset.selectedTile = [
    Math.floor(imageX / tileSizePixels),
    Math.floor(imageY / tileSizePixels)
  ];
  state.activeTilesetId = tileset.id;
  renderTileStylePanel();
}

function zoomTilesetImage(event, tilesetId) {
  const tileset = getTilesetById(tilesetId);

  if (!tileset) {
    return;
  }

  event.preventDefault();

  const scroll = event.currentTarget;
  const previousZoom = Math.min(8, Math.max(0.25, Number(tileset.zoom) || 1));
  const nextZoom = Math.min(8, Math.max(0.25, previousZoom * (event.deltaY < 0 ? 1.12 : 0.88)));
  const rect = scroll.getBoundingClientRect();
  const focusX = (scroll.scrollLeft + event.clientX - rect.left) / previousZoom;
  const focusY = (scroll.scrollTop + event.clientY - rect.top) / previousZoom;

  tileset.zoom = nextZoom;
  renderTileStylePanel();
  window.requestAnimationFrame(() => {
    const nextScroll = elements.tileSetContent.querySelector('.tileset-image-scroll');

    if (!nextScroll) {
      return;
    }

    nextScroll.scrollLeft = (focusX * nextZoom) - (event.clientX - rect.left);
    nextScroll.scrollTop = (focusY * nextZoom) - (event.clientY - rect.top);
  });
}

function renderObjectTree() {
  if (!state.activeProject) {
    return;
  }

  elements.objectTree.replaceChildren();

  const objects = getSceneObjects();
  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const groupedObjectIds = new Set();

  const renderObjectItem = (object, className = '', options = {}) => {
    const item = document.createElement('li');
    item.className = className;
    item.draggable = true;
    item.setAttribute('data-object-id', object.id);

    if (state.selectedObjectIds.has(object.id)) {
      item.classList.add('selected');
    }

    item.classList.toggle('object-hidden', !getObjectVisibility(object));
    item.classList.toggle('object-locked', getObjectLocked(object));
    item.classList.toggle('group-hidden-child', options.groupHidden === true);

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-object-id', object.id);
    const icon = createIconElement(object.type === 'tile' ? '#icon-tile' : '#icon-light');
    const label = document.createElement('span');
    label.className = 'object-label';
    label.textContent = object.name;
    button.append(icon, document.createTextNode(object.name));
    button.addEventListener('click', (event) => {
      elements.objectTree.focus();

      if (event.shiftKey) {
        selectRangeTo(object.id);
      } else if (event.ctrlKey || event.metaKey) {
        toggleObjectSelection(object.id);
      } else {
        selectOnlyObject(object.id);
      }

      renderObjectTree();
      renderPropertiesPanel();
    });

    button.replaceChildren(icon, label);

    const actions = document.createElement('div');
    actions.className = 'object-row-actions';

    const visibilityButton = document.createElement('button');
    visibilityButton.type = 'button';
    visibilityButton.className = 'object-state-button';
    visibilityButton.setAttribute('aria-label', getObjectVisibility(object) ? `Ocultar ${object.name}` : `Mostrar ${object.name}`);
    visibilityButton.title = getObjectVisibility(object) ? 'Ocultar' : 'Mostrar';
    visibilityButton.append(createIconElement(getObjectVisibility(object) ? '#icon-eye' : '#icon-eye-off'));
    visibilityButton.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleObjectVisibility(object.id);
    });

    const lockButton = document.createElement('button');
    lockButton.type = 'button';
    lockButton.className = 'object-state-button';
    lockButton.setAttribute('aria-label', getObjectLocked(object) ? `Desbloquear ${object.name}` : `Bloquear ${object.name}`);
    lockButton.title = getObjectLocked(object) ? 'Desbloquear' : 'Bloquear';
    lockButton.append(createIconElement(getObjectLocked(object) ? '#icon-lock' : '#icon-lock-open'));
    lockButton.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleObjectLock(object.id);
    });

    actions.append(visibilityButton, lockButton);
    item.addEventListener('dragstart', (event) => handleObjectDragStart(event, object.id));
    item.addEventListener('dragover', handleObjectDragOver);
    item.addEventListener('dragleave', handleObjectDragLeave);
    item.addEventListener('drop', (event) => handleObjectDrop(event, object.id));
    item.addEventListener('dragend', handleObjectDragEnd);
    item.append(button, actions);
    elements.objectTree.append(item);
  };

  getSceneGroups().forEach((group) => {
    const isExpanded = isGroupExpanded(group.id);
    const isGroupVisible = getGroupVisibility(group);
    const isGroupLocked = getGroupLocked(group);
    const groupItem = document.createElement('li');
    groupItem.className = 'group-row';
    groupItem.classList.toggle('selected', state.selectedGroupId === group.id);
    groupItem.classList.toggle('object-hidden', !isGroupVisible);
    groupItem.classList.toggle('object-locked', isGroupLocked);

    const groupButton = document.createElement('button');
    groupButton.type = 'button';
    groupButton.setAttribute('data-group-id', group.id);
    groupButton.setAttribute('aria-expanded', String(isExpanded));

    const disclosure = document.createElement('span');
    disclosure.className = 'group-disclosure';
    disclosure.classList.toggle('expanded', isExpanded);
    disclosure.setAttribute('aria-hidden', 'true');
    const disclosureIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const disclosureUse = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    disclosureIcon.classList.add('icon');
    disclosureUse.setAttribute('href', '#icon-chevron-right');
    disclosureIcon.append(disclosureUse);
    disclosure.append(disclosureIcon);

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const iconUse = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    icon.classList.add('icon');
    icon.setAttribute('aria-hidden', 'true');
    iconUse.setAttribute('href', '#icon-folder');
    icon.append(iconUse);

    if (state.editingGroupId === group.id) {
      groupButton.classList.add('renaming');
      const input = document.createElement('input');
      input.className = 'group-rename-input';
      input.type = 'text';
      input.maxLength = 80;
      input.value = group.name;
      input.setAttribute('aria-label', `Renomear ${group.name}`);

      const confirmButton = document.createElement('span');
      confirmButton.className = 'group-rename-confirm';
      confirmButton.setAttribute('role', 'button');
      confirmButton.setAttribute('aria-label', 'Confirmar nome do grupo');
      const confirmIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const confirmIconUse = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      confirmIcon.classList.add('icon');
      confirmIcon.setAttribute('aria-hidden', 'true');
      confirmIconUse.setAttribute('href', '#icon-check');
      confirmIcon.append(confirmIconUse);
      confirmButton.append(confirmIcon);

      const commitRename = () => finishRenameGroup(group.id, input.value);

      input.addEventListener('click', (event) => event.stopPropagation());
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commitRename();
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          state.editingGroupId = null;
          renderObjectTree();
        }
      });
      input.addEventListener('blur', commitRename);
      confirmButton.addEventListener('click', (event) => {
        event.stopPropagation();
        commitRename();
      });

      groupButton.append(disclosure, icon, input, confirmButton);
      window.setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    } else {
      const label = document.createElement('span');
      label.className = 'object-label';
      label.textContent = group.name;
      groupButton.append(disclosure, icon, label);
    }

    groupButton.addEventListener('click', (event) => {
      if (state.editingGroupId === group.id && event.target.closest('.group-rename-input, .group-rename-confirm')) {
        return;
      }

      elements.objectTree.focus();
      state.editingGroupId = null;
      toggleGroupExpanded(group.id);
      selectGroup(group.id);
      renderObjectTree();
      renderPropertiesPanel();
    });

    const groupActions = document.createElement('div');
    groupActions.className = 'object-row-actions';

    const groupVisibilityButton = document.createElement('button');
    groupVisibilityButton.type = 'button';
    groupVisibilityButton.className = 'object-state-button';
    groupVisibilityButton.setAttribute('aria-label', isGroupVisible ? `Ocultar ${group.name}` : `Mostrar ${group.name}`);
    groupVisibilityButton.title = isGroupVisible ? 'Ocultar grupo' : 'Mostrar grupo';
    groupVisibilityButton.append(createIconElement(isGroupVisible ? '#icon-eye' : '#icon-eye-off'));
    groupVisibilityButton.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleGroupVisibility(group.id);
    });

    const groupLockButton = document.createElement('button');
    groupLockButton.type = 'button';
    groupLockButton.className = 'object-state-button';
    groupLockButton.setAttribute('aria-label', isGroupLocked ? `Desbloquear ${group.name}` : `Bloquear ${group.name}`);
    groupLockButton.title = isGroupLocked ? 'Desbloquear grupo' : 'Bloquear grupo';
    groupLockButton.append(createIconElement(isGroupLocked ? '#icon-lock' : '#icon-lock-open'));
    groupLockButton.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleGroupLock(group.id);
    });

    groupActions.append(groupVisibilityButton, groupLockButton);
    groupItem.append(groupButton, groupActions);
    elements.objectTree.append(groupItem);

    group.objectIds.forEach((objectId) => {
      const object = objectsById.get(objectId);

      if (object) {
        groupedObjectIds.add(objectId);
      }

      if (object && isExpanded) {
        renderObjectItem(object, 'child-row', { groupHidden: !isGroupVisible });
      }
    });
  });

  objects.forEach((object) => {
    if (!groupedObjectIds.has(object.id)) {
      renderObjectItem(object);
    }
  });
}

function toggleObjectVisibility(objectId) {
  const object = getObjectById(objectId);

  if (!object) {
    return;
  }

  object.visible = !getObjectVisibility(object);
  syncProjectSceneToViewport();
  renderObjectTree();
  markEditorDirty();
}

function toggleObjectLock(objectId) {
  const object = getObjectById(objectId);

  if (!object) {
    return;
  }

  object.locked = !getObjectLocked(object);
  renderTransformHandles();
  renderObjectTree();
  renderPropertiesPanel();
  markEditorDirty();
}

function toggleGroupVisibility(groupId) {
  const group = getSceneGroups().find((item) => item.id === groupId);

  if (!group) {
    return;
  }

  group.visible = !getGroupVisibility(group);
  syncProjectSceneToViewport();
  renderTransformHandles();
  renderObjectTree();
  markEditorDirty();
}

function toggleGroupLock(groupId) {
  const group = getSceneGroups().find((item) => item.id === groupId);

  if (!group) {
    return;
  }

  group.locked = !getGroupLocked(group);
  renderTransformHandles();
  renderObjectTree();
  renderPropertiesPanel();
  markEditorDirty();
}

function getGroupContainingObject(objectId) {
  return getSceneGroups().find((group) => group.objectIds.includes(objectId)) || null;
}

function isObjectEffectivelyVisible(object) {
  const group = getGroupContainingObject(object.id);
  return getObjectVisibility(object) && getGroupVisibility(group);
}

function getObjectDropPosition(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY > rect.top + (rect.height / 2) ? 'after' : 'before';
}

function clearObjectDropIndicators() {
  document.querySelectorAll('.object-tree .drag-over-before, .object-tree .drag-over-after').forEach((item) => {
    item.classList.remove('drag-over-before', 'drag-over-after');
  });
}

function moveIdNear(list, movingId, targetId, position) {
  if (movingId === targetId) {
    return list;
  }

  const nextList = list.filter((id) => id !== movingId);
  const targetIndex = nextList.indexOf(targetId);

  if (targetIndex < 0) {
    nextList.push(movingId);
  } else {
    nextList.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, movingId);
  }

  return nextList;
}

function reorderObjectNear(movingObjectId, targetObjectId, position = 'before') {
  if (!state.activeProject || movingObjectId === targetObjectId) {
    return;
  }

  const movingObject = getObjectById(movingObjectId);
  const targetObject = getObjectById(targetObjectId);

  if (!movingObject || !targetObject) {
    return;
  }

  const sourceGroup = getGroupContainingObject(movingObjectId);
  const targetGroup = getGroupContainingObject(targetObjectId);

  if (sourceGroup) {
    sourceGroup.objectIds = sourceGroup.objectIds.filter((objectId) => objectId !== movingObjectId);
  }

  if (targetGroup) {
    targetGroup.objectIds = moveIdNear(targetGroup.objectIds, movingObjectId, targetObjectId, position);
  }

  if (!targetGroup) {
    const objectIds = moveIdNear(getSceneObjects().map((object) => object.id), movingObjectId, targetObjectId, position);
    const objectsById = new Map(getSceneObjects().map((object) => [object.id, object]));
    state.activeProject.scene.objects = objectIds.map((objectId) => objectsById.get(objectId)).filter(Boolean);
  }

  state.activeProject.scene.groups = getSceneGroups().filter((group) => group.objectIds.length > 0);
  renderObjectTree();
  markEditorDirty();
}

function handleObjectDragStart(event, objectId) {
  state.draggedObjectId = objectId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', objectId);
  event.currentTarget.classList.add('dragging');
}

function handleObjectDragOver(event) {
  if (!state.draggedObjectId) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  clearObjectDropIndicators();
  event.currentTarget.classList.add(getObjectDropPosition(event) === 'after' ? 'drag-over-after' : 'drag-over-before');
}

function handleObjectDragLeave(event) {
  event.currentTarget.classList.remove('drag-over-before', 'drag-over-after');
}

function handleObjectDrop(event, targetObjectId) {
  event.preventDefault();
  const position = getObjectDropPosition(event);
  event.currentTarget.classList.remove('drag-over-before', 'drag-over-after');
  reorderObjectNear(state.draggedObjectId, targetObjectId, position);
  state.draggedObjectId = null;
}

function handleObjectDragEnd(event) {
  state.draggedObjectId = null;
  event.currentTarget.classList.remove('dragging');
  clearObjectDropIndicators();
}

function nextGroupName() {
  const usedNames = new Set(getSceneGroups().map((group) => group.name));
  let index = 1;

  while (usedNames.has(`Grupo ${index}`)) {
    index += 1;
  }

  return `Grupo ${index}`;
}

function groupSelectedObjects() {
  const objectIds = [...state.selectedObjectIds];

  if (!state.activeProject || objectIds.length === 0) {
    showMessage('Selecione objetos para agrupar.');
    return;
  }

  const groups = getSceneGroups();
  const selectedObjectIds = new Set(objectIds);

  groups.forEach((group) => {
    group.objectIds = group.objectIds.filter((objectId) => !selectedObjectIds.has(objectId));
  });

  state.activeProject.scene.groups = groups.filter((group) => group.objectIds.length > 0);
  const groupId = `group-${Date.now()}`;
  state.activeProject.scene.groups.push({
    id: groupId,
    name: nextGroupName(),
    visible: true,
    locked: false,
    transform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    },
    moveSnap: true,
    rotateSnap: true,
    resizeSnap: true,
    objectIds
  });
  state.expandedGroupIds.add(groupId);

  selectGroup(groupId);
  renderObjectTree();
  renderPropertiesPanel();
  markEditorDirty();
}

function renameGroup(groupId) {
  const group = getSceneGroups().find((item) => item.id === groupId);

  if (!group) {
    return;
  }

  state.editingGroupId = groupId;
  selectGroup(groupId);
  renderObjectTree();
  renderPropertiesPanel();
}

function finishRenameGroup(groupId, value) {
  if (state.editingGroupId !== groupId) {
    return;
  }

  const group = getSceneGroups().find((item) => item.id === groupId);
  const nextName = String(value || '').trim();

  state.editingGroupId = null;

  if (!group || !nextName || nextName === group.name) {
    renderObjectTree();
    return;
  }

  group.name = nextName.slice(0, 80);
  renderObjectTree();
  markEditorDirty();
}

function ungroup(groupId) {
  if (!state.activeProject) {
    return;
  }

  const group = getSceneGroups().find((item) => item.id === groupId);

  if (getGroupLocked(group)) {
    showMessage('Grupo bloqueado nao pode ser desagrupado.');
    return;
  }

  state.activeProject.scene.groups = getSceneGroups().filter((group) => group.id !== groupId);
  state.selectedGroupId = null;
  renderObjectTree();
  renderPropertiesPanel();
  markEditorDirty();
}

function deleteSelectedObjects() {
  const selectedObjectIds = [...state.selectedObjectIds];

  if (!state.activeProject || selectedObjectIds.length === 0) {
    showMessage('Selecione objetos para deletar.');
    return;
  }

  const lockedObjectIds = selectedObjectIds.filter((objectId) => {
    return isObjectEffectivelyLocked(getObjectById(objectId));
  });
  const deletableObjectIds = new Set(selectedObjectIds.filter((objectId) => {
    const object = getObjectById(objectId);
    return object && !isObjectEffectivelyLocked(object);
  }));

  if (deletableObjectIds.size === 0) {
    showMessage('Itens bloqueados nao podem ser deletados.');
    return;
  }

  state.activeProject.scene.objects = getSceneObjects()
    .filter((object) => !deletableObjectIds.has(object.id));
  state.activeProject.scene.groups = getSceneGroups()
    .map((group) => ({
      ...group,
      objectIds: group.objectIds.filter((objectId) => !deletableObjectIds.has(objectId))
    }))
    .filter((group) => group.objectIds.length > 0);

  setSelectedObjects([]);
  state.selectedGroupId = null;
  state.editingGroupId = null;
  syncProjectSceneToViewport();
  renderObjectTree();
  renderPropertiesPanel();
  markEditorDirty();
  showMessage(lockedObjectIds.length > 0
    ? `${deletableObjectIds.size} ${deletableObjectIds.size === 1 ? 'item deletado' : 'itens deletados'}; ${lockedObjectIds.length} bloqueado(s) ignorado(s).`
    : `${deletableObjectIds.size} ${deletableObjectIds.size === 1 ? 'item deletado' : 'itens deletados'}.`);
}

function deleteSelectedGroup() {
  const groupId = state.selectedGroupId;
  const group = getSceneGroups().find((item) => item.id === groupId);

  if (!state.activeProject || !group) {
    showMessage('Selecione um grupo para deletar.');
    return;
  }

  if (getGroupLocked(group)) {
    showMessage('Grupo bloqueado nao pode ser deletado.');
    return;
  }

  const lockedObjectIds = group.objectIds.filter((objectId) => getObjectLocked(getObjectById(objectId)));
  const deletableObjectIds = new Set(group.objectIds.filter((objectId) => {
    const object = getObjectById(objectId);
    return object && !getObjectLocked(object);
  }));

  state.activeProject.scene.objects = getSceneObjects()
    .filter((object) => !deletableObjectIds.has(object.id));
  state.activeProject.scene.groups = getSceneGroups()
    .filter((item) => item.id !== group.id)
    .map((item) => ({
      ...item,
      objectIds: item.objectIds.filter((objectId) => !deletableObjectIds.has(objectId))
    }))
    .filter((item) => item.objectIds.length > 0);

  setSelectedObjects([]);
  state.selectedGroupId = null;
  state.editingGroupId = null;
  syncProjectSceneToViewport();
  renderObjectTree();
  renderPropertiesPanel();
  markEditorDirty();
  showMessage(lockedObjectIds.length > 0
    ? `Grupo deletado; ${deletableObjectIds.size} ${deletableObjectIds.size === 1 ? 'item deletado' : 'itens deletados'} e ${lockedObjectIds.length} bloqueado(s) preservado(s).`
    : `Grupo deletado com ${deletableObjectIds.size} ${deletableObjectIds.size === 1 ? 'item' : 'itens'}.`);
}

function deleteSelectedSceneItems() {
  if (state.selectedGroupId) {
    deleteSelectedGroup();
    return;
  }

  deleteSelectedObjects();
}

function closeOutlinerContextMenu() {
  elements.outlinerContextMenu.hidden = true;
  elements.outlinerContextMenu.replaceChildren();
}

function addOutlinerContextAction(label, action, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = className;
  button.addEventListener('click', () => {
    closeOutlinerContextMenu();
    action();
  });
  elements.outlinerContextMenu.append(button);
}

function openOutlinerContextMenu(event) {
  if (!state.activeProject) {
    return;
  }

  event.preventDefault();
  elements.objectTree.focus();
  closeOutlinerContextMenu();

  const groupButton = event.target.closest('button[data-group-id]');
  const objectButton = event.target.closest('button[data-object-id]');

  if (groupButton) {
    const groupId = groupButton.dataset.groupId;
    selectGroup(groupId);
    addOutlinerContextAction('Renomear', () => renameGroup(groupId));
    addOutlinerContextAction('Desagrupar', () => ungroup(groupId));
    addOutlinerContextAction('Delete', deleteSelectedSceneItems, 'danger-action');
  } else {
    if (objectButton && !state.selectedObjectIds.has(objectButton.dataset.objectId)) {
      setSelectedObjects([objectButton.dataset.objectId], objectButton.dataset.objectId);
    }

    addOutlinerContextAction('Selecionar tudo', () => {
      selectAllObjects();
      renderObjectTree();
      renderPropertiesPanel();
    });
    addOutlinerContextAction('Agrupar', groupSelectedObjects);
    addOutlinerContextAction('Delete', deleteSelectedSceneItems, 'danger-action');
  }

  renderObjectTree();
  renderPropertiesPanel();
  elements.outlinerContextMenu.style.left = `${event.clientX}px`;
  elements.outlinerContextMenu.style.top = `${event.clientY}px`;
  elements.outlinerContextMenu.hidden = false;
}

function createThumbnail(project, index) {
  const thumbnail = document.createElement('div');
  thumbnail.className = `project-thumbnail project-thumbnail-${(index % 4) + 1}`;
  thumbnail.setAttribute('aria-hidden', 'true');

  if (project.thumbnail) {
    thumbnail.classList.add('project-thumbnail-captured');

    const image = document.createElement('img');
    image.src = project.thumbnail;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';

    thumbnail.append(image);
    return thumbnail;
  }

  const grid = document.createElement('div');
  grid.className = 'thumbnail-grid';

  const object = document.createElement('div');
  object.className = 'thumbnail-object';

  const plane = document.createElement('div');
  plane.className = 'thumbnail-plane';

  thumbnail.append(grid, object, plane);

  return thumbnail;
}

function renderRecentProjects() {
  elements.recentGrid.replaceChildren();
  elements.projectCount.textContent = `${state.recentProjects.length} ${state.recentProjects.length === 1 ? 'projeto' : 'projetos'}`;
  elements.emptyState.hidden = state.recentProjects.length > 0;

  state.recentProjects.forEach((project, index) => {
    const card = document.createElement('article');
    card.className = 'project-card';

    const openButton = document.createElement('button');
    openButton.className = 'project-card-open';
    openButton.type = 'button';
    openButton.setAttribute('aria-label', `Abrir ${project.name}`);

    const thumbnail = createThumbnail(project, index);

    const body = document.createElement('div');
    body.className = 'project-card-body';

    const title = document.createElement('h4');
    title.textContent = project.name;

    const description = document.createElement('p');
    description.textContent = project.description || 'Projeto do Engine Flat.';

    const meta = document.createElement('div');
    meta.className = 'project-meta';
    meta.innerHTML = `<span>Local</span><time>${formatDate(project.updatedAt)}</time>`;

    body.append(title, description, meta);
    openButton.append(thumbnail, body);

    const menuButton = document.createElement('button');
    menuButton.className = 'project-card-menu-button';
    menuButton.type = 'button';
    menuButton.setAttribute('aria-label', `Opcoes de ${project.name}`);
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('data-project-menu-button', project.id);
    menuButton.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-more-vert"></use></svg>';

    const menu = document.createElement('div');
    menu.className = 'project-card-menu';
    menu.hidden = true;
    menu.setAttribute('data-project-menu', project.id);
    menu.innerHTML = `
      <button type="button" data-action="rename">
        <svg class="icon" aria-hidden="true"><use href="#icon-edit"></use></svg>
        Renomear
      </button>
      <button class="danger-action" type="button" data-action="delete">
        <svg class="icon" aria-hidden="true"><use href="#icon-delete"></use></svg>
        Excluir
      </button>
    `;

    openButton.addEventListener('click', async () => {
      await openRecentProject(project.id);
    });

    menuButton.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleCardMenu(project.id);
    });

    menu.addEventListener('click', (event) => {
      const actionButton = event.target.closest('button[data-action]');

      if (!actionButton) {
        return;
      }

      closeCardMenus();

      if (actionButton.dataset.action === 'rename') {
        openRenameProjectModal(project);
      }

      if (actionButton.dataset.action === 'delete') {
        openDeleteProjectModal(project);
      }
    });

    card.append(openButton, menuButton, menu);
    elements.recentGrid.append(card);
  });
}

async function refreshRecentProjects() {
  try {
    state.recentProjects = await window.engineFlat.projects.listRecent();
    renderRecentProjects();
  } catch (error) {
    showMessage(error.message || 'Nao foi possivel atualizar recentes.');
  }
}

async function createProjectFromModal(event) {
  event.preventDefault();

  const typedName = elements.projectNameInput.value.trim();
  const name = typedName || defaultProjectName();
  const tileSizePixels = normalizeTileSizePixels(elements.tileSizeInput.value);

  try {
    const project = await window.engineFlat.projects.create({ name, tileSizePixels });

    closeNewProjectModal();
    setActiveProject(project);
    await refreshRecentProjects();
    setView('editor');
    showMessage(`Projeto criado: ${project.name}`);
  } catch (error) {
    showMessage(error.message || 'Nao foi possivel criar o projeto.');
  }
}

async function renameProjectFromModal(event) {
  event.preventDefault();

  if (!state.renameProject) {
    closeRenameProjectModal();
    return;
  }

  const name = elements.renameProjectNameInput.value.trim();

  if (!name) {
    showMessage('Informe um nome para o projeto.');
    return;
  }

  try {
    const project = await window.engineFlat.projects.rename(state.renameProject.id, name);

    if (state.activeProject && state.activeProject.id === project.id) {
      setActiveProject(project);
    }

    closeRenameProjectModal();
    await refreshRecentProjects();
    showMessage(`Projeto renomeado: ${project.name}`);
  } catch (error) {
    showMessage(error.message || 'Nao foi possivel renomear o projeto.');
  }
}

async function deleteProjectFromModal(event) {
  event.preventDefault();

  if (!state.deleteProject) {
    closeDeleteProjectModal();
    return;
  }

  const project = state.deleteProject;

  try {
    await window.engineFlat.projects.delete(project.id);

    if (state.activeProject && state.activeProject.id === project.id) {
      state.activeProject = null;
      setView('home');
    }

    closeDeleteProjectModal();
    await refreshRecentProjects();
    showMessage(`Projeto excluido: ${project.name}`);
  } catch (error) {
    showMessage(error.message || 'Nao foi possivel excluir o projeto.');
  }
}

function deleteTilesetFromModal(event) {
  event.preventDefault();

  if (!state.deleteTileset) {
    closeDeleteTilesetModal();
    return;
  }

  const tilesetName = state.deleteTileset.name;
  const removedTileset = removeTileset(state.deleteTileset.id);

  closeDeleteTilesetModal();

  if (removedTileset) {
    showMessage(`TileSet removido: ${tilesetName}`);
  }
}

async function openProjectDialog() {
  try {
    const project = await window.engineFlat.projects.openDialog();

    if (!project) {
      return;
    }

    setActiveProject(project);
    await refreshRecentProjects();
    setView('editor');
    showMessage(`Projeto aberto: ${project.name}`);
  } catch (error) {
    showMessage(error.message || 'Nao foi possivel abrir o projeto.');
  }
}

async function openRecentProject(projectId) {
  try {
    const project = await window.engineFlat.projects.openRecent(projectId);
    setActiveProject(project);
    await refreshRecentProjects();
    setView('editor');
    showMessage(`Projeto aberto: ${project.name}`);
  } catch (error) {
    showMessage(error.message || 'Nao foi possivel abrir o projeto.');
  }
}

function getCenteredCrop(sourceWidth, sourceHeight, targetAspectRatio) {
  let width = sourceWidth;
  let height = width / targetAspectRatio;

  if (height > sourceHeight) {
    height = sourceHeight;
    width = height * targetAspectRatio;
  }

  return {
    x: Math.max(0, (sourceWidth - width) / 2),
    y: Math.max(0, (sourceHeight - height) / 2),
    width,
    height
  };
}

function captureViewportThumbnail() {
  if (!viewport.initialized || !viewport.renderer || !viewport.scene || !viewport.camera) {
    return null;
  }

  const sourceCanvas = viewport.renderer.domElement;

  if (!sourceCanvas.width || !sourceCanvas.height) {
    return null;
  }

  const hiddenObjects = [
    viewport.transformHandleGroup,
    viewport.lightMarker,
    viewport.bucketPreviewGroup
  ].filter(Boolean);
  const previousVisibility = hiddenObjects.map((object) => object.visible);

  try {
    hiddenObjects.forEach((object) => {
      object.visible = false;
    });
    viewport.sceneObjectMeshes.forEach((mesh) => setTileMeshSelected(mesh, false));

    viewport.controls?.update();
    viewport.renderer.render(viewport.scene, viewport.camera);

    const thumbnailCanvas = document.createElement('canvas');
    thumbnailCanvas.width = projectThumbnailWidthPixels;
    thumbnailCanvas.height = projectThumbnailHeightPixels;

    const context = thumbnailCanvas.getContext('2d');

    if (!context) {
      return null;
    }

    const crop = getCenteredCrop(
      sourceCanvas.width,
      sourceCanvas.height,
      projectThumbnailWidthPixels / projectThumbnailHeightPixels
    );

    context.drawImage(
      sourceCanvas,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      projectThumbnailWidthPixels,
      projectThumbnailHeightPixels
    );

    return thumbnailCanvas.toDataURL('image/webp', projectThumbnailQuality);
  } catch {
    return null;
  } finally {
    hiddenObjects.forEach((object, index) => {
      object.visible = previousVisibility[index];
    });
    applyViewportSelectionState();
    viewport.renderer.render(viewport.scene, viewport.camera);
  }
}

async function saveActiveProject() {
  if (!state.activeProject) {
    showMessage('Abra ou crie um projeto antes de salvar.');
    return;
  }

  try {
    const thumbnail = captureViewportThumbnail() || state.activeProject.thumbnail || null;
    const project = await window.engineFlat.projects.save(state.activeProject.id, {
      description: state.activeProject.description,
      grid: state.activeProject.grid,
      tilesets: state.activeProject.tilesets,
      scene: state.activeProject.scene,
      thumbnail
    });

    setActiveProject(project, { resetHistory: false });
    await refreshRecentProjects();
    showMessage(`Projeto salvo: ${project.name}`);
  } catch (error) {
    showMessage(error.message || 'Nao foi possivel salvar o projeto.');
  }
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

function getTilesetImageCacheKey(tileset) {
  return `${tileset.id}:${tileset.imageDataUrl.length}:${tileset.imageWidth}x${tileset.imageHeight}`;
}

function cacheTilesetImageElement(tileset, image) {
  if (!tileset?.imageDataUrl || !image) {
    return;
  }

  viewport.imageCache.set(getTilesetImageCacheKey(tileset), image);
}

function getTilesetImageElement(tileset) {
  if (!tileset?.imageDataUrl) {
    return null;
  }

  const cacheKey = getTilesetImageCacheKey(tileset);
  const cachedImage = viewport.imageCache.get(cacheKey);

  if (cachedImage?.complete && cachedImage.naturalWidth > 0) {
    return cachedImage;
  }

  if (cachedImage) {
    return null;
  }

  const image = new Image();
  viewport.imageCache.set(cacheKey, image);
  image.addEventListener('load', () => {
    if (state.activeProject) {
      syncProjectSceneToViewport();
    }
  }, { once: true });
  image.src = tileset.imageDataUrl;

  return image.complete && image.naturalWidth > 0 ? image : null;
}

function loadTilesetImageElement(tileset) {
  if (!tileset?.imageDataUrl) {
    return Promise.resolve(null);
  }

  const cacheKey = getTilesetImageCacheKey(tileset);
  const cachedImage = viewport.imageCache.get(cacheKey);

  if (cachedImage?.complete && cachedImage.naturalWidth > 0) {
    return Promise.resolve(cachedImage);
  }

  return new Promise((resolve, reject) => {
    const image = cachedImage || new Image();

    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error(`Não foi possível carregar ${tileset.name}.`)), { once: true });

    if (!cachedImage) {
      viewport.imageCache.set(cacheKey, image);
      image.src = tileset.imageDataUrl;
    }
  });
}

async function ensureTilesetImagesLoaded() {
  await Promise.all(getTilesets()
    .filter((tileset) => tileset.imageDataUrl)
    .map((tileset) => loadTilesetImageElement(tileset)));
}

function createMaterialTextureMap(tileMaterial) {
  const normalizedMaterial = normalizeTileMaterial(tileMaterial);

  if (!normalizedMaterial.texture) {
    return null;
  }

  const tileset = getTilesetById(normalizedMaterial.texture.tilesetId);

  if (!tileset?.imageWidth || !tileset?.imageHeight || !tileset.imageDataUrl) {
    return null;
  }

  const bounds = getTilesetTileBounds(
    tileset,
    normalizedMaterial.texture.tileX,
    normalizedMaterial.texture.tileY
  );

  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const image = getTilesetImageElement(tileset);

  if (!image) {
    return null;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = bounds.width;
  canvas.height = bounds.height;
  context.imageSmoothingEnabled = false;
  context.drawImage(
    image,
    bounds.sourceX,
    bounds.sourceY,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  return texture;
}

function createTileRenderMaterial(tileMaterial) {
  const normalizedMaterial = normalizeTileMaterial(tileMaterial);
  const textureMap = createMaterialTextureMap(normalizedMaterial);

  return new THREE.MeshStandardMaterial({
    color: textureMap ? '#ffffff' : normalizedMaterial.color,
    map: textureMap,
    metalness: 0,
    roughness: 0.86
  });
}

function getAxisDimension(axis, width, height, depth) {
  if (axis === 'x') {
    return width;
  }

  if (axis === 'y') {
    return height;
  }

  return depth;
}

function getRoundingEdgeRadius(edge, percent, width, height, depth) {
  const firstDimension = getAxisDimension(edge.fixedAxes[0].axis, width, height, depth);
  const secondDimension = getAxisDimension(edge.fixedAxes[1].axis, width, height, depth);
  const maxRadius = Math.max(0, Math.min(firstDimension, secondDimension) * 0.48);

  return maxRadius * (clampRoundingPercent(percent) / 100);
}

function getRoundingHalfExtents(width, height, depth) {
  return {
    x: width / 2,
    y: height / 2,
    z: depth / 2
  };
}

function deformRoundedTilePosition(position, width, height, depth, rounding) {
  const normalizedRounding = normalizeTileRounding(rounding);
  const half = getRoundingHalfExtents(width, height, depth);
  const axisInsets = { x: 0, y: 0, z: 0 };

  roundingEdgeDefinitions.forEach((edge) => {
    const percent = normalizedRounding.edges[edge.id];
    const radius = getRoundingEdgeRadius(edge, percent, width, height, depth);

    if (radius <= 0.0001) {
      return;
    }

    const distances = edge.fixedAxes.map((fixed) => half[fixed.axis] - (fixed.sign * position[fixed.axis]));

    if (distances.some((distance) => distance < -0.0001 || distance > radius)) {
      return;
    }

    edge.fixedAxes.forEach((fixed) => {
      axisInsets[fixed.axis] = Math.max(axisInsets[fixed.axis], radius);
    });
  });

  const activeAxes = ['x', 'y', 'z'].filter((axis) => axisInsets[axis] > 0.0001);

  if (activeAxes.length < 2) {
    return;
  }

  let normalizedLengthSq = 0;
  const centers = {};
  const offsets = {};

  activeAxes.forEach((axis) => {
    const sign = position[axis] < 0 ? -1 : 1;
    const radius = axisInsets[axis];
    const center = sign * (half[axis] - radius);
    const offset = position[axis] - center;

    centers[axis] = center;
    offsets[axis] = offset;
    normalizedLengthSq += (offset / radius) ** 2;
  });

  if (normalizedLengthSq <= 0.0001) {
    return;
  }

  const normalizedLength = Math.sqrt(normalizedLengthSq);

  if (normalizedLength <= 1.0001) {
    return;
  }

  activeAxes.forEach((axis) => {
    position[axis] = centers[axis] + (offsets[axis] / normalizedLength);
  });
}

function createRoundedTileGeometry(width, height, depth, rounding) {
  const baseGeometry = new THREE.BoxGeometry(
    width,
    height,
    depth,
    roundingGeometrySegments,
    roundingGeometrySegments,
    roundingGeometrySegments
  );
  const geometry = baseGeometry.toNonIndexed();
  const positions = geometry.attributes.position;
  const position = new THREE.Vector3();

  baseGeometry.dispose();

  for (let index = 0; index < positions.count; index += 1) {
    position.fromBufferAttribute(positions, index);
    deformRoundedTilePosition(position, width, height, depth, rounding);
    positions.setXYZ(index, position.x, position.y, position.z);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function createTileGeometry(width, height, depth, rounding) {
  if (!hasTileRounding(rounding)) {
    return new THREE.BoxGeometry(width, height, depth);
  }

  return createRoundedTileGeometry(width, height, depth, rounding);
}

function createExportTileMesh(sceneObject) {
  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  const widthUnits = (sceneObject.size?.widthPixels || tileSizePixels) / tileSizePixels;
  const depthUnits = (sceneObject.size?.depthPixels || tileSizePixels) / tileSizePixels;
  const heightPixels = sceneObject.size?.heightPixels || 1;
  const heightUnits = getTileHeightUnits(tileSizePixels, heightPixels);
  const geometry = createTileGeometry(widthUnits, heightUnits, depthUnits, sceneObject.rounding);
  const material = createTileRenderMaterial(sceneObject.material);
  const mesh = new THREE.Mesh(geometry, material);
  const position = sceneObject.transform?.position || [0, heightUnits / 2, 0];

  mesh.name = sceneObject.name || 'Tile';
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[0])),
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[1])),
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[2]))
  );
  mesh.scale.setScalar(getObjectUniformScale(sceneObject));

  return mesh;
}

function createExportLight(lightObject) {
  const light = new THREE.DirectionalLight(0xffffff, lightObject.intensity || 1.25);
  const position = lightObject.transform?.position || [0, 4, 3];

  light.name = lightObject.name || 'Luz';
  light.position.set(position[0], position[1], position[2]);
  light.lookAt(0, 0, 0);

  return light;
}

function createProjectExportScene() {
  const exportScene = new THREE.Scene();
  const root = new THREE.Group();

  root.name = state.activeProject?.name || 'Engine Flat';
  exportScene.add(root);

  getSceneObjects().forEach((sceneObject) => {
    if (!isObjectEffectivelyVisible(sceneObject)) {
      return;
    }

    if (sceneObject.type === 'tile') {
      root.add(createExportTileMesh(sceneObject));
      return;
    }

    if (sceneObject.type === 'directional-light') {
      root.add(createExportLight(sceneObject));
    }
  });

  return exportScene;
}

function exportSceneToGlb(exportScene) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();

    exporter.parse(
      exportScene,
      resolve,
      reject,
      {
        binary: true,
        onlyVisible: true,
        trs: false
      }
    );
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return window.btoa(binary);
}

async function exportActiveProjectGlb() {
  if (!state.activeProject) {
    showMessage('Abra ou crie um projeto antes de exportar.');
    return;
  }

  let exportScene = null;

  try {
    elements.editorExportButton.disabled = true;
    await ensureTilesetImagesLoaded();
    exportScene = createProjectExportScene();
    const glbBuffer = await exportSceneToGlb(exportScene);
    const fileName = `${sanitizeExportFileName(state.activeProject.name)}.glb`;
    const exportResult = await window.engineFlat.projects.exportGlb(state.activeProject.id, {
      fileName: state.activeProject.name,
      base64: arrayBufferToBase64(glbBuffer)
    });

    showMessage(`GLB exportado: ${exportResult.path || fileName}`);
  } catch (error) {
    showMessage(error.message || 'Não foi possível exportar o GLB.');
  } finally {
    elements.editorExportButton.disabled = false;
    if (exportScene) {
      disposeObjectTree(exportScene);
    }
  }
}

function handleMenuAction(action) {
  if (action === 'new-project') {
    openNewProjectModal();
  }

  if (action === 'open-project') {
    openProjectDialog();
  }

  if (action === 'save-project') {
    saveActiveProject();
  }

  if (action === 'about') {
    showMessage('Engine Flat MVP');
  }
}

function getCssColor(tokenName) {
  return getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
}

function createAxisLine(start, end, color) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...start),
    new THREE.Vector3(...end)
  ]);
  const material = new THREE.LineBasicMaterial({ color });

  return new THREE.Line(geometry, material);
}

const axisGizmoVectors = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 0, 1),
  z: new THREE.Vector3(0, 1, 0)
};

function createAxisSpriteTexture(label, color, options = {}) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const size = 128;
  const drawCircle = options.circle !== false;
  const drawLabel = options.label !== false && Boolean(label);

  canvas.width = size;
  canvas.height = size;
  context.clearRect(0, 0, size, size);

  if (drawCircle) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(size / 2, size / 2, 43, 0, Math.PI * 2);
    context.fill();
  }

  if (drawLabel) {
    context.fillStyle = options.textColor || '#0b0d10';
    context.font = `${options.fontWeight || 800} ${options.fontSize || 48}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, size / 2, (size / 2) + 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function createAxisSprite(label, color, options = {}) {
  const material = new THREE.SpriteMaterial({
    map: createAxisSpriteTexture(label, color, options),
    transparent: true,
    opacity: options.opacity ?? 1,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  const size = options.size || 0.46;

  sprite.scale.set(size, size, size);
  sprite.renderOrder = options.renderOrder || 4;
  sprite.userData.axisGizmoBaseSize = size;

  return sprite;
}

function createAxisGizmoAxis(axis, color, label) {
  const vector = axisGizmoVectors[axis].clone();
  const group = new THREE.Group();
  const positive = vector.clone().multiplyScalar(0.76);
  const negative = vector.clone().multiplyScalar(-0.76);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([negative, positive]),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      depthTest: false
    })
  );
  const positiveEndpoint = createAxisSprite(label, color, { size: 0.58, renderOrder: 5 });
  const negativeEndpoint = createAxisSprite('', color, { size: 0.58, opacity: 0.48, renderOrder: 2 });
  const negativeLabel = createAxisSprite(`-${label}`, color, {
    circle: false,
    textColor: '#ffffff',
    fontSize: 48,
    size: 0.58,
    opacity: 0,
    renderOrder: 6
  });

  line.renderOrder = 1;
  positiveEndpoint.position.copy(positive);
  negativeEndpoint.position.copy(negative);
  negativeLabel.position.copy(negative);
  positiveEndpoint.userData.axisGizmoTarget = { axis, sign: 1 };
  negativeEndpoint.userData.axisGizmoTarget = { axis, sign: -1 };
  negativeLabel.userData.axisGizmoTarget = { axis, sign: -1 };
  positiveEndpoint.userData.axisGizmoKind = 'positive';
  negativeEndpoint.userData.axisGizmoKind = 'negativeCircle';
  negativeLabel.userData.axisGizmoKind = 'negativeLabel';
  negativeEndpoint.userData.negativeAxisLabel = negativeLabel;
  viewport.axisGizmoTargets.push(positiveEndpoint, negativeEndpoint, negativeLabel);
  group.add(line, positiveEndpoint, negativeEndpoint, negativeLabel);

  return group;
}

function initAxisGizmo() {
  if (!elements.axisGizmoCanvas || viewport.axisGizmoRenderer) {
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.15, 1.15, 1.15, -1.15, 0.1, 10);
  const root = new THREE.Group();
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    canvas: elements.axisGizmoCanvas
  });
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.68, 48),
    new THREE.MeshBasicMaterial({
      color: getCssColor('--md-sys-color-surface-container-highest'),
      transparent: true,
      opacity: 0.34,
      depthTest: false
    })
  );

  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);
  renderer.setClearColor(0x000000, 0);
  disc.renderOrder = 0;
  root.add(disc);
  root.add(createAxisGizmoAxis('x', getCssColor('--viewport-axis-x'), 'X'));
  root.add(createAxisGizmoAxis('y', getCssColor('--viewport-axis-y'), 'Y'));
  root.add(createAxisGizmoAxis('z', getCssColor('--viewport-axis-z'), 'Z'));
  scene.add(root);

  viewport.axisGizmoRenderer = renderer;
  viewport.axisGizmoScene = scene;
  viewport.axisGizmoCamera = camera;
  viewport.axisGizmoRoot = root;
  resizeAxisGizmo();
}

function resizeAxisGizmo() {
  if (!viewport.axisGizmoRenderer || !elements.axisGizmo) {
    return;
  }

  const { clientWidth, clientHeight } = elements.axisGizmo;

  if (clientWidth === 0 || clientHeight === 0) {
    return;
  }

  viewport.axisGizmoRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  viewport.axisGizmoRenderer.setSize(clientWidth, clientHeight, false);
}

function updateAxisGizmo() {
  if (!viewport.camera) {
    return;
  }

  initAxisGizmo();

  if (!viewport.axisGizmoRoot || !viewport.axisGizmoRenderer || !viewport.axisGizmoScene || !viewport.axisGizmoCamera) {
    return;
  }

  viewport.axisGizmoRoot.quaternion.copy(viewport.camera.quaternion).invert();
  updateAxisGizmoDepth();
  viewport.axisGizmoRenderer.render(viewport.axisGizmoScene, viewport.axisGizmoCamera);
}

function updateAxisGizmoDepth() {
  if (!viewport.axisGizmoRoot) {
    return;
  }

  Object.entries(axisGizmoVectors).forEach(([axis, vector]) => {
    const localVector = vector.clone().applyQuaternion(viewport.axisGizmoRoot.quaternion);
    const positiveDepth = localVector.z;
    const negativeDepth = -localVector.z;

    viewport.axisGizmoTargets.forEach((target) => {
      const targetData = target.userData.axisGizmoTarget;

      if (!targetData || targetData.axis !== axis) {
        return;
      }

      const depth = targetData.sign > 0 ? positiveDepth : negativeDepth;
      const baseSize = target.userData.axisGizmoBaseSize || 0.58;
      const depthScale = 0.86 + (((depth + 1) / 2) * 0.3);
      const nextSize = baseSize * depthScale;
      target.scale.set(nextSize, nextSize, nextSize);

      if (targetData.sign < 0) {
        if (target.userData.axisGizmoKind === 'negativeCircle') {
          target.material.opacity = 0.34 + Math.max(0, negativeDepth) * 0.34;
          target.userData.negativeAxisLabel.material.opacity = negativeDepth > 0.18 ? 0.94 : 0;
          target.userData.negativeAxisLabel.scale.set(nextSize, nextSize, nextSize);
        } else if (target.userData.axisGizmoKind === 'negativeLabel') {
          target.material.opacity = negativeDepth > 0.18 ? 0.94 : 0;
        }
      }
    });
  });
}

function getAxisGizmoTargetFromEvent(event) {
  if (!viewport.axisGizmoRenderer || !viewport.axisGizmoCamera || viewport.axisGizmoTargets.length === 0) {
    return null;
  }

  const rect = elements.axisGizmo.getBoundingClientRect();
  viewport.axisGizmoPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  viewport.axisGizmoPointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  viewport.axisGizmoRaycaster.setFromCamera(viewport.axisGizmoPointer, viewport.axisGizmoCamera);

  const intersections = viewport.axisGizmoRaycaster
    .intersectObjects(viewport.axisGizmoTargets, false)
    .filter((intersection) => intersection.object.material?.opacity !== 0);

  return intersections[0]?.object?.userData.axisGizmoTarget || null;
}

function handleAxisGizmoClick(event) {
  const target = getAxisGizmoTargetFromEvent(event);

  if (!target) {
    return;
  }

  event.preventDefault();
  focusCameraOnAxis(target.axis, target.sign);
}

function handleAxisGizmoKeydown(event) {
  const keyMap = {
    x: ['x', 1],
    y: ['y', 1],
    z: ['z', 1],
    X: ['x', -1],
    Y: ['y', -1],
    Z: ['z', -1]
  };
  const target = keyMap[event.key];

  if (!target) {
    return;
  }

  event.preventDefault();
  focusCameraOnAxis(target[0], target[1]);
}

function getCameraUpForAxis(axis, sign) {
  if (axis === 'z') {
    return new THREE.Vector3(0, 0, sign > 0 ? -1 : 1);
  }

  return new THREE.Vector3(0, 1, 0);
}

function focusCameraOnAxis(axis, sign) {
  if (!viewport.camera || !viewport.controls || !axisGizmoVectors[axis]) {
    return;
  }

  const target = viewport.controls.target.clone();
  const distance = Math.max(4, viewport.camera.position.distanceTo(target));
  const direction = axisGizmoVectors[axis].clone().multiplyScalar(sign);

  viewport.camera.up.copy(getCameraUpForAxis(axis, sign));
  viewport.camera.position.copy(target).add(direction.multiplyScalar(distance));
  viewport.camera.lookAt(target);
  viewport.controls.target.copy(target);
  viewport.controls.update();
  updateAxisGizmo();
}

function createLightMarker(light, targetPosition, color) {
  const marker = new THREE.Group();
  marker.name = 'Luz';

  const lightColor = new THREE.Color(color);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 24, 16),
    new THREE.MeshBasicMaterial({ color: lightColor })
  );
  bulb.userData.objectId = 'scene-light';
  bulb.position.copy(light.position);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.012, 8, 36),
    new THREE.MeshBasicMaterial({ color: lightColor, transparent: true, opacity: 0.82 })
  );
  halo.userData.objectId = 'scene-light';
  halo.position.copy(light.position);
  halo.lookAt(targetPosition);

  const direction = targetPosition.clone().sub(light.position).normalize();
  const distance = light.position.distanceTo(targetPosition);
  const incidence = new THREE.ArrowHelper(direction, light.position, distance, lightColor, 0.42, 0.2);
  incidence.line.material.transparent = true;
  incidence.line.material.opacity = 0.42;
  incidence.cone.material.transparent = true;
  incidence.cone.material.opacity = 0.5;

  marker.add(bulb, halo, incidence);

  return marker;
}

function rotationOrZero(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function createTileMesh(sceneObject) {
  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  const widthUnits = (sceneObject.size?.widthPixels || tileSizePixels) / tileSizePixels;
  const depthUnits = (sceneObject.size?.depthPixels || tileSizePixels) / tileSizePixels;
  const heightPixels = sceneObject.size?.heightPixels || 1;
  const heightUnits = getTileHeightUnits(tileSizePixels, heightPixels);
  const geometry = createTileGeometry(widthUnits, heightUnits, depthUnits, sceneObject.rounding);
  const material = createTileRenderMaterial(sceneObject.material);
  const mesh = new THREE.Mesh(geometry, material);
  const position = sceneObject.transform?.position || [0, heightUnits / 2, 0];

  mesh.name = sceneObject.name;
  mesh.userData.objectId = sceneObject.id;
  mesh.userData.baseColor = getTileMaterialPreviewColor(sceneObject.material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[0])),
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[1])),
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[2]))
  );
  mesh.scale.setScalar(getObjectUniformScale(sceneObject));
  setTileMeshSelected(mesh, state.selectedObjectIds.has(sceneObject.id) || getSelectedGroup()?.objectIds.includes(sceneObject.id));

  return mesh;
}

function createTileSelectionOutline(tileGeometry) {
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(tileGeometry, 28),
    new THREE.LineBasicMaterial({
      color: getCssColor('--md-sys-color-primary'),
      transparent: true,
      opacity: 0.95,
      depthTest: false
    })
  );

  outline.name = 'tile-selection-outline';
  outline.renderOrder = 10;

  return outline;
}

function setTileMeshSelected(mesh, isSelected) {
  if (!mesh?.material) {
    return;
  }

  mesh.material.color.set(mesh.userData.baseColor || defaultTileColor);
  mesh.material.emissive.set(0x000000);
  mesh.material.emissiveIntensity = 0;

  const currentOutline = mesh.getObjectByName('tile-selection-outline');

  if (isSelected && !currentOutline) {
    mesh.add(createTileSelectionOutline(mesh.geometry));
  }

  if (!isSelected && currentOutline) {
    mesh.remove(currentOutline);
    currentOutline.geometry.dispose();
    currentOutline.material.dispose();
  }
}

function applyViewportSelectionState() {
  if (!viewport.initialized) {
    return;
  }

  const selectedGroup = getSelectedGroup();
  const selectedGroupObjectIds = new Set(selectedGroup?.objectIds || []);

  viewport.sceneObjectMeshes.forEach((mesh, objectId) => {
    setTileMeshSelected(mesh, state.selectedObjectIds.has(objectId) || selectedGroupObjectIds.has(objectId));
  });
}

function disposeMaterial(material) {
  const materials = Array.isArray(material) ? material : [material];

  materials.forEach((item) => {
    if (!item) {
      return;
    }

    if (item.map) {
      item.map.dispose();
    }

    item.dispose();
  });
}

function disposeObjectTree(object) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (child.material) {
      disposeMaterial(child.material);
    }
  });
}

function disposeTextureCache() {
  viewport.textureCache.forEach((texture) => texture.dispose());
  viewport.textureCache.clear();
  viewport.imageCache.clear();
}

function clearTransformHandles() {
  clearTransformHandleHover();

  if (!viewport.transformHandleGroup || !viewport.scene) {
    viewport.transformHandleTargets = [];
    return;
  }

  viewport.scene.remove(viewport.transformHandleGroup);
  disposeObjectTree(viewport.transformHandleGroup);
  viewport.transformHandleGroup = null;
  viewport.transformHandleTargets = [];
}

function getTransformAxisColor(axis) {
  if (axis === 'x') {
    return getCssColor('--viewport-axis-x');
  }

  if (axis === 'y') {
    return getCssColor('--viewport-axis-z');
  }

  return getCssColor('--viewport-axis-y');
}

function getTransformAxisDirection(axis, side = 1) {
  if (axis === 'x') {
    return new THREE.Vector3(side, 0, 0);
  }

  if (axis === 'y') {
    return new THREE.Vector3(0, side, 0);
  }

  return new THREE.Vector3(0, 0, side);
}

function getRoundingEdgeBasis(edge, bounds) {
  const origin = bounds.center.clone();
  const direction = new THREE.Vector3();

  edge.fixedAxes.forEach((fixed) => {
    origin[fixed.axis] += fixed.sign * bounds.half[fixed.axis];
    direction[fixed.axis] = fixed.sign;
  });

  return {
    origin,
    direction: direction.normalize()
  };
}

function getRoundingAxisColor(axis) {
  if (axis === 'x') {
    return getCssColor('--viewport-axis-x');
  }

  if (axis === 'y') {
    return getCssColor('--viewport-axis-y');
  }

  return getCssColor('--viewport-axis-z');
}

function getRoundingAxisEdgeIds(axis) {
  return roundingEdgeDefinitions
    .filter((edge) => edge.axis === axis)
    .map((edge) => edge.id);
}

function getRoundingAxisBasis(axis, bounds) {
  const direction = getTransformAxisDirection(axis, 1);
  const origin = bounds.center.clone().add(direction.clone().multiplyScalar(bounds.half[axis]));

  return { origin, direction };
}

function getRoundingAllBasis(bounds) {
  const direction = new THREE.Vector3(1, 1, 1).normalize();
  const origin = bounds.center.clone().add(new THREE.Vector3(bounds.half.x, bounds.half.y, bounds.half.z));

  return { origin, direction };
}

function getRoundingHandleBasis(handle, bounds) {
  if (handle.roundingMode === 'axis') {
    return getRoundingAxisBasis(handle.axis, bounds);
  }

  if (handle.roundingMode === 'all') {
    return getRoundingAllBasis(bounds);
  }

  const edge = handle.edge || roundingEdgeDefinitions.find((item) => item.id === handle.edgeId);
  return edge ? getRoundingEdgeBasis(edge, bounds) : null;
}

function getRoundingHandleColor(handle) {
  if (handle.roundingMode === 'all') {
    return getCssColor('--md-sys-color-on-surface');
  }

  return getRoundingAxisColor(handle.axis);
}

function getRoundingHandleDefinitions() {
  if (state.roundingControlMode === 'axis') {
    return ['x', 'y', 'z'].map((axis) => ({
      roundingHandleId: `axis:${axis}`,
      roundingMode: 'axis',
      axis,
      edgeIds: getRoundingAxisEdgeIds(axis)
    }));
  }

  if (state.roundingControlMode === 'all') {
    return [{
      roundingHandleId: 'all',
      roundingMode: 'all',
      edgeIds: [...roundingEdgeIds]
    }];
  }

  return roundingEdgeDefinitions.map((edge) => ({
    roundingHandleId: `edge:${edge.id}`,
    roundingMode: 'edge',
    axis: edge.axis,
    edge,
    edgeId: edge.id,
    edgeIds: [edge.id]
  }));
}

function setTransformHandleMaterialOpacity(object, opacity) {
  const materials = Array.isArray(object.material) ? object.material : [object.material];

  materials.forEach((material) => {
    if (!material) {
      return;
    }

    material.transparent = true;
    material.opacity = opacity;
    material.needsUpdate = true;
  });
}

function prepareTransformHandlePart(part, defaultOpacity, hoverOpacity, hoverScale = 1) {
  part.userData.transformHandleHover = {
    defaultOpacity,
    hoverOpacity,
    hoverScale,
    baseScale: part.scale.clone()
  };

  setTransformHandleMaterialOpacity(part, defaultOpacity);
}

function attachTransformHandleTarget(target, handleData, visualParts) {
  target.userData = {
    ...target.userData,
    ...handleData,
    transformHandleParts: visualParts
  };
  viewport.transformHandleTargets.push(target);
}

function setTransformHandleTargetHover(target, isHovered) {
  if (!target) {
    return;
  }

  const visualParts = target.userData.transformHandleParts || [target];

  visualParts.forEach((part) => {
    const hoverConfig = part.userData.transformHandleHover;

    if (!hoverConfig) {
      return;
    }

    setTransformHandleMaterialOpacity(
      part,
      isHovered ? hoverConfig.hoverOpacity : hoverConfig.defaultOpacity
    );
    part.scale.copy(hoverConfig.baseScale).multiplyScalar(isHovered ? hoverConfig.hoverScale : 1);
  });
}

function clearTransformHandleHover() {
  setTransformHandleTargetHover(viewport.hoveredTransformTarget, false);
  viewport.hoveredTransformTarget = null;

  if (elements.sceneViewport) {
    elements.sceneViewport.style.cursor = isTileEditingToolActive() ? 'crosshair' : '';
  }
}

function updateTransformHandleHover(event) {
  const nextTarget = getTransformHandleTarget(event);

  if (nextTarget === viewport.hoveredTransformTarget) {
    return;
  }

  setTransformHandleTargetHover(viewport.hoveredTransformTarget, false);
  viewport.hoveredTransformTarget = nextTarget;
  setTransformHandleTargetHover(viewport.hoveredTransformTarget, true);
  elements.sceneViewport.style.cursor = viewport.hoveredTransformTarget
    ? 'pointer'
    : isTileEditingToolActive() ? 'crosshair' : '';
}

function getSelectedTransformBounds(object) {
  const position = object.transform?.position || [0, 0, 0];

  if (object.type === 'tile') {
    const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
    const widthUnits = (object.size?.widthPixels || tileSizePixels) / tileSizePixels;
    const depthUnits = (object.size?.depthPixels || tileSizePixels) / tileSizePixels;
    const heightUnits = getTileHeightUnits(tileSizePixels, object.size?.heightPixels || 1);
    const scale = getObjectUniformScale(object);

    return {
      center: new THREE.Vector3(position[0], position[1], position[2]),
      half: new THREE.Vector3((widthUnits * scale) / 2, (heightUnits * scale) / 2, (depthUnits * scale) / 2),
      radius: Math.max(widthUnits * scale, depthUnits * scale, heightUnits * scale, 1) * 0.68
    };
  }

  return {
    center: new THREE.Vector3(position[0], position[1], position[2]),
    half: new THREE.Vector3(0.24, 0.24, 0.24),
    radius: 0.7
  };
}

function createResizeHandle(tile, axis, side, origin, direction) {
  const group = new THREE.Group();
  const color = getTransformAxisColor(axis);
  const handleData = {
    resizeHandle: {
      targetType: 'object',
      objectId: tile.id,
      axis,
      side
    }
  };
  const tipPosition = origin.clone().add(direction.clone().multiplyScalar(0.44));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([origin, tipPosition]),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.48,
      depthTest: false
    })
  );
  const gripSize = axis === 'x'
    ? [0.08, 0.22, 0.22]
    : axis === 'y'
      ? [0.22, 0.08, 0.22]
      : [0.22, 0.22, 0.08];
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(...gripSize),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
      depthTest: false
    })
  );
  const hitTarget = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.32, 0.32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.02,
      depthTest: false
    })
  );

  line.renderOrder = 20;
  grip.position.copy(tipPosition);
  grip.renderOrder = 21;
  hitTarget.position.copy(tipPosition);
  hitTarget.renderOrder = 20;

  const visualParts = [line, grip, hitTarget];
  prepareTransformHandlePart(line, 0.48, 1);
  prepareTransformHandlePart(grip, 0.82, 1, 1.18);
  prepareTransformHandlePart(hitTarget, 0.02, 0.2, 1.08);
  attachTransformHandleTarget(line, handleData, visualParts);
  attachTransformHandleTarget(grip, handleData, visualParts);
  attachTransformHandleTarget(hitTarget, handleData, visualParts);
  group.add(line, grip, hitTarget);

  return group;
}

function createMoveHandle(object, axis, side, origin) {
  const group = new THREE.Group();
  const color = getTransformAxisColor(axis);
  const direction = getTransformAxisDirection(axis, side);
  const handleData = {
    moveHandle: {
      targetType: Array.isArray(object.objectIds) ? 'group' : 'object',
      objectId: Array.isArray(object.objectIds) ? undefined : object.id,
      groupId: Array.isArray(object.objectIds) ? object.id : undefined,
      axis,
      side
    }
  };
  const arrow = new THREE.ArrowHelper(direction, origin, 0.78, color, 0.22, 0.1);
  arrow.cone.material.depthTest = false;
  arrow.line.material.depthTest = false;
  arrow.cone.renderOrder = 21;
  arrow.line.renderOrder = 20;

  const hitTarget = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 12),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
      depthTest: false
    })
  );
  hitTarget.position.copy(origin).add(direction.clone().multiplyScalar(0.78));
  hitTarget.renderOrder = 20;

  const visualParts = [arrow.line, arrow.cone, hitTarget];
  prepareTransformHandlePart(arrow.line, 0.68, 1);
  prepareTransformHandlePart(arrow.cone, 0.86, 1, 1.14);
  prepareTransformHandlePart(hitTarget, 0.2, 0.38, 1.18);
  attachTransformHandleTarget(arrow.line, handleData, visualParts);
  attachTransformHandleTarget(arrow.cone, handleData, visualParts);
  attachTransformHandleTarget(hitTarget, handleData, visualParts);

  group.add(arrow, hitTarget);

  return group;
}

function createRotateHandle(object, axis, center, radius) {
  const group = new THREE.Group();
  const color = getTransformAxisColor(axis);
  const handleData = {
    rotateHandle: {
      targetType: Array.isArray(object.objectIds) ? 'group' : 'object',
      objectId: Array.isArray(object.objectIds) ? undefined : object.id,
      groupId: Array.isArray(object.objectIds) ? object.id : undefined,
      axis
    }
  };
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.012, 8, 96),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      depthTest: false
    })
  );

  torus.position.copy(center);
  torus.renderOrder = 20;

  const hitTorus = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.08, 8, 96),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.01,
      depthTest: false
    })
  );

  hitTorus.position.copy(center);
  hitTorus.renderOrder = 19;

  if (axis === 'x') {
    torus.rotation.y = Math.PI / 2;
    hitTorus.rotation.y = Math.PI / 2;
  } else if (axis === 'y') {
    torus.rotation.x = Math.PI / 2;
    hitTorus.rotation.x = Math.PI / 2;
  }

  const visualParts = [torus, hitTorus];
  prepareTransformHandlePart(torus, 0.72, 1, 1.05);
  prepareTransformHandlePart(hitTorus, 0.01, 0.14, 1.05);
  attachTransformHandleTarget(torus, handleData, visualParts);
  attachTransformHandleTarget(hitTorus, handleData, visualParts);
  group.add(torus, hitTorus);

  return group;
}

function createGroupResizeHandle(groupObject, axis, side, origin) {
  const group = new THREE.Group();
  const color = getTransformAxisColor(axis);
  const direction = getTransformAxisDirection(axis, side);
  const handleData = {
    groupResizeHandle: {
      targetType: 'group',
      groupId: groupObject.id,
      axis,
      side
    }
  };
  const lineEnd = origin.clone().add(direction.clone().multiplyScalar(0.48));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([origin, lineEnd]),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.52,
      depthTest: false
    })
  );
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, 0.18),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.86,
      depthTest: false
    })
  );
  const hitTarget = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 16, 12),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.04,
      depthTest: false
    })
  );

  line.renderOrder = 20;
  grip.position.copy(lineEnd);
  grip.renderOrder = 21;
  hitTarget.position.copy(lineEnd);
  hitTarget.renderOrder = 20;

  const visualParts = [line, grip, hitTarget];
  prepareTransformHandlePart(line, 0.52, 1);
  prepareTransformHandlePart(grip, 0.86, 1, 1.16);
  prepareTransformHandlePart(hitTarget, 0.04, 0.22, 1.08);
  attachTransformHandleTarget(line, handleData, visualParts);
  attachTransformHandleTarget(grip, handleData, visualParts);
  attachTransformHandleTarget(hitTarget, handleData, visualParts);
  group.add(line, grip, hitTarget);

  return group;
}

function createRoundingHandle(tile, handleDefinition, bounds) {
  const group = new THREE.Group();
  const basis = getRoundingHandleBasis(handleDefinition, bounds);

  if (!basis) {
    return group;
  }

  const { origin, direction } = basis;
  const color = getRoundingHandleColor(handleDefinition);
  const handleData = {
    roundingHandle: {
      targetType: 'object',
      objectId: tile.id,
      roundingHandleId: handleDefinition.roundingHandleId,
      roundingMode: handleDefinition.roundingMode,
      axis: handleDefinition.axis,
      edgeId: handleDefinition.edgeId,
      edgeIds: handleDefinition.edgeIds
    }
  };
  const tipPosition = origin.clone().add(direction.clone().multiplyScalar(0.48));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([origin, tipPosition]),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.58,
      depthTest: false
    })
  );
  const grip = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 18, 14),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthTest: false
    })
  );
  const hitTarget = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 18, 14),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.04,
      depthTest: false
    })
  );

  line.renderOrder = 20;
  grip.position.copy(tipPosition);
  grip.renderOrder = 21;
  hitTarget.position.copy(tipPosition);
  hitTarget.renderOrder = 20;

  const visualParts = [line, grip, hitTarget];
  prepareTransformHandlePart(line, 0.58, 1);
  prepareTransformHandlePart(grip, 0.9, 1, 1.18);
  prepareTransformHandlePart(hitTarget, 0.04, 0.22, 1.1);
  attachTransformHandleTarget(line, handleData, visualParts);
  attachTransformHandleTarget(grip, handleData, visualParts);
  attachTransformHandleTarget(hitTarget, handleData, visualParts);
  group.add(line, grip, hitTarget);

  return group;
}

function renderTransformHandles() {
  clearTransformHandles();

  if (!viewport.scene) {
    return;
  }

  const selectedGroup = getSelectedGroup();
  const selectedObject = state.selectedObjectIds.size === 1 ? getSelectedObject() : null;
  const target = selectedGroup || selectedObject;
  const isGroupTarget = Boolean(selectedGroup);

  if (!target || state.viewportTool === 'select' || isTileEditingToolActive()) {
    return;
  }

  if (isGroupTarget) {
    if (!getGroupVisibility(selectedGroup) || getGroupLocked(selectedGroup) || getGroupObjects(selectedGroup).length === 0) {
      return;
    }
  } else if (!isObjectEffectivelyVisible(selectedObject) || isObjectEffectivelyLocked(selectedObject)) {
    return;
  }

  const bounds = isGroupTarget ? getGroupTransformBounds(selectedGroup) : getSelectedTransformBounds(selectedObject);
  const { center, half, radius } = bounds;
  const handleGroup = new THREE.Group();

  handleGroup.name = 'Transform Handles';

  if (state.viewportTool === 'move') {
    handleGroup.add(
      createMoveHandle(target, 'x', 1, new THREE.Vector3(center.x + half.x, center.y, center.z)),
      createMoveHandle(target, 'x', -1, new THREE.Vector3(center.x - half.x, center.y, center.z)),
      createMoveHandle(target, 'z', 1, new THREE.Vector3(center.x, center.y, center.z + half.z)),
      createMoveHandle(target, 'z', -1, new THREE.Vector3(center.x, center.y, center.z - half.z)),
      createMoveHandle(target, 'y', 1, new THREE.Vector3(center.x, center.y + half.y, center.z)),
      createMoveHandle(target, 'y', -1, new THREE.Vector3(center.x, center.y - half.y, center.z))
    );
  }

  if (state.viewportTool === 'rotate') {
    handleGroup.add(
      createRotateHandle(target, 'x', center, radius),
      createRotateHandle(target, 'y', center, radius * 1.08),
      createRotateHandle(target, 'z', center, radius * 1.16)
    );
  }

  if (state.viewportTool === 'scale' && selectedObject?.type === 'tile') {
    handleGroup.add(
      createResizeHandle(selectedObject, 'x', 1, new THREE.Vector3(center.x + half.x, center.y, center.z), new THREE.Vector3(1, 0, 0)),
      createResizeHandle(selectedObject, 'x', -1, new THREE.Vector3(center.x - half.x, center.y, center.z), new THREE.Vector3(-1, 0, 0)),
      createResizeHandle(selectedObject, 'z', 1, new THREE.Vector3(center.x, center.y, center.z + half.z), new THREE.Vector3(0, 0, 1)),
      createResizeHandle(selectedObject, 'z', -1, new THREE.Vector3(center.x, center.y, center.z - half.z), new THREE.Vector3(0, 0, -1)),
      createResizeHandle(selectedObject, 'y', 1, new THREE.Vector3(center.x, center.y + half.y, center.z), new THREE.Vector3(0, 1, 0)),
      createResizeHandle(selectedObject, 'y', -1, new THREE.Vector3(center.x, center.y - half.y, center.z), new THREE.Vector3(0, -1, 0))
    );
  }

  if (state.viewportTool === 'scale' && isGroupTarget) {
    handleGroup.add(
      createGroupResizeHandle(selectedGroup, 'x', 1, new THREE.Vector3(center.x + half.x, center.y, center.z)),
      createGroupResizeHandle(selectedGroup, 'x', -1, new THREE.Vector3(center.x - half.x, center.y, center.z)),
      createGroupResizeHandle(selectedGroup, 'z', 1, new THREE.Vector3(center.x, center.y, center.z + half.z)),
      createGroupResizeHandle(selectedGroup, 'z', -1, new THREE.Vector3(center.x, center.y, center.z - half.z)),
      createGroupResizeHandle(selectedGroup, 'y', 1, new THREE.Vector3(center.x, center.y + half.y, center.z)),
      createGroupResizeHandle(selectedGroup, 'y', -1, new THREE.Vector3(center.x, center.y - half.y, center.z))
    );
  }

  if (state.viewportTool === 'round' && !isGroupTarget && selectedObject?.type === 'tile') {
    getRoundingHandleDefinitions().forEach((handleDefinition) => {
      handleGroup.add(createRoundingHandle(selectedObject, handleDefinition, bounds));
    });
  }

  if (handleGroup.children.length === 0) {
    return;
  }

  viewport.transformHandleGroup = handleGroup;
  viewport.scene.add(handleGroup);
}

function getTileHeightUnits(tileSizePixels, heightPixels = 1) {
  return Math.max(tileVisualHeightUnits, heightPixels / tileSizePixels);
}

function syncProjectSceneToViewport() {
  if (!viewport.initialized || !viewport.objectGroup || !state.activeProject) {
    return;
  }

  const lightObject = getSceneObjects().find((object) => object.type === 'directional-light');
  if (lightObject && isObjectEffectivelyVisible(lightObject) && viewport.sceneLight) {
    const position = lightObject.transform?.position || [0, 4, 3];
    viewport.sceneLight.position.set(position[0], position[1], position[2]);
    viewport.sceneLight.intensity = lightObject.intensity || 1.25;

    if (viewport.lightMarker) {
      viewport.scene.remove(viewport.lightMarker);
    }

    viewport.lightMarker = createLightMarker(
      viewport.sceneLight,
      viewport.sceneLight.target.position,
      getCssColor('--md-sys-color-tertiary')
    );
    viewport.scene.add(viewport.lightMarker);
  } else if (viewport.sceneLight) {
    viewport.sceneLight.intensity = 0;

    if (viewport.lightMarker) {
      viewport.scene.remove(viewport.lightMarker);
      viewport.lightMarker = null;
    }
  }

  disposeObjectTree(viewport.objectGroup);
  viewport.objectGroup.clear();
  viewport.sceneObjectMeshes.clear();

  getSceneObjects()
    .filter((object) => object.type === 'tile' && isObjectEffectivelyVisible(object))
    .forEach((object) => {
      const mesh = createTileMesh(object);
      viewport.objectGroup.add(mesh);
      viewport.sceneObjectMeshes.set(object.id, mesh);
    });
  applyViewportSelectionState();
  renderTransformHandles();
}

function moveSelectedLight(action) {
  const selectedObject = getSelectedObject();

  if (!selectedObject || selectedObject.type !== 'directional-light' || isObjectEffectivelyLocked(selectedObject)) {
    return;
  }

  const position = [...(selectedObject.transform?.position || [0, 4, 3])];
  const angleStep = Math.PI / 12;
  const heightStep = 0.5;
  const distanceStep = 0.5;
  let radius = Math.hypot(position[0], position[2]) || 3;
  let angle = Math.atan2(position[2], position[0]);

  if (action === 'orbit-left') {
    angle -= angleStep;
  }

  if (action === 'orbit-right') {
    angle += angleStep;
  }

  if (action === 'height-up') {
    position[1] += heightStep;
  }

  if (action === 'height-down') {
    position[1] = Math.max(0.5, position[1] - heightStep);
  }

  if (action === 'distance-in') {
    radius = Math.max(1, radius - distanceStep);
  }

  if (action === 'distance-out') {
    radius += distanceStep;
  }

  position[0] = Number((Math.cos(angle) * radius).toFixed(3));
  position[2] = Number((Math.sin(angle) * radius).toFixed(3));
  selectedObject.transform.position = position;
  syncProjectSceneToViewport();
  renderPropertiesPanel();
  markEditorDirty();
}

function isTileEditingToolActive() {
  return state.activeTool === 'tile' || state.activeTool === 'bucket';
}

function renderViewportToolButtons() {
  const buttons = {
    select: elements.viewportSelectToolButton,
    move: elements.viewportMoveToolButton,
    rotate: elements.viewportRotateToolButton,
    scale: elements.viewportScaleToolButton,
    round: elements.viewportRoundToolButton
  };

  Object.entries(buttons).forEach(([tool, button]) => {
    if (!button) {
      return;
    }

    const isActive = state.viewportTool === tool;
    button.classList.toggle('tool-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  renderRoundingModeControls();
}

function getRoundingControlModeLabel(mode = state.roundingControlMode) {
  if (mode === 'axis') {
    return 'por eixo';
  }

  if (mode === 'all') {
    return 'todas as bordas';
  }

  return '12 bordas';
}

function renderRoundingModeControls() {
  const modeLabel = getRoundingControlModeLabel();

  elements.viewportRoundToolButton.setAttribute('aria-label', `Arredondar bordas (${modeLabel})`);
  elements.viewportRoundToolButton.setAttribute('title', `Arredondar bordas - ${modeLabel}`);

  elements.viewportRoundModeButtons.forEach((button) => {
    const isActive = button.dataset.roundingMode === state.roundingControlMode;
    button.classList.toggle('rounding-mode-active', isActive);
    button.setAttribute('aria-checked', String(isActive));
  });
}

function openRoundingModeMenu() {
  window.clearTimeout(roundingModeMenuCloseTimer);
  elements.viewportRoundToolItem.classList.add('rounding-menu-open');
  elements.viewportRoundToolButton.setAttribute('aria-expanded', 'true');
}

function closeRoundingModeMenu() {
  window.clearTimeout(roundingModeMenuCloseTimer);
  elements.viewportRoundToolItem.classList.remove('rounding-menu-open');
  elements.viewportRoundToolButton.setAttribute('aria-expanded', 'false');
}

function scheduleRoundingModeMenuClose() {
  window.clearTimeout(roundingModeMenuCloseTimer);
  roundingModeMenuCloseTimer = window.setTimeout(closeRoundingModeMenu, 120);
}

function activateRoundingControlMode(mode) {
  if (!roundingControlModes.has(mode)) {
    return;
  }

  state.roundingControlMode = mode;
  setViewportTool('round');
}

function setViewportTool(tool) {
  state.viewportTool = tool;

  if (isTileEditingToolActive()) {
    state.activeTool = 'select';
    viewportInteraction.isPaintingTiles = false;
    viewportInteraction.lastPaintTargetKey = null;
    elements.addTileButton.classList.remove('tool-active');
    elements.addTileButton.setAttribute('aria-pressed', 'false');
    elements.stampToolButton.classList.remove('tool-active');
    elements.stampToolButton.setAttribute('aria-pressed', 'false');
    elements.bucketToolButton.classList.remove('tool-active');
    elements.bucketToolButton.setAttribute('aria-pressed', 'false');
    elements.sceneViewport.style.cursor = '';
    clearBucketPreview();
    configureViewportControlsForTool();
  }

  renderViewportToolButtons();
  renderTransformHandles();
}

function configureViewportControlsForTool() {
  if (!viewport.controls) {
    return;
  }

  viewport.controls.enabled = true;

  if (isTileEditingToolActive()) {
    viewport.controls.mouseButtons.LEFT = null;
    viewport.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    viewport.controls.mouseButtons.RIGHT = null;
    return;
  }

  viewport.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  viewport.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
  viewport.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
}

function setActiveTool(tool) {
  state.activeTool = state.activeTool === tool ? 'select' : tool;

  if (isTileEditingToolActive()) {
    state.viewportTool = 'select';
  }

  viewportInteraction.isPaintingTiles = false;
  viewportInteraction.lastPaintTargetKey = null;
  elements.addTileButton.classList.toggle('tool-active', state.activeTool === 'tile');
  elements.addTileButton.setAttribute('aria-pressed', String(state.activeTool === 'tile'));
  elements.stampToolButton.classList.toggle('tool-active', state.activeTool === 'tile');
  elements.stampToolButton.setAttribute('aria-pressed', String(state.activeTool === 'tile'));
  elements.bucketToolButton.classList.toggle('tool-active', state.activeTool === 'bucket');
  elements.bucketToolButton.setAttribute('aria-pressed', String(state.activeTool === 'bucket'));
  elements.sceneViewport.style.cursor = state.activeTool === 'tile' || state.activeTool === 'bucket' ? 'crosshair' : '';

  if (state.activeTool !== 'bucket') {
    clearBucketPreview();
  }

  configureViewportControlsForTool();
  renderViewportToolButtons();
  renderTransformHandles();
}

function getTileAtCell(cellX, cellZ) {
  return getSceneObjects().find((object) => object.type === 'tile'
    && object.gridPosition?.[0] === cellX
    && object.gridPosition?.[1] === cellZ) || null;
}

function createTileObject(cellX, cellZ, name, material = getActiveTileMaterial()) {
  const tileSizePixels = state.activeProject.grid.tileSizePixels;
  const heightUnits = getTileHeightUnits(tileSizePixels, 1);

  return {
    id: `tile-${Date.now()}-${cellX}-${cellZ}`,
    name,
    type: 'tile',
    gridPosition: [cellX, cellZ],
    transform: {
      position: [cellX + 0.5, heightUnits / 2, cellZ + 0.5],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    },
    size: {
      widthPixels: tileSizePixels,
      depthPixels: tileSizePixels,
      heightPixels: 1
    },
    material: cloneTileMaterial(material),
    rounding: setAllRoundingEdges(0),
    visible: true,
    locked: false,
    moveSnap: true,
    rotateSnap: true,
    resizeSnap: true
  };
}

function paintTileAtCell(cellX, cellZ) {
  if (!state.activeProject) {
    showMessage('Abra ou crie um projeto antes de pintar um tile.');
    return;
  }

  const existingTile = getTileAtCell(cellX, cellZ);

  if (existingTile) {
    setSelectedObjects([existingTile.id], existingTile.id);
    renderObjectTree();
    renderPropertiesPanel();
    return;
  }

  const tileCount = getSceneObjects().filter((object) => object.type === 'tile').length + 1;
  const tileObject = createTileObject(cellX, cellZ, `Tile ${tileCount}`, getActiveTileMaterial());

  state.activeProject.scene.objects.push(tileObject);
  setSelectedObjects([tileObject.id], tileObject.id);
  syncProjectSceneToViewport();
  renderObjectTree();
  renderPropertiesPanel();
  markEditorDirty();
}

function paintExistingTile(tile) {
  if (!state.activeProject || !tile || tile.type !== 'tile' || isObjectEffectivelyLocked(tile)) {
    return false;
  }

  const material = getActiveTileMaterial();

  if (getTileMaterialKey(tile.material) === getTileMaterialKey(material)) {
    setSelectedObjects([tile.id], tile.id);
    renderObjectTree();
    renderPropertiesPanel();
    return true;
  }

  tile.material = cloneTileMaterial(material);
  setSelectedObjects([tile.id], tile.id);
  syncProjectSceneToViewport();
  renderObjectTree();
  renderPropertiesPanel();
  markEditorDirty();
  return true;
}

function removeTileAtCell(cellX, cellZ) {
  if (!state.activeProject) {
    showMessage('Abra ou crie um projeto antes de remover um tile.');
    return;
  }

  const tileObject = getTileAtCell(cellX, cellZ);

  if (!tileObject) {
    return;
  }

  removeTileObject(tileObject);
}

function removeTileObject(tileObject) {
  if (!state.activeProject || !tileObject) {
    return;
  }

  if (isObjectEffectivelyLocked(tileObject)) {
    showMessage('Tile bloqueado não pode ser removido.');
    return;
  }

  state.activeProject.scene.objects = getSceneObjects()
    .filter((object) => object.id !== tileObject.id);
  state.activeProject.scene.groups = getSceneGroups()
    .map((group) => ({
      ...group,
      objectIds: group.objectIds.filter((objectId) => objectId !== tileObject.id)
    }))
    .filter((group) => group.objectIds.length > 0);

  if (state.selectedObjectIds.has(tileObject.id)) {
    setSelectedObjects([]);
  }

  syncProjectSceneToViewport();
  renderObjectTree();
  renderPropertiesPanel();
  markEditorDirty();
}

function getBucketCellBounds() {
  return {
    minX: -gridHalfCellCount,
    maxX: gridHalfCellCount - 1,
    minZ: -gridHalfCellCount,
    maxZ: gridHalfCellCount - 1
  };
}

function isCellInsideBounds(cellX, cellZ, bounds) {
  return cellX >= bounds.minX && cellX <= bounds.maxX && cellZ >= bounds.minZ && cellZ <= bounds.maxZ;
}

function getBucketTargetKey(cellX, cellZ) {
  const tile = getTileAtCell(cellX, cellZ);
  return tile ? `tile:${getTileMaterialKey(tile.material)}` : 'empty';
}

function getCellKeyFromCoordinates(cellX, cellZ) {
  return `${cellX}:${cellZ}`;
}

function computeBucketFillCells(cellX, cellZ) {
  const bounds = getBucketCellBounds();

  if (!isCellInsideBounds(cellX, cellZ, bounds)) {
    return [];
  }

  const targetKey = getBucketTargetKey(cellX, cellZ);
  const queue = [{ cellX, cellZ }];
  const visited = new Set();
  const cells = [];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = getCellKeyFromCoordinates(current.cellX, current.cellZ);

    if (visited.has(currentKey) || !isCellInsideBounds(current.cellX, current.cellZ, bounds)) {
      continue;
    }

    visited.add(currentKey);

    if (getBucketTargetKey(current.cellX, current.cellZ) !== targetKey) {
      continue;
    }

    cells.push(current);
    queue.push(
      { cellX: current.cellX + 1, cellZ: current.cellZ },
      { cellX: current.cellX - 1, cellZ: current.cellZ },
      { cellX: current.cellX, cellZ: current.cellZ + 1 },
      { cellX: current.cellX, cellZ: current.cellZ - 1 }
    );
  }

  return cells;
}

function clearBucketPreview() {
  if (!viewport.bucketPreviewGroup || !viewport.scene) {
    return;
  }

  viewport.scene.remove(viewport.bucketPreviewGroup);
  viewport.bucketPreviewGroup.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (child.material) {
      child.material.dispose();
    }
  });
  viewport.bucketPreviewGroup = null;
}

function renderBucketPreview(cells) {
  clearBucketPreview();

  if (!viewport.scene || cells.length === 0) {
    return;
  }

  const group = new THREE.Group();
  const previewMaterial = getActiveTileMaterial();
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: getTileMaterialPreviewColor(previewMaterial),
    transparent: true,
    opacity: 0.24,
    depthWrite: false
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: getCssColor('--md-sys-color-primary'),
    transparent: true,
    opacity: 0.9,
    depthTest: false
  });

  cells.forEach((cell) => {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fillMaterial.clone());
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(cell.cellX + 0.5, 0.045, cell.cellZ + 0.5);
    plane.renderOrder = 12;
    group.add(plane);

    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), edgeMaterial.clone());
    outline.rotation.x = -Math.PI / 2;
    outline.position.set(cell.cellX + 0.5, 0.05, cell.cellZ + 0.5);
    outline.renderOrder = 13;
    group.add(outline);
  });

  fillMaterial.dispose();
  edgeMaterial.dispose();

  viewport.bucketPreviewGroup = group;
  viewport.scene.add(group);
}

function previewBucketFillAtCell(cellX, cellZ) {
  renderBucketPreview(computeBucketFillCells(cellX, cellZ));
}

function applyBucketFillAtCell(cellX, cellZ) {
  if (!state.activeProject) {
    showMessage('Abra ou crie um projeto antes de preencher tiles.');
    return;
  }

  const targetKey = getBucketTargetKey(cellX, cellZ);
  const cells = computeBucketFillCells(cellX, cellZ);

  if (cells.length === 0) {
    return;
  }

  const affectedIds = [];
  let nextTileNumber = getSceneObjects().filter((object) => object.type === 'tile').length + 1;

  if (targetKey === 'empty') {
    cells.forEach((cell) => {
      if (getTileAtCell(cell.cellX, cell.cellZ)) {
        return;
      }

      const tile = createTileObject(cell.cellX, cell.cellZ, `Tile ${nextTileNumber}`, getActiveTileMaterial());
      nextTileNumber += 1;
      state.activeProject.scene.objects.push(tile);
      affectedIds.push(tile.id);
    });
  } else {
    cells.forEach((cell) => {
      const tile = getTileAtCell(cell.cellX, cell.cellZ);

      if (!tile) {
        return;
      }

      tile.material = cloneTileMaterial(getActiveTileMaterial());
      affectedIds.push(tile.id);
    });
  }

  if (affectedIds.length > 0) {
    setSelectedObjects([affectedIds[affectedIds.length - 1]], affectedIds[affectedIds.length - 1]);
  }

  clearBucketPreview();
  syncProjectSceneToViewport();
  renderObjectTree();
  renderPropertiesPanel();
  markEditorDirty();
  showMessage(`${affectedIds.length} ${affectedIds.length === 1 ? 'tile preenchido' : 'tiles preenchidos'}.`);
}

function activateTilePaintTool() {
  if (!state.activeProject) {
    showMessage('Abra ou crie um projeto antes de pintar tiles.');
    return;
  }

  setActiveTool('tile');
  showMessage(state.activeTool === 'tile'
    ? `Clique em um quadrado da grade para pintar um tile de ${state.activeProject.grid.tileSizePixels} x ${state.activeProject.grid.tileSizePixels} px.`
    : 'Ferramenta Tile desativada.');
}

function activateBucketFillTool() {
  if (!state.activeProject) {
    showMessage('Abra ou crie um projeto antes de preencher tiles.');
    return;
  }

  setActiveTool('bucket');
  showMessage(state.activeTool === 'bucket'
    ? 'Balde ativado. Passe o mouse para ver a area e clique para preencher.'
    : 'Balde desativado.');
}

function getViewportCellFromPointerEvent(event) {
  const rect = elements.sceneViewport.getBoundingClientRect();
  viewportInteraction.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  viewportInteraction.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  viewportInteraction.raycaster.setFromCamera(viewportInteraction.pointer, viewport.camera);

  const intersection = viewportInteraction.raycaster.ray.intersectPlane(
    viewportInteraction.groundPlane,
    viewportInteraction.groundPoint
  );

  if (!intersection) {
    return null;
  }

  return {
    cellX: Math.floor(intersection.x),
    cellZ: Math.floor(intersection.z)
  };
}

function updateViewportRayFromPointerEvent(event) {
  const rect = elements.sceneViewport.getBoundingClientRect();
  viewportInteraction.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  viewportInteraction.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  viewportInteraction.raycaster.setFromCamera(viewportInteraction.pointer, viewport.camera);
}

function getTransformHandleTarget(event) {
  if (!viewport.transformHandleTargets.length) {
    return null;
  }

  updateViewportRayFromPointerEvent(event);
  const intersections = viewportInteraction.raycaster.intersectObjects(viewport.transformHandleTargets, false);
  return intersections[0]?.object || null;
}

function getTransformHandleIntersection(event) {
  const target = getTransformHandleTarget(event);
  const userData = target?.userData || {};
  const handle = userData.resizeHandle
    || userData.groupResizeHandle
    || userData.moveHandle
    || userData.rotateHandle
    || userData.roundingHandle
    || null;

  return handle
    ? {
      ...handle,
      target
    }
    : null;
}

function getViewportObjectIntersection(event) {
  const tileMeshes = [...viewport.sceneObjectMeshes.values()];
  const lightMeshes = [];

  if (viewport.lightMarker) {
    viewport.lightMarker.traverse((child) => {
      if (child.isMesh && child.userData?.objectId) {
        lightMeshes.push(child);
      }
    });
  }

  if (tileMeshes.length === 0 && lightMeshes.length === 0) {
    return null;
  }

  updateViewportRayFromPointerEvent(event);
  const intersections = [
    ...viewportInteraction.raycaster.intersectObjects(tileMeshes, false),
    ...viewportInteraction.raycaster.intersectObjects(lightMeshes, false)
  ].sort((first, second) => first.distance - second.distance);

  for (const intersection of intersections) {
    const objectId = intersection.object.userData?.objectId;
    const object = objectId ? getObjectById(objectId) : null;

    if (object) {
      return {
        object,
        point: intersection.point
      };
    }
  }

  return null;
}

function getTileMeshIntersection(event) {
  const intersection = getViewportObjectIntersection(event);

  if (!intersection || intersection.object.type !== 'tile') {
    return null;
  }

  return {
    tile: intersection.object,
    point: intersection.point
  };
}

function selectObjectFromViewport(object) {
  setSelectedObjects([object.id], object.id);
  renderObjectTree();
  renderPropertiesPanel();
}

function getGroundPointFromPointerEvent(event) {
  updateViewportRayFromPointerEvent(event);
  return viewportInteraction.raycaster.ray.intersectPlane(
    viewportInteraction.groundPlane,
    viewportInteraction.groundPoint
  )?.clone() || null;
}

function getResizeStepUnits(tile, tileSizePixels) {
  return tile.resizeSnap !== false ? 0.25 : 1 / tileSizePixels;
}

function snapResizeUnits(value, tile, tileSizePixels, minimumUnits) {
  const step = getResizeStepUnits(tile, tileSizePixels);
  const minUnits = Number.isFinite(minimumUnits) ? minimumUnits : step;

  if (value <= minUnits) {
    return minUnits;
  }

  return Math.max(minUnits, Math.round(value / step) * step);
}

function getTileHeightPixelsFromUnits(heightUnits, tileSizePixels) {
  const minimumHeightUnits = getTileHeightUnits(tileSizePixels, 1);

  if (heightUnits <= minimumHeightUnits + Number.EPSILON) {
    return 1;
  }

  return Math.max(1, Math.round(heightUnits * tileSizePixels));
}

function getMoveStepUnits(object) {
  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;

  if (object.moveSnap === false) {
    return object.type === 'tile' ? 1 / tileSizePixels : 0.01;
  }

  return 0.25;
}

function snapMoveDeltaUnits(value, object) {
  const step = getMoveStepUnits(object);
  return Math.round(value / step) * step;
}

function getRotationStepDegrees(object) {
  return object.rotateSnap !== false ? 45 : 0.1;
}

function snapRotationDegrees(value, object) {
  const step = getRotationStepDegrees(object);
  return Math.round(value / step) * step;
}

function snapGroupScale(value, group) {
  const step = group.moveSnap === false ? 0.01 : 0.05;
  return Math.round(value / step) * step;
}

function getResizedFaceCenter(startCenter, startUnits, nextUnits, side) {
  const fixedFace = side > 0
    ? startCenter - (startUnits / 2)
    : startCenter + (startUnits / 2);

  return side > 0
    ? fixedFace + (nextUnits / 2)
    : fixedFace - (nextUnits / 2);
}

function updateTileGridPositionFromTransform(object) {
  if (object.type !== 'tile') {
    return;
  }

  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  const widthUnits = (object.size?.widthPixels || tileSizePixels) / tileSizePixels;
  const depthUnits = (object.size?.depthPixels || tileSizePixels) / tileSizePixels;
  const position = object.transform?.position || [0, 0, 0];
  object.gridPosition = [
    Math.round(position[0] - (widthUnits / 2)),
    Math.round(position[2] - (depthUnits / 2))
  ];
}

function getObjectPositionVector(object) {
  const position = object.transform?.position || [0, 0, 0];
  return new THREE.Vector3(position[0], position[1], position[2]);
}

function setObjectPositionFromVector(object, position) {
  object.transform = {
    ...object.transform,
    position: [
      Number(position.x.toFixed(3)),
      Number(position.y.toFixed(3)),
      Number(position.z.toFixed(3))
    ],
    rotation: object.transform?.rotation || [0, 0, 0],
    scale: object.transform?.scale || [1, 1, 1]
  };
  updateTileGridPositionFromTransform(object);
}

function getAxisVectorByIndex(axisIndex) {
  if (axisIndex === 0) {
    return new THREE.Vector3(1, 0, 0);
  }

  if (axisIndex === 1) {
    return new THREE.Vector3(0, 1, 0);
  }

  return new THREE.Vector3(0, 0, 1);
}

function getTransformAxisIndex(axis) {
  return axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
}

function cloneGroupObjectTransforms(group) {
  return getGroupObjects(group).map((object) => ({
    id: object.id,
    position: getObjectPositionVector(object),
    rotation: [...(object.transform?.rotation || [0, 0, 0])],
    scale: [...(object.transform?.scale || [1, 1, 1])],
    size: object.size ? { ...object.size } : null
  }));
}

function moveGroupByDelta(group, delta) {
  const deltaVector = new THREE.Vector3(delta[0], delta[1], delta[2]);

  getGroupObjects(group).forEach((object) => {
    setObjectPositionFromVector(object, getObjectPositionVector(object).add(deltaVector));
  });

  const bounds = getGroupTransformBounds(group);
  group.transform = {
    ...group.transform,
    position: [
      Number(bounds.center.x.toFixed(3)),
      Number(bounds.center.y.toFixed(3)),
      Number(bounds.center.z.toFixed(3))
    ]
  };
}

function applyGroupMoveFromStart(group, startObjects, delta) {
  const deltaVector = new THREE.Vector3(delta[0], delta[1], delta[2]);

  startObjects.forEach((startObject) => {
    const object = getObjectById(startObject.id);

    if (!object) {
      return;
    }

    setObjectPositionFromVector(object, startObject.position.clone().add(deltaVector));
  });

  const bounds = getGroupTransformBounds(group);
  group.transform = {
    ...group.transform,
    position: [
      Number(bounds.center.x.toFixed(3)),
      Number(bounds.center.y.toFixed(3)),
      Number(bounds.center.z.toFixed(3))
    ]
  };
}

function rotateGroupByDelta(group, axisIndex, deltaDegrees, center) {
  const radians = THREE.MathUtils.degToRad(deltaDegrees);
  const axis = getAxisVectorByIndex(axisIndex);

  getGroupObjects(group).forEach((object) => {
    const nextPosition = getObjectPositionVector(object).sub(center).applyAxisAngle(axis, radians).add(center);
    const rotation = [...(object.transform?.rotation || [0, 0, 0])];
    rotation[axisIndex] = Number((rotationOrZero(rotation[axisIndex]) + deltaDegrees).toFixed(3));
    setObjectPositionFromVector(object, nextPosition);
    object.transform.rotation = rotation;
  });

  const bounds = getGroupTransformBounds(group);
  group.transform = {
    ...group.transform,
    position: [
      Number(bounds.center.x.toFixed(3)),
      Number(bounds.center.y.toFixed(3)),
      Number(bounds.center.z.toFixed(3))
    ]
  };
}

function applyGroupRotationFromStart(group, startObjects, center, axisIndex, deltaDegrees) {
  const radians = THREE.MathUtils.degToRad(deltaDegrees);
  const axis = getAxisVectorByIndex(axisIndex);

  startObjects.forEach((startObject) => {
    const object = getObjectById(startObject.id);

    if (!object) {
      return;
    }

    const nextPosition = startObject.position.clone().sub(center).applyAxisAngle(axis, radians).add(center);
    const rotation = [...startObject.rotation];
    rotation[axisIndex] = Number((rotationOrZero(rotation[axisIndex]) + deltaDegrees).toFixed(3));
    setObjectPositionFromVector(object, nextPosition);
    object.transform.rotation = rotation;
  });

  getGroupTransformBounds(group);
}

function scaleGroupTo(group, nextScale, center) {
  const currentScale = getGroupScale(group);
  const scaleFactor = nextScale / currentScale;

  getGroupObjects(group).forEach((object) => {
    const nextPosition = getObjectPositionVector(object).sub(center).multiplyScalar(scaleFactor).add(center);
    const objectScale = object.transform?.scale || [1, 1, 1];
    const nextObjectScale = objectScale.map((value) => Math.max(0.01, Number(value || 1) * scaleFactor));
    setObjectPositionFromVector(object, nextPosition);
    object.transform.scale = nextObjectScale;
  });

  group.transform = {
    ...group.transform,
    scale: [nextScale, nextScale, nextScale]
  };
  getGroupTransformBounds(group);
}

function applyGroupScaleFromStart(group, startObjects, center, nextScale, startScale) {
  const scaleFactor = nextScale / startScale;

  startObjects.forEach((startObject) => {
    const object = getObjectById(startObject.id);

    if (!object) {
      return;
    }

    const nextPosition = startObject.position.clone().sub(center).multiplyScalar(scaleFactor).add(center);
    const nextObjectScale = startObject.scale.map((value) => Math.max(0.01, Number(value || 1) * scaleFactor));
    setObjectPositionFromVector(object, nextPosition);
    object.transform.scale = nextObjectScale;
  });

  group.transform = {
    ...group.transform,
    scale: [nextScale, nextScale, nextScale]
  };
  getGroupTransformBounds(group);
}

function getGroupResizeStepUnits(group) {
  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  return group.resizeSnap === false ? 1 / tileSizePixels : 0.25;
}

function snapGroupResizeUnits(value, group, minimumUnits) {
  const step = getGroupResizeStepUnits(group);
  const minUnits = Number.isFinite(minimumUnits) ? minimumUnits : step;

  if (value <= minUnits) {
    return minUnits;
  }

  return Math.max(minUnits, Math.round(value / step) * step);
}

function getGroupResizeMinimumUnits(axis) {
  if (axis === 'y') {
    const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
    return getTileHeightUnits(tileSizePixels, 1);
  }

  return 1;
}

function getGroupResizePointerDelta(event, drag) {
  if (drag.axis === 'x' || drag.axis === 'z') {
    const currentGroundPoint = getGroundPointFromPointerEvent(event);

    if (!currentGroundPoint || !drag.startGroundPoint) {
      return null;
    }

    return drag.axis === 'x'
      ? currentGroundPoint.x - drag.startGroundPoint.x
      : currentGroundPoint.z - drag.startGroundPoint.z;
  }

  return (drag.startClientY - event.clientY) / 80;
}

function resizeTileAxisFromStart(object, startObject, axis, factor, fixedFace) {
  if (!startObject.size) {
    return;
  }

  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  const nextSize = { ...startObject.size };

  if (axis === 'x') {
    const startWidthUnits = (startObject.size.widthPixels || tileSizePixels) / tileSizePixels;
    nextSize.widthPixels = Math.max(tileSizePixels, Math.round(startWidthUnits * factor * tileSizePixels));
  }

  if (axis === 'z') {
    const startDepthUnits = (startObject.size.depthPixels || tileSizePixels) / tileSizePixels;
    nextSize.depthPixels = Math.max(tileSizePixels, Math.round(startDepthUnits * factor * tileSizePixels));
  }

  if (axis === 'y') {
    const startHeightUnits = getTileHeightUnits(tileSizePixels, startObject.size.heightPixels || 1);
    nextSize.heightPixels = getTileHeightPixelsFromUnits(startHeightUnits * factor, tileSizePixels);
  }

  object.size = nextSize;

  const nextPosition = startObject.position.clone();
  nextPosition[axis] = fixedFace + ((startObject.position[axis] - fixedFace) * factor);
  setObjectPositionFromVector(object, nextPosition);
}

function applyGroupResizeFromStart(group, startObjects, axis, side, startCenter, startUnits, nextUnits) {
  const factor = nextUnits / startUnits;
  const fixedFace = side > 0
    ? startCenter[axis] - (startUnits / 2)
    : startCenter[axis] + (startUnits / 2);

  startObjects.forEach((startObject) => {
    const object = getObjectById(startObject.id);

    if (!object) {
      return;
    }

    if (object.type === 'tile') {
      resizeTileAxisFromStart(object, startObject, axis, factor, fixedFace);
      return;
    }

    const nextPosition = startObject.position.clone();
    nextPosition[axis] = fixedFace + ((startObject.position[axis] - fixedFace) * factor);
    setObjectPositionFromVector(object, nextPosition);
  });

  const bounds = getGroupTransformBounds(group);
  group.transform = {
    ...group.transform,
    position: [
      Number(bounds.center.x.toFixed(3)),
      Number(bounds.center.y.toFixed(3)),
      Number(bounds.center.z.toFixed(3))
    ]
  };
}

function beginObjectMove(event, handle) {
  if (handle.targetType === 'group') {
    const group = getGroupById(handle.groupId);

    if (!group || getGroupLocked(group)) {
      return false;
    }

    viewportInteraction.moveDrag = {
      ...handle,
      startClientY: event.clientY,
      startGroundPoint: getGroundPointFromPointerEvent(event),
      startObjects: cloneGroupObjectTransforms(group)
    };

    if (viewport.controls) {
      viewport.controls.enabled = false;
    }

    elements.sceneViewport.setPointerCapture(event.pointerId);
    return true;
  }

  const object = getObjectById(handle.objectId);

  if (!object || isObjectEffectivelyLocked(object)) {
    return false;
  }

  viewportInteraction.moveDrag = {
    ...handle,
    startClientY: event.clientY,
    startGroundPoint: getGroundPointFromPointerEvent(event),
    startPosition: [...(object.transform?.position || [0, 0, 0])]
  };

  if (viewport.controls) {
    viewport.controls.enabled = false;
  }

  elements.sceneViewport.setPointerCapture(event.pointerId);
  return true;
}

function updateObjectMove(event) {
  const drag = viewportInteraction.moveDrag;

  if (!drag) {
    return;
  }

  if (drag.targetType === 'group') {
    const group = getGroupById(drag.groupId);

    if (!group || getGroupLocked(group)) {
      return;
    }

    const delta = [0, 0, 0];

    if (drag.axis === 'x' || drag.axis === 'z') {
      const currentGroundPoint = getGroundPointFromPointerEvent(event);

      if (!currentGroundPoint || !drag.startGroundPoint) {
        return;
      }

      const pointerDelta = drag.axis === 'x'
        ? currentGroundPoint.x - drag.startGroundPoint.x
        : currentGroundPoint.z - drag.startGroundPoint.z;
      const nextDelta = snapMoveDeltaUnits(pointerDelta, group);
      delta[drag.axis === 'x' ? 0 : 2] = nextDelta;
    }

    if (drag.axis === 'y') {
      const pointerDelta = (drag.startClientY - event.clientY) / 80;
      delta[1] = snapMoveDeltaUnits(pointerDelta, group);
    }

    applyGroupMoveFromStart(group, drag.startObjects, delta);
    syncProjectSceneToViewport();
    renderPropertiesPanel();
    markEditorDirty();
    return;
  }

  const object = getObjectById(drag.objectId);

  if (!object || isObjectEffectivelyLocked(object)) {
    return;
  }

  const position = [...drag.startPosition];

  if (drag.axis === 'x' || drag.axis === 'z') {
    const currentGroundPoint = getGroundPointFromPointerEvent(event);

    if (!currentGroundPoint || !drag.startGroundPoint) {
      return;
    }

    const pointerDelta = drag.axis === 'x'
      ? currentGroundPoint.x - drag.startGroundPoint.x
      : currentGroundPoint.z - drag.startGroundPoint.z;
    const nextDelta = snapMoveDeltaUnits(pointerDelta, object);
    const index = drag.axis === 'x' ? 0 : 2;
    position[index] = drag.startPosition[index] + nextDelta;
  }

  if (drag.axis === 'y') {
    const pointerDelta = (drag.startClientY - event.clientY) / 80;
    position[1] = drag.startPosition[1] + snapMoveDeltaUnits(pointerDelta, object);
  }

  object.transform = {
    ...object.transform,
    position
  };
  updateTileGridPositionFromTransform(object);
  syncProjectSceneToViewport();
  renderPropertiesPanel();
  markEditorDirty();
}

function endObjectMove(event) {
  if (!viewportInteraction.moveDrag) {
    return;
  }

  viewportInteraction.moveDrag = null;

  if (elements.sceneViewport.hasPointerCapture(event.pointerId)) {
    elements.sceneViewport.releasePointerCapture(event.pointerId);
  }

  if (viewport.controls) {
    configureViewportControlsForTool();
  }
}

function beginObjectRotate(event, handle) {
  if (handle.targetType === 'group') {
    const group = getGroupById(handle.groupId);

    if (!group || getGroupLocked(group)) {
      return false;
    }

    viewportInteraction.rotateDrag = {
      ...handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCenter: getGroupTransformBounds(group).center.clone(),
      startObjects: cloneGroupObjectTransforms(group),
      startRotation: [...(group.transform?.rotation || [0, 0, 0])]
    };

    if (viewport.controls) {
      viewport.controls.enabled = false;
    }

    elements.sceneViewport.setPointerCapture(event.pointerId);
    return true;
  }

  const object = getObjectById(handle.objectId);

  if (!object || isObjectEffectivelyLocked(object)) {
    return false;
  }

  viewportInteraction.rotateDrag = {
    ...handle,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startRotation: [...(object.transform?.rotation || [0, 0, 0])]
  };

  if (viewport.controls) {
    viewport.controls.enabled = false;
  }

  elements.sceneViewport.setPointerCapture(event.pointerId);
  return true;
}

function updateObjectRotate(event) {
  const drag = viewportInteraction.rotateDrag;

  if (!drag) {
    return;
  }

  if (drag.targetType === 'group') {
    const group = getGroupById(drag.groupId);

    if (!group || getGroupLocked(group)) {
      return;
    }

    const axisIndex = drag.axis === 'x' ? 0 : drag.axis === 'y' ? 1 : 2;
    const pointerDelta = (event.clientX - drag.startClientX) + (drag.startClientY - event.clientY);
    const nextRotation = rotationOrZero(drag.startRotation[axisIndex]) + (pointerDelta * 0.5);
    const snappedRotation = Number(snapRotationDegrees(nextRotation, group).toFixed(3));
    const rotation = [...drag.startRotation];
    rotation[axisIndex] = snappedRotation;
    group.transform = {
      ...group.transform,
      rotation
    };
    applyGroupRotationFromStart(
      group,
      drag.startObjects,
      drag.startCenter,
      axisIndex,
      snappedRotation - rotationOrZero(drag.startRotation[axisIndex])
    );
    syncProjectSceneToViewport();
    renderPropertiesPanel();
    markEditorDirty();
    return;
  }

  const object = getObjectById(drag.objectId);

  if (!object || isObjectEffectivelyLocked(object)) {
    return;
  }

  const axisIndex = drag.axis === 'x' ? 0 : drag.axis === 'y' ? 1 : 2;
  const pointerDelta = (event.clientX - drag.startClientX) + (drag.startClientY - event.clientY);
  const rotation = [...drag.startRotation];
  const nextRotation = rotationOrZero(drag.startRotation[axisIndex]) + (pointerDelta * 0.5);
  rotation[axisIndex] = Number(snapRotationDegrees(nextRotation, object).toFixed(3));
  object.transform = {
    ...object.transform,
    rotation
  };

  syncProjectSceneToViewport();
  renderPropertiesPanel();
  markEditorDirty();
}

function endObjectRotate(event) {
  if (!viewportInteraction.rotateDrag) {
    return;
  }

  viewportInteraction.rotateDrag = null;

  if (elements.sceneViewport.hasPointerCapture(event.pointerId)) {
    elements.sceneViewport.releasePointerCapture(event.pointerId);
  }

  if (viewport.controls) {
    configureViewportControlsForTool();
  }
}

function projectWorldToViewportPoint(worldPoint) {
  const rect = elements.sceneViewport.getBoundingClientRect();
  const projected = worldPoint.clone().project(viewport.camera);

  return new THREE.Vector2(
    ((projected.x + 1) / 2) * rect.width,
    ((1 - projected.y) / 2) * rect.height
  );
}

function beginRoundingDrag(event, handle) {
  const object = getObjectById(handle.objectId);
  const edgeIds = Array.isArray(handle.edgeIds)
    ? handle.edgeIds.filter((edgeId) => roundingEdgeIds.includes(edgeId))
    : [handle.edgeId].filter((edgeId) => roundingEdgeIds.includes(edgeId));

  if (!object || object.type !== 'tile' || edgeIds.length === 0 || isObjectEffectivelyLocked(object)) {
    return false;
  }

  const bounds = getSelectedTransformBounds(object);
  const basis = getRoundingHandleBasis(handle, bounds);

  if (!basis) {
    return false;
  }

  const { origin, direction } = basis;
  const originScreen = projectWorldToViewportPoint(origin);
  const tipScreen = projectWorldToViewportPoint(origin.clone().add(direction));
  const screenDirection = tipScreen.clone().sub(originScreen);

  if (screenDirection.lengthSq() < 0.0001) {
    screenDirection.set(0, -1);
  } else {
    screenDirection.normalize();
  }

  viewportInteraction.roundDrag = {
    ...handle,
    edgeIds,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startValue: getRoundingEdgesAveragePercent(object.rounding, edgeIds),
    screenDirection
  };

  if (viewport.controls) {
    viewport.controls.enabled = false;
  }

  elements.sceneViewport.setPointerCapture(event.pointerId);
  return true;
}

function updateRoundingDrag(event) {
  const drag = viewportInteraction.roundDrag;

  if (!drag) {
    return;
  }

  const object = getObjectById(drag.objectId);

  if (!object || object.type !== 'tile' || isObjectEffectivelyLocked(object)) {
    return;
  }

  const delta = new THREE.Vector2(
    event.clientX - drag.startClientX,
    event.clientY - drag.startClientY
  );
  const nextValue = drag.startValue + (delta.dot(drag.screenDirection) * 0.45);

  object.rounding = setRoundingEdgeValues(object.rounding, drag.edgeIds, nextValue);
  syncProjectSceneToViewport();
  renderPropertiesPanel();
  markEditorDirty();
}

function endRoundingDrag(event) {
  if (!viewportInteraction.roundDrag) {
    return;
  }

  viewportInteraction.roundDrag = null;

  if (elements.sceneViewport.hasPointerCapture(event.pointerId)) {
    elements.sceneViewport.releasePointerCapture(event.pointerId);
  }

  if (viewport.controls) {
    configureViewportControlsForTool();
  }
}

function beginGroupResize(event, handle) {
  const group = getGroupById(handle.groupId);

  if (!group || getGroupLocked(group)) {
    return false;
  }

  const bounds = getGroupTransformBounds(group);

  viewportInteraction.groupResizeDrag = {
    ...handle,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startGroundPoint: getGroundPointFromPointerEvent(event),
    startCenter: bounds.center.clone(),
    startUnits: Math.max(bounds.half[handle.axis] * 2, getGroupResizeMinimumUnits(handle.axis)),
    startObjects: cloneGroupObjectTransforms(group),
  };

  if (viewport.controls) {
    viewport.controls.enabled = false;
  }

  elements.sceneViewport.setPointerCapture(event.pointerId);
  return true;
}

function updateGroupResize(event) {
  const drag = viewportInteraction.groupResizeDrag;

  if (!drag) {
    return;
  }

  const group = getGroupById(drag.groupId);

  if (!group || getGroupLocked(group)) {
    return;
  }

  const pointerDelta = getGroupResizePointerDelta(event, drag);

  if (pointerDelta === null) {
    return;
  }

  const minimumUnits = getGroupResizeMinimumUnits(drag.axis);
  const nextUnits = snapGroupResizeUnits(drag.startUnits + (pointerDelta * drag.side), group, minimumUnits);

  applyGroupResizeFromStart(group, drag.startObjects, drag.axis, drag.side, drag.startCenter, drag.startUnits, nextUnits);
  syncProjectSceneToViewport();
  renderPropertiesPanel();
  markEditorDirty();
}

function endGroupResize(event) {
  if (!viewportInteraction.groupResizeDrag) {
    return;
  }

  viewportInteraction.groupResizeDrag = null;

  if (elements.sceneViewport.hasPointerCapture(event.pointerId)) {
    elements.sceneViewport.releasePointerCapture(event.pointerId);
  }

  if (viewport.controls) {
    configureViewportControlsForTool();
  }
}

function clearViewportSelection() {
  setSelectedObjects([]);
  renderObjectTree();
  renderPropertiesPanel();
}

function beginViewportObjectSelection(event) {
  const intersection = getViewportObjectIntersection(event);
  const objectId = intersection?.object?.id || null;

  if (!objectId) {
    clearViewportSelection();
  }

  viewportInteraction.selectionClick = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    objectId,
    moved: false
  };
}

function updateViewportObjectSelection(event) {
  const selectionClick = viewportInteraction.selectionClick;

  if (!selectionClick || selectionClick.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - selectionClick.startClientX;
  const deltaY = event.clientY - selectionClick.startClientY;

  if (Math.hypot(deltaX, deltaY) > viewportClickMoveTolerance) {
    selectionClick.moved = true;
  }
}

function endViewportObjectSelection(event) {
  const selectionClick = viewportInteraction.selectionClick;

  if (!selectionClick || selectionClick.pointerId !== event.pointerId) {
    return false;
  }

  viewportInteraction.selectionClick = null;

  if (selectionClick.moved) {
    return false;
  }

  if (selectionClick.objectId) {
    const object = getObjectById(selectionClick.objectId);

    if (object) {
      selectObjectFromViewport(object);
      return true;
    }
  }

  clearViewportSelection();
  return true;
}

function beginTileResize(event, handle) {
  const tile = getObjectById(handle.objectId);

  if (!tile || tile.type !== 'tile' || isObjectEffectivelyLocked(tile)) {
    return false;
  }

  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  const position = tile.transform?.position || [0, 0, 0];
  const startGroundPoint = getGroundPointFromPointerEvent(event);

  viewportInteraction.resizeDrag = {
    ...handle,
    startClientY: event.clientY,
    startGroundPoint,
    startPosition: [...position],
    startWidthUnits: (tile.size?.widthPixels || tileSizePixels) / tileSizePixels,
    startDepthUnits: (tile.size?.depthPixels || tileSizePixels) / tileSizePixels,
    startHeightUnits: getTileHeightUnits(tileSizePixels, tile.size?.heightPixels || 1)
  };

  if (viewport.controls) {
    viewport.controls.enabled = false;
  }

  elements.sceneViewport.setPointerCapture(event.pointerId);
  return true;
}

function updateTileResize(event) {
  const drag = viewportInteraction.resizeDrag;

  if (!drag) {
    return;
  }

  const tile = getObjectById(drag.objectId);

  if (!tile || isObjectEffectivelyLocked(tile)) {
    return;
  }

  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  const position = [...drag.startPosition];

  if (drag.axis === 'x' || drag.axis === 'z') {
    const currentGroundPoint = getGroundPointFromPointerEvent(event);

    if (!currentGroundPoint || !drag.startGroundPoint) {
      return;
    }

    const pointerDelta = drag.axis === 'x'
      ? currentGroundPoint.x - drag.startGroundPoint.x
      : currentGroundPoint.z - drag.startGroundPoint.z;
    const startUnits = drag.axis === 'x' ? drag.startWidthUnits : drag.startDepthUnits;
    const nextUnits = snapResizeUnits(startUnits + (pointerDelta * drag.side), tile, tileSizePixels, 1);

    if (drag.axis === 'x') {
      tile.size.widthPixels = Math.max(tileSizePixels, Math.round(nextUnits * tileSizePixels));
      position[0] = getResizedFaceCenter(drag.startPosition[0], drag.startWidthUnits, nextUnits, drag.side);
    } else {
      tile.size.depthPixels = Math.max(tileSizePixels, Math.round(nextUnits * tileSizePixels));
      position[2] = getResizedFaceCenter(drag.startPosition[2], drag.startDepthUnits, nextUnits, drag.side);
    }
  }

  if (drag.axis === 'y') {
    const screenDeltaUnits = ((drag.startClientY - event.clientY) * drag.side) / 80;
    const minimumHeightUnits = getTileHeightUnits(tileSizePixels, 1);
    const nextHeightUnits = snapResizeUnits(drag.startHeightUnits + screenDeltaUnits, tile, tileSizePixels, minimumHeightUnits);
    tile.size.heightPixels = getTileHeightPixelsFromUnits(nextHeightUnits, tileSizePixels);
    position[1] = getResizedFaceCenter(drag.startPosition[1], drag.startHeightUnits, nextHeightUnits, drag.side);
  }

  tile.transform.position = position;
  updateTileGridPositionFromTransform(tile);
  syncProjectSceneToViewport();
  renderPropertiesPanel();
  markEditorDirty();
}

function endTileResize(event) {
  if (!viewportInteraction.resizeDrag) {
    return;
  }

  viewportInteraction.resizeDrag = null;

  if (elements.sceneViewport.hasPointerCapture(event.pointerId)) {
    elements.sceneViewport.releasePointerCapture(event.pointerId);
  }

  if (viewport.controls) {
    configureViewportControlsForTool();
  }
}

function getCellKey(cell) {
  return `${cell.cellX}:${cell.cellZ}`;
}

function paintTileFromPointerEvent(event) {
  const tileIntersection = getTileMeshIntersection(event);

  if (tileIntersection) {
    const targetKey = `tile:${tileIntersection.tile.id}`;

    if (viewportInteraction.lastPaintTargetKey === targetKey) {
      return;
    }

    viewportInteraction.lastPaintTargetKey = targetKey;
    paintExistingTile(tileIntersection.tile);
    return;
  }

  const cell = getViewportCellFromPointerEvent(event);

  if (!cell) {
    return;
  }

  const targetKey = `cell:${getCellKey(cell)}`;

  if (viewportInteraction.lastPaintTargetKey === targetKey) {
    return;
  }

  viewportInteraction.lastPaintTargetKey = targetKey;
  paintTileAtCell(cell.cellX, cell.cellZ);
}

function handleViewportPointerDown(event) {
  const transformHandle = event.button === 0 ? getTransformHandleIntersection(event) : null;

  if (transformHandle) {
    event.preventDefault();
    viewportInteraction.selectionClick = null;

    if (transformHandle.targetType === 'group' && transformHandle.side !== undefined && transformHandle.axis && state.viewportTool === 'scale') {
      beginGroupResize(event, transformHandle);
      return;
    }

    if (transformHandle.roundingHandleId && state.viewportTool === 'round') {
      beginRoundingDrag(event, transformHandle);
      return;
    }

    if (transformHandle.side !== undefined && transformHandle.axis && state.viewportTool === 'scale') {
      beginTileResize(event, transformHandle);
      return;
    }

    if (transformHandle.side !== undefined && transformHandle.axis && state.viewportTool === 'move') {
      beginObjectMove(event, transformHandle);
      return;
    }

    if (transformHandle.axis && state.viewportTool === 'rotate') {
      beginObjectRotate(event, transformHandle);
      return;
    }

    return;
  }

  if ((state.activeTool !== 'tile' && state.activeTool !== 'bucket') || !viewport.initialized) {
    if (viewport.initialized && event.button === 0) {
      beginViewportObjectSelection(event);
    }

    return;
  }

  if (event.button === 1) {
    event.preventDefault();
    return;
  }

  if (event.button !== 0 && event.button !== 2) {
    return;
  }

  event.preventDefault();

  if (state.activeTool === 'bucket') {
    if (event.button !== 0) {
      return;
    }

    const cell = getViewportCellFromPointerEvent(event);

    if (cell) {
      applyBucketFillAtCell(cell.cellX, cell.cellZ);
    }

    return;
  }

  const tileIntersection = getTileMeshIntersection(event);

  if (event.button === 2) {
    if (tileIntersection) {
      removeTileObject(tileIntersection.tile);
      return;
    }

    const cell = getViewportCellFromPointerEvent(event);
    if (!cell) {
      return;
    }

    removeTileAtCell(cell.cellX, cell.cellZ);
    return;
  }

  if (tileIntersection) {
    viewportInteraction.isPaintingTiles = true;
    viewportInteraction.lastPaintTargetKey = null;
    elements.sceneViewport.setPointerCapture(event.pointerId);
    paintTileFromPointerEvent(event);
    return;
  }

  viewportInteraction.isPaintingTiles = true;
  viewportInteraction.lastPaintTargetKey = null;
  elements.sceneViewport.setPointerCapture(event.pointerId);
  paintTileFromPointerEvent(event);
}

function handleViewportPointerMove(event) {
  if (viewportInteraction.roundDrag) {
    event.preventDefault();
    updateRoundingDrag(event);
    return;
  }

  if (viewportInteraction.groupResizeDrag) {
    event.preventDefault();
    updateGroupResize(event);
    return;
  }

  if (viewportInteraction.resizeDrag) {
    event.preventDefault();
    updateTileResize(event);
    return;
  }

  if (viewportInteraction.moveDrag) {
    event.preventDefault();
    updateObjectMove(event);
    return;
  }

  if (viewportInteraction.rotateDrag) {
    event.preventDefault();
    updateObjectRotate(event);
    return;
  }

  updateTransformHandleHover(event);
  updateViewportObjectSelection(event);

  if (state.activeTool === 'bucket') {
    const cell = getViewportCellFromPointerEvent(event);

    if (cell) {
      previewBucketFillAtCell(cell.cellX, cell.cellZ);
    }

    return;
  }

  if (state.activeTool !== 'tile' || !viewportInteraction.isPaintingTiles) {
    return;
  }

  event.preventDefault();
  paintTileFromPointerEvent(event);
}

function handleViewportPointerUp(event) {
  if (viewportInteraction.roundDrag) {
    endRoundingDrag(event);
    return;
  }

  if (viewportInteraction.groupResizeDrag) {
    endGroupResize(event);
    return;
  }

  if (viewportInteraction.resizeDrag) {
    endTileResize(event);
    return;
  }

  if (viewportInteraction.moveDrag) {
    endObjectMove(event);
    return;
  }

  if (viewportInteraction.rotateDrag) {
    endObjectRotate(event);
    return;
  }

  if (viewportInteraction.selectionClick) {
    endViewportObjectSelection(event);
    return;
  }

  if (!viewportInteraction.isPaintingTiles) {
    return;
  }

  viewportInteraction.isPaintingTiles = false;
  viewportInteraction.lastPaintTargetKey = null;

  if (elements.sceneViewport.hasPointerCapture(event.pointerId)) {
    elements.sceneViewport.releasePointerCapture(event.pointerId);
  }
}

function handleViewportPointerLeave() {
  if (viewportInteraction.resizeDrag || viewportInteraction.moveDrag || viewportInteraction.rotateDrag || viewportInteraction.groupResizeDrag || viewportInteraction.roundDrag) {
    return;
  }

  clearTransformHandleHover();
  viewportInteraction.selectionClick = null;
  viewportInteraction.isPaintingTiles = false;
  viewportInteraction.lastPaintTargetKey = null;
  clearBucketPreview();
}

function handleViewportContextMenu(event) {
  if (state.activeTool === 'tile' || state.activeTool === 'bucket') {
    event.preventDefault();
  }
}

function isEditorModalOpen() {
  return !elements.newProjectModal.hidden
    || !elements.renameProjectModal.hidden
    || !elements.deleteProjectModal.hidden
    || !elements.deleteTilesetModal.hidden;
}

function isEditableEventTarget(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

function shouldIgnoreViewportKeyboardPan(event) {
  if (isEditorModalOpen()) {
    return true;
  }

  return isEditableEventTarget(event.target);
}

function shouldIgnoreEditorHistoryShortcut(event) {
  if (isEditorModalOpen()) {
    return true;
  }

  return isEditableEventTarget(event.target);
}

function handleEditorHistoryShortcut(event) {
  if (
    event.defaultPrevented
    || state.view !== 'editor'
    || !state.activeProject
    || (!event.ctrlKey && !event.metaKey)
    || event.altKey
    || shouldIgnoreEditorHistoryShortcut(event)
  ) {
    return false;
  }

  const key = event.key.toLowerCase();

  if (key === 'z' && event.shiftKey) {
    event.preventDefault();
    redoEditorAction();
    return true;
  }

  if (key === 'z') {
    event.preventDefault();
    undoEditorAction();
    return true;
  }

  if (key === 'y') {
    event.preventDefault();
    redoEditorAction();
    return true;
  }

  return false;
}

function handleEditorDeleteShortcut(event) {
  if (
    event.defaultPrevented
    || state.view !== 'editor'
    || !state.activeProject
    || event.key !== 'Delete'
    || event.ctrlKey
    || event.metaKey
    || event.altKey
    || isEditorModalOpen()
    || isEditableEventTarget(event.target)
    || (state.selectedObjectIds.size === 0 && !state.selectedGroupId)
  ) {
    return false;
  }

  event.preventDefault();
  closeOutlinerContextMenu();
  deleteSelectedSceneItems();
  return true;
}

function getViewportKeyboardPanBasis() {
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().setFromMatrixColumn(viewport.camera.matrixWorld, 0).projectOnPlane(worldUp);
  const up = new THREE.Vector3().setFromMatrixColumn(viewport.camera.matrixWorld, 1).projectOnPlane(worldUp);
  const forward = new THREE.Vector3();

  viewport.camera.getWorldDirection(forward);
  forward.projectOnPlane(worldUp);

  if (up.lengthSq() < 0.0001) {
    up.copy(forward);
  }

  if (right.lengthSq() < 0.0001) {
    right.crossVectors(up, worldUp);
  }

  if (up.lengthSq() < 0.0001) {
    up.set(0, 0, -1);
  }

  if (right.lengthSq() < 0.0001) {
    right.set(1, 0, 0);
  }

  return {
    right: right.normalize(),
    up: up.normalize()
  };
}

function panViewportWithKeyboard(key) {
  if (!viewport.camera || !viewport.controls) {
    return false;
  }

  viewport.camera.updateMatrixWorld();

  const { right, up } = getViewportKeyboardPanBasis();
  const direction = new THREE.Vector3();

  if (key === 'w') {
    direction.copy(up);
  } else if (key === 's') {
    direction.copy(up).multiplyScalar(-1);
  } else if (key === 'a') {
    direction.copy(right).multiplyScalar(-1);
  } else if (key === 'd') {
    direction.copy(right);
  } else {
    return false;
  }

  const distance = viewport.camera.position.distanceTo(viewport.controls.target);
  const amount = Math.min(1.5, Math.max(0.08, distance * 0.055));
  const delta = direction.multiplyScalar(amount);

  viewport.camera.position.add(delta);
  viewport.controls.target.add(delta);
  viewport.controls.update();
  updateAxisGizmo();
  return true;
}

function handleViewportKeyboardPan(event) {
  if (
    event.defaultPrevented
    || state.view !== 'editor'
    || !isTileEditingToolActive()
    || !viewport.initialized
    || event.ctrlKey
    || event.metaKey
    || event.altKey
    || shouldIgnoreViewportKeyboardPan(event)
  ) {
    return false;
  }

  const key = event.key.toLowerCase();

  if (!['w', 'a', 's', 'd'].includes(key)) {
    return false;
  }

  if (!panViewportWithKeyboard(key)) {
    return false;
  }

  event.preventDefault();
  return true;
}

function initViewport() {
  if (viewport.initialized || !elements.sceneViewport) {
    return;
  }

  const canvas = elements.sceneViewport;
  const scene = new THREE.Scene();
  const objectGroup = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas
  });

  scene.background = new THREE.Color(getCssColor('--md-sys-color-surface-container-high'));
  scene.add(objectGroup);
  camera.position.set(7, 5, 7);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.target.set(0, 0, 0);
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;

  const grid = new THREE.GridHelper(20, 20, 0x5d6068, 0x3f424a);
  grid.material.transparent = true;
  grid.material.opacity = 0.72;
  scene.add(grid);

  scene.add(createAxisLine([-10, 0.01, 0], [10, 0.01, 0], getCssColor('--viewport-axis-x')));
  scene.add(createAxisLine([0, 0, -10], [0, 0, 10], getCssColor('--viewport-axis-y')));
  scene.add(createAxisLine([0, 0, 0], [0, 6, 0], getCssColor('--viewport-axis-z')));

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
  const sceneLight = new THREE.DirectionalLight(0xffffff, 1.25);
  sceneLight.name = 'Luz';
  sceneLight.position.set(0, 4, 3);
  sceneLight.target.position.set(0, 0, 0);
  scene.add(ambientLight, sceneLight, sceneLight.target);

  viewport.initialized = true;
  viewport.renderer = renderer;
  viewport.scene = scene;
  viewport.camera = camera;
  viewport.controls = controls;
  viewport.objectGroup = objectGroup;
  viewport.sceneLight = sceneLight;
  configureViewportControlsForTool();
  canvas.addEventListener('pointerdown', handleViewportPointerDown);
  canvas.addEventListener('pointermove', handleViewportPointerMove);
  canvas.addEventListener('pointerup', handleViewportPointerUp);
  canvas.addEventListener('pointercancel', handleViewportPointerUp);
  canvas.addEventListener('pointerleave', handleViewportPointerLeave);
  canvas.addEventListener('contextmenu', handleViewportContextMenu);

  const renderFrame = () => {
    viewport.animationId = window.requestAnimationFrame(renderFrame);
    controls.update();
    updateAxisGizmo();
    renderer.render(scene, camera);
  };

  resizeViewport();
  syncProjectSceneToViewport();
  updateAxisGizmo();
  renderFrame();
}

function resizeViewport() {
  if (!viewport.initialized) {
    return;
  }

  const { clientWidth, clientHeight } = elements.sceneViewport;
  if (clientWidth === 0 || clientHeight === 0) {
    return;
  }

  viewport.camera.aspect = clientWidth / clientHeight;
  viewport.camera.updateProjectionMatrix();
  viewport.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  viewport.renderer.setSize(clientWidth, clientHeight, false);
  resizeAxisGizmo();
}

function setSidebarCollapsed(side, isCollapsed) {
  const className = side === 'left' ? 'left-panels-collapsed' : 'right-panels-collapsed';
  elements.editorView.classList.toggle(className, isCollapsed);
  updatePanelToolButtons();
  window.requestAnimationFrame(resizeViewport);
}

function isSidebarCollapsed(side) {
  const className = side === 'left' ? 'left-panels-collapsed' : 'right-panels-collapsed';
  return elements.editorView.classList.contains(className);
}

function updatePanelToolButton(button, isCollapsed, labels) {
  const label = isCollapsed ? labels.show : labels.hide;
  const isVisible = !isCollapsed;

  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.setAttribute('aria-pressed', String(isVisible));
  button.classList.toggle('panel-visible', isVisible);
}

function updatePanelToolButtons() {
  updatePanelToolButton(elements.collapseLeftPanelsButton, isSidebarCollapsed('left'), {
    hide: 'Minimizar propriedades',
    show: 'Mostrar propriedades'
  });
  updatePanelToolButton(elements.collapseRightPanelsButton, isSidebarCollapsed('right'), {
    hide: 'Minimizar painéis da cena',
    show: 'Mostrar painéis da cena'
  });
}

function toggleSidebarCollapsed(side) {
  setSidebarCollapsed(side, !isSidebarCollapsed(side));
}

elements.newProjectButton.addEventListener('click', openNewProjectModal);
elements.emptyNewProjectButton.addEventListener('click', openNewProjectModal);
elements.newProjectForm.addEventListener('submit', createProjectFromModal);
elements.cancelNewProjectButton.addEventListener('click', closeNewProjectModal);
elements.newProjectModal.addEventListener('click', (event) => {
  if (event.target === elements.newProjectModal) {
    closeNewProjectModal();
  }
});
elements.renameProjectForm.addEventListener('submit', renameProjectFromModal);
elements.cancelRenameProjectButton.addEventListener('click', closeRenameProjectModal);
elements.renameProjectModal.addEventListener('click', (event) => {
  if (event.target === elements.renameProjectModal) {
    closeRenameProjectModal();
  }
});
elements.deleteProjectForm.addEventListener('submit', deleteProjectFromModal);
elements.cancelDeleteProjectButton.addEventListener('click', closeDeleteProjectModal);
elements.deleteProjectModal.addEventListener('click', (event) => {
  if (event.target === elements.deleteProjectModal) {
    closeDeleteProjectModal();
  }
});
elements.deleteTilesetForm.addEventListener('submit', deleteTilesetFromModal);
elements.cancelDeleteTilesetButton.addEventListener('click', closeDeleteTilesetModal);
elements.deleteTilesetModal.addEventListener('click', (event) => {
  if (event.target === elements.deleteTilesetModal) {
    closeDeleteTilesetModal();
  }
});
elements.propertyFields.addEventListener('click', (event) => {
  const actionButton = event.target.closest('button[data-light-action]');

  if (actionButton) {
    moveSelectedLight(actionButton.dataset.lightAction);
  }
});
elements.propertyFields.addEventListener('keydown', (event) => {
  const propertyInput = event.target.closest('input[data-property-key]');

  if (!propertyInput) {
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    propertyInput.blur();
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    renderPropertiesPanel();
  }
});
elements.propertyFields.addEventListener('input', (event) => {
  const propertyInput = event.target.closest('input[data-property-key]');

  if (propertyInput) {
    updateSelectedNumericProperty(propertyInput, { render: false, recordHistory: false });
  }
});
elements.propertyFields.addEventListener('change', (event) => {
  const propertyInput = event.target.closest('input[data-property-key]');
  const resizeSnapInput = event.target.closest('input[data-tile-resize-snap]');
  const moveSnapInput = event.target.closest('input[data-object-move-snap]');
  const rotateSnapInput = event.target.closest('input[data-object-rotate-snap]');
  const selectedGroup = getSelectedGroup();
  const selectedObject = getSelectedObject();

  if (selectedGroup) {
    if (getGroupLocked(selectedGroup)) {
      renderPropertiesPanel();
      return;
    }

    if (propertyInput) {
      updateSelectedNumericProperty(propertyInput);
      return;
    }

    if (resizeSnapInput) {
      selectedGroup.resizeSnap = resizeSnapInput.checked;
      markEditorDirty();
      return;
    }

    if (moveSnapInput) {
      selectedGroup.moveSnap = moveSnapInput.checked;
      markEditorDirty();
      return;
    }

    if (rotateSnapInput) {
      selectedGroup.rotateSnap = rotateSnapInput.checked;
      markEditorDirty();
    }

    return;
  }

  if (!selectedObject) {
    return;
  }

  if (isObjectEffectivelyLocked(selectedObject)) {
    renderPropertiesPanel();
    return;
  }

  if (propertyInput) {
    updateSelectedNumericProperty(propertyInput);
    return;
  }

  if (resizeSnapInput && selectedObject.type === 'tile') {
    selectedObject.resizeSnap = resizeSnapInput.checked;
    markEditorDirty();
    return;
  }

  if (moveSnapInput) {
    selectedObject.moveSnap = moveSnapInput.checked;
    markEditorDirty();
    return;
  }

  if (rotateSnapInput) {
    selectedObject.rotateSnap = rotateSnapInput.checked;
    markEditorDirty();
  }
});
elements.axisGizmo.addEventListener('click', handleAxisGizmoClick);
elements.axisGizmo.addEventListener('keydown', handleAxisGizmoKeydown);
elements.tileColorPicker.addEventListener('input', () => {
  const color = normalizeHexColor(elements.tileColorPicker.value);
  const targetIndex = state.customColorTargetIndex;

  if (Number.isInteger(targetIndex) && tilePaletteColors[targetIndex]) {
    tilePaletteColors[targetIndex] = color;
  }

  selectTileColor(color);
});
elements.tileColorPicker.addEventListener('change', () => {
  state.customColorTargetIndex = null;
});
elements.tileSetImageInput.addEventListener('change', async () => {
  try {
    await importTilesetImage(elements.tileSetImageInput.files?.[0]);
  } catch (error) {
    showMessage(error.message || 'Não foi possível importar a imagem.');
  } finally {
    state.pendingTilesetImportId = null;
    elements.tileSetImageInput.value = '';
  }
});
elements.collapseLeftPanelsButton.addEventListener('click', () => toggleSidebarCollapsed('left'));
elements.collapseRightPanelsButton.addEventListener('click', () => toggleSidebarCollapsed('right'));
updatePanelToolButtons();
elements.undoButton.addEventListener('click', undoEditorAction);
elements.redoButton.addEventListener('click', redoEditorAction);
elements.objectTree.addEventListener('contextmenu', openOutlinerContextMenu);
elements.objectTree.addEventListener('keydown', (event) => {
  const isModifierPressed = event.ctrlKey || event.metaKey;

  if (isModifierPressed && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    selectAllObjects();
    renderObjectTree();
    renderPropertiesPanel();
    return;
  }

  if (isModifierPressed && event.key.toLowerCase() === 'g') {
    event.preventDefault();
    groupSelectedObjects();
    renderPropertiesPanel();
    return;
  }

  if (event.key === 'Delete') {
    event.preventDefault();
    closeOutlinerContextMenu();
    deleteSelectedSceneItems();
    return;
  }

  if (event.shiftKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    const objectIds = getOutlinerObjectOrder().map((object) => object.id);
    const currentId = state.selectedObjectId || state.selectionAnchorObjectId || objectIds[0];
    const currentIndex = objectIds.indexOf(currentId);

    if (currentIndex < 0) {
      return;
    }

    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = Math.min(objectIds.length - 1, Math.max(0, currentIndex + step));
    selectRangeTo(objectIds[nextIndex]);
    renderObjectTree();
    renderPropertiesPanel();
  }
});
elements.openProjectButton.addEventListener('click', openProjectDialog);
elements.viewportSelectToolButton.addEventListener('click', () => setViewportTool('select'));
elements.viewportMoveToolButton.addEventListener('click', () => setViewportTool('move'));
elements.viewportRotateToolButton.addEventListener('click', () => setViewportTool('rotate'));
elements.viewportScaleToolButton.addEventListener('click', () => setViewportTool('scale'));
elements.viewportRoundToolItem.addEventListener('pointerenter', openRoundingModeMenu);
elements.viewportRoundToolItem.addEventListener('pointerleave', scheduleRoundingModeMenuClose);
elements.viewportRoundToolItem.addEventListener('focusin', openRoundingModeMenu);
elements.viewportRoundToolItem.addEventListener('focusout', (event) => {
  if (!elements.viewportRoundToolItem.contains(event.relatedTarget)) {
    scheduleRoundingModeMenuClose();
  }
});
elements.viewportRoundToolButton.addEventListener('click', () => {
  openRoundingModeMenu();
  setViewportTool('round');
});
elements.viewportRoundModeButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    activateRoundingControlMode(button.dataset.roundingMode);
  });
});
elements.stampToolButton.addEventListener('click', activateTilePaintTool);
elements.bucketToolButton.addEventListener('click', activateBucketFillTool);
elements.addTileButton.addEventListener('click', activateTilePaintTool);
elements.refreshButton.addEventListener('click', refreshRecentProjects);
elements.backHomeButton.addEventListener('click', () => setView('home'));
elements.editorExportButton.addEventListener('click', exportActiveProjectGlb);
elements.editorSaveButton.addEventListener('click', saveActiveProject);
elements.settingsButton.addEventListener('click', () => showMessage('Configurações entram depois do editor 3D.'));
elements.showFolderButton.addEventListener('click', async () => {
  try {
    await window.engineFlat.projects.openFolder();
    showMessage('Pasta de projetos aberta.');
  } catch (error) {
    showMessage(error.message || 'Nao foi possivel abrir a pasta de projetos.');
  }
});

window.engineFlat.onMenuAction(handleMenuAction);

window.addEventListener('resize', resizeViewport);

document.addEventListener('click', (event) => {
  if (!event.target.closest('.project-card-menu') && !event.target.closest('.project-card-menu-button')) {
    closeCardMenus();
  }

  if (!event.target.closest('.outliner-context-menu')) {
    closeOutlinerContextMenu();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeCardMenus();
    closeOutlinerContextMenu();

    if (!elements.newProjectModal.hidden) {
      closeNewProjectModal();
    }

    if (!elements.renameProjectModal.hidden) {
      closeRenameProjectModal();
    }

    if (!elements.deleteProjectModal.hidden) {
      closeDeleteProjectModal();
    }

    if (!elements.deleteTilesetModal.hidden) {
      closeDeleteTilesetModal();
    }
  }

  if (handleEditorHistoryShortcut(event)) {
    return;
  }

  if (handleViewportKeyboardPan(event)) {
    return;
  }

  if (handleEditorDeleteShortcut(event)) {
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveActiveProject();
  }
});

window.engineFlat.projects.getLocation().then((location) => {
  elements.projectsPath.textContent = location;
});

setView('home');
refreshRecentProjects();
