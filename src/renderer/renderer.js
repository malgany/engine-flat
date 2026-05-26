import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

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
  roundingControlMode: 'edge',
  propertyAccordionOpenKey: 'basic',
  textureTool: 'bucket',
  texturePaintColor: '#9aa0a6',
  textureBrushSize: 14,
  textureZoom: 0.5
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
  paintCanvasCache: new Map(),
  paintTextureCache: new Map(),
  modelCache: new Map(),
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
  shapeDrag: null,
  groupResizeDrag: null,
  selectionClick: null
};

const textureInteraction = {
  isPainting: false,
  objectId: null,
  lastPoint: null,
  activeRegion: null
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
const defaultPaintTextureSize = 512;
const paintTextureVersion = 1;
const textureZoomMin = 0.25;
const textureZoomMax = 6;
const textureZoomStep = 1.25;
const roundingControlModes = new Set(['edge', 'axis', 'all']);
const roundingHandleMinPercent = 0;
const roundingHandleMaxPercent = 100;
const roundingGeometrySegments = 14;
const shapeTaperMinPercent = 0;
const shapeTaperMaxPercent = 100;
const shapeSidesMin = 3;
const shapeSidesMax = 32;
const tilePaletteColors = createDefaultTilePalette();
const roundingEdgeDefinitions = createRoundingEdgeDefinitions();
const roundingEdgeIds = roundingEdgeDefinitions.map((edge) => edge.id);
const shapeFaceDefinitions = createShapeFaceDefinitions();
const shapeFaceIds = shapeFaceDefinitions.map((face) => face.id);
const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
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
  viewportShapeToolButton: document.querySelector('#viewportShapeToolButton'),
  axisGizmoCanvas: document.querySelector('#axisGizmoCanvas'),
  stampToolButton: document.querySelector('#stampToolButton'),
  bucketToolButton: document.querySelector('#bucketToolButton'),
  addTileButton: document.querySelector('#addTileButton'),
  addSphereButton: document.querySelector('#addSphereButton'),
  importModelButton: document.querySelector('#importModelButton'),
  propertyFields: document.querySelector('#propertyFields'),
  selectedObjectName: document.querySelector('#selectedObjectName'),
  textureObjectName: document.querySelector('#textureObjectName'),
  textureBucketToolButton: document.querySelector('#textureBucketToolButton'),
  textureBrushToolButton: document.querySelector('#textureBrushToolButton'),
  textureEraserToolButton: document.querySelector('#textureEraserToolButton'),
  textureColorPicker: document.querySelector('#textureColorPicker'),
  textureBrushSizeInput: document.querySelector('#textureBrushSizeInput'),
  textureZoomOutButton: document.querySelector('#textureZoomOutButton'),
  textureZoomInButton: document.querySelector('#textureZoomInButton'),
  textureCanvasScroll: document.querySelector('#textureCanvasScroll'),
  textureCanvasStage: document.querySelector('#textureCanvasStage'),
  textureCanvas: document.querySelector('#textureCanvas'),
  textureEmptyMessage: document.querySelector('#textureEmptyMessage'),
  tileStyleName: document.querySelector('#tileStyleName'),
  tileSetTabs: document.querySelector('#tileSetTabs'),
  tileSetContent: document.querySelector('#tileSetContent'),
  tileSetImageInput: document.querySelector('#tileSetImageInput'),
  modelImportInput: document.querySelector('#modelImportInput'),
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

function isPaintableObjectType(type) {
  return type === 'tile' || type === 'sphere' || type === 'model';
}

function getDefaultTextureLayoutType(objectOrType) {
  const type = typeof objectOrType === 'string' ? objectOrType : objectOrType?.type;

  if (type === 'sphere') {
    return 'sphere-equirect';
  }

  if (type === 'model') {
    return 'uv';
  }

  return 'box';
}

function normalizeTexturePaint(texturePaint = {}, layoutType = 'box') {
  const defaultDimensions = getDefaultPaintTextureDimensions(layoutType);
  const width = Number.parseInt(texturePaint.width, 10);
  const height = Number.parseInt(texturePaint.height, 10);

  return {
    version: paintTextureVersion,
    width: Number.isFinite(width) && width > 0 ? width : defaultDimensions.width,
    height: Number.isFinite(height) && height > 0 ? height : defaultDimensions.height,
    imageDataUrl: typeof texturePaint.imageDataUrl === 'string' ? texturePaint.imageDataUrl : '',
    layoutType: String(texturePaint.layoutType || layoutType)
  };
}

function getDefaultPaintTextureDimensions(layoutType = 'box') {
  if (layoutType === 'sphere-equirect') {
    return {
      width: defaultPaintTextureSize,
      height: defaultPaintTextureSize / 2
    };
  }

  return {
    width: defaultPaintTextureSize,
    height: defaultPaintTextureSize
  };
}

function normalizeSourceModel(sourceModel = {}) {
  return {
    name: String(sourceModel.name || 'Modelo importado'),
    format: String(sourceModel.format || '').toLowerCase(),
    dataUrl: String(sourceModel.dataUrl || '')
  };
}

function isSupportedSceneObjectType(type) {
  return type === 'directional-light' || type === 'tile' || type === 'sphere' || type === 'model';
}

function getObjectMaterialColor(object) {
  if (object?.type === 'tile') {
    return getTileMaterialPreviewColor(object.material);
  }

  return normalizeHexColor(object?.material?.color || defaultTileColor);
}

function clonePaintableMaterial(material = {}) {
  return {
    color: normalizeHexColor(material.color || defaultTileColor)
  };
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

function createShapeFaceDefinitions() {
  return [
    { id: 'y_pos', axis: 'y', sign: 1, label: 'Topo' },
    { id: 'y_neg', axis: 'y', sign: -1, label: 'Base' },
    { id: 'x_pos', axis: 'x', sign: 1, label: 'Direita' },
    { id: 'x_neg', axis: 'x', sign: -1, label: 'Esquerda' },
    { id: 'z_pos', axis: 'z', sign: 1, label: 'Frente' },
    { id: 'z_neg', axis: 'z', sign: -1, label: 'Fundo' }
  ];
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

function clampShapeTaperPercent(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(shapeTaperMaxPercent, Math.max(shapeTaperMinPercent, numericValue));
}

function clampShapeSides(value) {
  const numericValue = Number.parseInt(value, 10);

  if (!Number.isFinite(numericValue)) {
    return 4;
  }

  return Math.min(shapeSidesMax, Math.max(shapeSidesMin, numericValue));
}

function normalizeTileShape(shape = {}) {
  let taperPercent = Number(shape.taperPercent);

  if (!Number.isFinite(taperPercent) && Number.isFinite(Number(shape.topScalePercent))) {
    taperPercent = 100 - Number(shape.topScalePercent);
  }

  if (!Number.isFinite(taperPercent) && Number.isFinite(Number(shape.topScale))) {
    const topScale = Number(shape.topScale);
    taperPercent = topScale <= 1 ? (1 - topScale) * 100 : 100 - topScale;
  }

  const sourceFaces = shape.faces || shape.faceTapers || {};
  const hasFaces = shapeFaceIds.some((faceId) => sourceFaces[faceId] !== undefined);
  const faces = {};

  shapeFaceIds.forEach((faceId) => {
    faces[faceId] = clampShapeTaperPercent(sourceFaces[faceId]);
  });

  if (!hasFaces && Number.isFinite(taperPercent)) {
    faces.y_pos = clampShapeTaperPercent(taperPercent);
  }

  return {
    type: 'taper',
    sides: clampShapeSides(shape.sides),
    faces,
    taperPercent: getShapeFacesAveragePercent({ faces })
  };
}

function cloneTileShape(shape) {
  return cloneJson(normalizeTileShape(shape));
}

function setTileShapeValue(shape, propertyKey, value) {
  const normalizedShape = normalizeTileShape(shape);

  if (propertyKey === 'shape-all' || propertyKey === 'shape-taper') {
    return setAllShapeFaces(normalizedShape, value);
  } else if (propertyKey === 'shape-sides') {
    normalizedShape.sides = clampShapeSides(value);
  } else if (propertyKey.startsWith('shape-face-')) {
    const faceId = propertyKey.slice('shape-face-'.length);

    if (shapeFaceIds.includes(faceId)) {
      normalizedShape.faces[faceId] = clampShapeTaperPercent(value);
      normalizedShape.taperPercent = getShapeFacesAveragePercent(normalizedShape);
    }
  }

  return normalizedShape;
}

function setAllShapeFaces(shape, value) {
  const normalizedShape = normalizeTileShape(shape);
  const nextValue = clampShapeTaperPercent(value);

  shapeFaceIds.forEach((faceId) => {
    normalizedShape.faces[faceId] = nextValue;
  });

  normalizedShape.taperPercent = nextValue;
  return normalizedShape;
}

function getShapeFaceValue(shape, faceId) {
  return clampShapeTaperPercent(normalizeTileShape(shape).faces[faceId]);
}

function getShapeFacesAveragePercent(shape) {
  const sourceFaces = shape.faces || {};
  const total = shapeFaceIds.reduce((sum, faceId) => sum + clampShapeTaperPercent(sourceFaces[faceId]), 0);

  return total / shapeFaceIds.length;
}

function hasTileShape(shape) {
  const normalizedShape = normalizeTileShape(shape);

  return normalizedShape.sides !== 4
    || shapeFaceIds.some((faceId) => normalizedShape.faces[faceId] > 0.001);
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
    name: String(object.name || 'Objeto'),
    visible: object.visible !== false,
    locked: object.locked === true,
    moveSnap: object.moveSnap !== false,
    rotateSnap: object.rotateSnap !== false
  };

  if (object.type === 'sphere' || object.type === 'model') {
    const fallbackPosition = [0.5, 0.5, 0.5];

    return {
      ...commonObject,
      transform: {
        position: object.transform?.position || fallbackPosition,
        rotation: object.transform?.rotation || [0, 0, 0],
        scale: object.transform?.scale || [1, 1, 1]
      },
      material: clonePaintableMaterial(object.material),
      texturePaint: normalizeTexturePaint(object.texturePaint, getDefaultTextureLayoutType(object)),
      sourceModel: object.type === 'model' ? normalizeSourceModel(object.sourceModel) : undefined
    };
  }

  if (object.type !== 'tile') {
    return {
      ...commonObject,
      transform: {
        position: object.transform?.position || [0, 0, 0],
        rotation: object.transform?.rotation || [0, 0, 0],
        scale: object.transform?.scale || [1, 1, 1]
      }
    };
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
    shape: normalizeTileShape(object.shape),
    texturePaint: normalizeTexturePaint(object.texturePaint, getDefaultTextureLayoutType(object)),
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
  const sourceObjects = Array.isArray(project.scene?.objects)
    ? project.scene.objects
    : [createDefaultLightObject()];
  const objects = sourceObjects
    .map((object) => normalizeSceneObject(object, tileSizePixels))
    .filter((object) => isSupportedSceneObjectType(object.type));

  if (!objects.some((object) => object.id === 'scene-light')) {
    objects.unshift(createDefaultLightObject());
  }

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
      objects,
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
    const isExpanded = isGroupExpanded(group.id);

    group.objectIds.forEach((objectId) => {
      const object = objectsById.get(objectId);

      if (object) {
        groupedObjectIds.add(objectId);
      }

      if (object && isExpanded) {
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

function getObjectIconId(object) {
  if (object?.type === 'directional-light') {
    return '#icon-light';
  }

  if (object?.type === 'sphere') {
    return '#icon-model';
  }

  if (object?.type === 'model') {
    return '#icon-cube';
  }

  return '#icon-tile';
}

function getPropertySectionKeyForViewportTool(tool = state.viewportTool) {
  if (tool === 'rotate') {
    return 'rotation';
  }

  if (tool === 'scale') {
    return 'dimensions';
  }

  if (tool === 'round') {
    return 'rounding';
  }

  if (tool === 'shape') {
    return 'shape';
  }

  return 'basic';
}

function setSelectedObjects(objectIds, primaryObjectId = objectIds.at(-1) || null) {
  const validObjectIds = objectIds.filter((objectId) => getObjectById(objectId));
  const previousSelectedObjectId = state.selectedObjectId;
  const previousSelectedGroupId = state.selectedGroupId;
  state.selectedObjectIds = new Set(validObjectIds);
  state.selectedObjectId = validObjectIds.includes(primaryObjectId)
    ? primaryObjectId
    : validObjectIds.at(-1) || null;
  state.selectedGroupId = null;
  state.selectionAnchorObjectId = state.selectedObjectId;

  if (previousSelectedObjectId !== state.selectedObjectId || previousSelectedGroupId) {
    state.propertyAccordionOpenKey = getPropertySectionKeyForViewportTool();
  }

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
  state.propertyAccordionOpenKey = getPropertySectionKeyForViewportTool();
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

function createPropertySection(section) {
  const isOpen = section.key === state.propertyAccordionOpenKey;
  const openAttribute = isOpen ? ' open' : '';
  const content = Array.isArray(section.items) ? section.items.join('') : String(section.items || '');

  return `
    <details class="property-accordion"${openAttribute} data-property-section="${section.key}">
      <summary class="property-accordion-summary" data-property-section-summary="${section.key}">
        <span>${section.title}</span>
      </summary>
      <div class="property-accordion-content">${content}</div>
    </details>
  `;
}

function renderPropertySections(sections) {
  const availableSections = sections.filter((section) => section?.key && section?.title);

  if (availableSections.length === 0) {
    elements.propertyFields.innerHTML = '';
    return;
  }

  if (!availableSections.some((section) => section.key === state.propertyAccordionOpenKey)) {
    state.propertyAccordionOpenKey = availableSections[0].key;
  }

  elements.propertyFields.innerHTML = availableSections.map(createPropertySection).join('');
}

function setPropertyAccordionOpen(key) {
  const sections = [...elements.propertyFields.querySelectorAll('.property-accordion')];
  const nextKey = sections.length > 0 && !sections.some((section) => section.dataset.propertySection === key)
    ? sections[0].dataset.propertySection
    : key;

  state.propertyAccordionOpenKey = nextKey;

  sections.forEach((section) => {
    section.open = section.dataset.propertySection === nextKey;
  });
}

function createRoundingProperties(tile, isDisabled = false) {
  const rounding = normalizeTileRounding(tile.rounding);
  const properties = [
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

function createShapeProperties(tile, isDisabled = false) {
  const shape = normalizeTileShape(tile.shape);

  const properties = [
    createNumericProperty('Todas as faces', 'shape-all', getShapeFacesAveragePercent(shape), {
      precision: 0,
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      disabled: isDisabled
    }),
    createNumericProperty('Lados da base', 'shape-sides', shape.sides, {
      precision: 0,
      min: shapeSidesMin,
      max: shapeSidesMax,
      step: 1,
      disabled: isDisabled
    })
  ];

  properties.push('<div class="property-subsection-title">Faces</div>');
  shapeFaceDefinitions.forEach((face) => {
    properties.push(createNumericProperty(face.label, `shape-face-${face.id}`, getShapeFaceValue(shape, face.id), {
      precision: 0,
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      disabled: isDisabled
    }));
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
    renderTexturePanel();
    return;
  }

  const selectedObject = getSelectedObject();

  if (!selectedObject) {
    elements.selectedObjectName.textContent = 'Nenhum';
    elements.propertyFields.innerHTML = '<div class="property-empty">Nenhum objeto selecionado.</div>';
    renderTexturePanel();
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

  const basicProperties = [
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
    `<label class="property-toggle">Movimento magnético <input type="checkbox" data-object-move-snap ${selectedObject.moveSnap !== false ? 'checked' : ''}></label>`
  ];
  const rotationProperties = [
    createNumericProperty('Rotação X', 'rotation-x', Number(rotation[0] || 0), { step: 0.1, unit: 'deg' }),
    createNumericProperty('Rotação Y', 'rotation-y', Number(rotation[1] || 0), { step: 0.1, unit: 'deg' }),
    createNumericProperty('Rotação Z', 'rotation-z', Number(rotation[2] || 0), { step: 0.1, unit: 'deg' }),
    `<label class="property-toggle">Rotação magnética <input type="checkbox" data-object-rotate-snap ${selectedObject.rotateSnap !== false ? 'checked' : ''}></label>`
  ];
  const sections = [
    { key: 'basic', title: 'Básico', items: basicProperties },
    { key: 'rotation', title: 'Rotação', items: rotationProperties }
  ];

  if (selectedObject.type === 'tile') {
    sections.push(
      {
        key: 'dimensions',
        title: 'Dimensões',
        items: [
          createNumericProperty('Largura', 'width', selectedObject.size?.widthPixels || tileSizePixels, { precision: 0, min: tileSizePixels, step: 1, unit: 'px' }),
          createNumericProperty('Profundidade', 'depth', selectedObject.size?.depthPixels || tileSizePixels, { precision: 0, min: tileSizePixels, step: 1, unit: 'px' }),
          createNumericProperty('Altura', 'height', selectedObject.size?.heightPixels || 1, { precision: 0, min: 1, step: 1, unit: 'px' }),
          createNumericProperty('Escala', 'scale', Number(scale[0] || 1), { min: 0.01, step: 0.01 }),
          `<label class="property-toggle">Transformação magnética <input type="checkbox" data-tile-resize-snap ${selectedObject.resizeSnap !== false ? 'checked' : ''}></label>`
        ]
      },
      { key: 'shape', title: 'Forma', items: createShapeProperties(selectedObject, isLocked) },
      { key: 'rounding', title: 'Arredondamento', items: createRoundingProperties(selectedObject, isLocked) },
      {
        key: 'info',
        title: 'Info',
        items: [
          `<div class="property-note"><span>Célula</span><span>${gridPosition[0]}, ${gridPosition[1]}</span></div>`,
          `<div class="property-note"><span>Quadrado</span><span>${tileSizePixels} x ${tileSizePixels} px</span></div>`
        ]
      }
    );
  } else {
    sections.push({
      key: 'dimensions',
      title: 'Dimensões',
      items: [createNumericProperty('Escala', 'scale', Number(scale[0] || 1), { min: 0.01, step: 0.01 })]
    });
  }

  if (selectedObject.type === 'directional-light') {
    sections.push({
      key: 'light',
      title: 'Luz',
      items: [`
      <div class="light-controls" aria-label="Mover luz">
        <button type="button" data-light-action="orbit-left">Órbita -</button>
        <button type="button" data-light-action="orbit-right">Órbita +</button>
        <button type="button" data-light-action="height-up">Altura +</button>
        <button type="button" data-light-action="height-down">Altura -</button>
        <button type="button" data-light-action="distance-in">Distância -</button>
        <button type="button" data-light-action="distance-out">Distância +</button>
      </div>
    `]
    });
  }

  renderPropertySections(sections);

  if (isLocked) {
    setPropertiesDisabled('Objeto bloqueado. Desbloqueie o cadeado para editar propriedades e transformações.');
  }

  renderTexturePanel();
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

  const sections = [
    {
      key: 'basic',
      title: 'Básico',
      items: [
        createNumericProperty('Localização X', 'position-x', groupMetrics.originPixels[0], { precision: 0, step: 1, unit: 'px', disabled: isLocked }),
        createNumericProperty('Localização Y', 'position-y', groupMetrics.originPixels[1], { precision: 0, step: 1, unit: 'px', disabled: isLocked }),
        createNumericProperty('Localização Z', 'position-z', groupMetrics.originPixels[2], { precision: 0, step: 1, unit: 'px', disabled: isLocked }),
        createToggleProperty('Movimento magnético', 'data-object-move-snap', group.moveSnap !== false, isLocked)
      ]
    },
    {
      key: 'rotation',
      title: 'Rotação',
      items: [
        createNumericProperty('Rotação X', 'rotation-x', Number(rotation[0] || 0), { step: 0.1, unit: 'deg', disabled: isLocked }),
        createNumericProperty('Rotação Y', 'rotation-y', Number(rotation[1] || 0), { step: 0.1, unit: 'deg', disabled: isLocked }),
        createNumericProperty('Rotação Z', 'rotation-z', Number(rotation[2] || 0), { step: 0.1, unit: 'deg', disabled: isLocked }),
        createToggleProperty('Rotação magnética', 'data-object-rotate-snap', group.rotateSnap !== false, isLocked)
      ]
    },
    {
      key: 'dimensions',
      title: 'Dimensões',
      items: [
        createNumericProperty('Largura', 'width', groupMetrics.widthPixels, { precision: 0, min: groupMetrics.tileSizePixels, step: 1, unit: 'px', disabled: isLocked }),
        createNumericProperty('Profundidade', 'depth', groupMetrics.depthPixels, { precision: 0, min: groupMetrics.tileSizePixels, step: 1, unit: 'px', disabled: isLocked }),
        createNumericProperty('Altura', 'height', groupMetrics.heightPixels, { precision: 0, min: 1, step: 1, unit: 'px', disabled: isLocked }),
        createNumericProperty('Escala', 'scale', Number(scale[0] || 1), { min: 0.01, step: 0.01, disabled: isLocked }),
        createToggleProperty('Transformação magnética', 'data-tile-resize-snap', group.resizeSnap !== false, isLocked)
      ]
    },
    {
      key: 'info',
      title: 'Info',
      items: [
        `<div class="property-note"><span>Itens</span><span>${groupObjects.length}</span></div>`,
        `<div class="property-note"><span>Quadrado</span><span>${groupMetrics.tileSizePixels} x ${groupMetrics.tileSizePixels} px</span></div>`
      ]
    }
  ];

  renderPropertySections(sections);

  if (isLocked) {
    setPropertiesDisabled('Grupo bloqueado. Desbloqueie o cadeado para editar o grupo.');
  }
}

function getSelectedTextureObject() {
  if (state.selectedGroupId) {
    return null;
  }

  const selectedObject = getSelectedObject();
  return isPaintableObjectType(selectedObject?.type) ? selectedObject : null;
}

function getTexturePanel() {
  return elements.textureCanvas?.closest('.texture-panel') || null;
}

function setTexturePanelMessage(message, options = {}) {
  const panel = getTexturePanel();

  if (elements.textureObjectName) {
    elements.textureObjectName.textContent = options.objectName || 'Nenhum';
  }

  if (elements.textureEmptyMessage) {
    elements.textureEmptyMessage.textContent = message;
  }

  panel?.classList.toggle('texture-ready', options.ready === true);
  panel?.classList.toggle('texture-warning', options.warning === true);
}

function ensureObjectTexturePaint(object) {
  if (!object || !isPaintableObjectType(object.type)) {
    return null;
  }

  object.texturePaint = normalizeTexturePaint(object.texturePaint, getDefaultTextureLayoutType(object));
  return object.texturePaint;
}

function createPaintCanvas(width, height) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = defaultTileColor;
  context.fillRect(0, 0, width, height);

  return canvas;
}

function loadPaintImageIntoRecord(object, record, imageDataUrl) {
  if (!imageDataUrl || record.loadingDataUrl === imageDataUrl) {
    return;
  }

  record.loadingDataUrl = imageDataUrl;

  const image = new Image();
  image.addEventListener('load', () => {
    if (record.loadingDataUrl !== imageDataUrl) {
      return;
    }

    const context = record.canvas.getContext('2d');
    context.fillStyle = defaultTileColor;
    context.fillRect(0, 0, record.canvas.width, record.canvas.height);
    context.drawImage(image, 0, 0, record.canvas.width, record.canvas.height);
    record.imageDataUrl = imageDataUrl;
    record.loadingDataUrl = null;
    refreshPaintTexture(object.id);

    if (getSelectedObject()?.id === object.id) {
      renderTexturePanel();
    }
  }, { once: true });
  image.addEventListener('error', () => {
    record.loadingDataUrl = null;
  }, { once: true });
  image.src = imageDataUrl;
}

function ensurePaintCanvasRecord(object) {
  const texturePaint = ensureObjectTexturePaint(object);

  if (!texturePaint) {
    return null;
  }

  let record = viewport.paintCanvasCache.get(object.id);

  if (!record || record.canvas.width !== texturePaint.width || record.canvas.height !== texturePaint.height) {
    record = {
      canvas: createPaintCanvas(texturePaint.width, texturePaint.height),
      imageDataUrl: '',
      loadingDataUrl: null
    };
    viewport.paintCanvasCache.set(object.id, record);
  }

  if (record.imageDataUrl !== texturePaint.imageDataUrl) {
    const context = record.canvas.getContext('2d');
    context.fillStyle = defaultTileColor;
    context.fillRect(0, 0, record.canvas.width, record.canvas.height);
    record.imageDataUrl = texturePaint.imageDataUrl || '';

    if (texturePaint.imageDataUrl) {
      loadPaintImageIntoRecord(object, record, texturePaint.imageDataUrl);
    }
  }

  return record;
}

function persistPaintCanvas(object, record) {
  const texturePaint = ensureObjectTexturePaint(object);

  if (!texturePaint || !record) {
    return;
  }

  texturePaint.imageDataUrl = record.canvas.toDataURL('image/png');
  record.imageDataUrl = texturePaint.imageDataUrl;
}

function getBoxTextureRegions(width, height) {
  const gap = Math.max(6, Math.round(width * 0.016));
  const faceSize = Math.floor((width - (gap * 3) - 72) / 4);
  const startX = Math.floor((width - ((faceSize * 4) + (gap * 3))) / 2);
  const startY = Math.floor((height - ((faceSize * 3) + (gap * 2))) / 2);
  const rowMiddle = startY + faceSize + gap;

  return [
    { id: 'y_pos', x: startX + faceSize + gap, y: startY, width: faceSize, height: faceSize },
    { id: 'x_neg', x: startX, y: rowMiddle, width: faceSize, height: faceSize },
    { id: 'z_pos', x: startX + faceSize + gap, y: rowMiddle, width: faceSize, height: faceSize },
    { id: 'x_pos', x: startX + ((faceSize + gap) * 2), y: rowMiddle, width: faceSize, height: faceSize },
    { id: 'z_neg', x: startX + ((faceSize + gap) * 3), y: rowMiddle, width: faceSize, height: faceSize },
    { id: 'y_neg', x: startX + faceSize + gap, y: rowMiddle + faceSize + gap, width: faceSize, height: faceSize }
  ];
}

function getBoxFaceVertexDefinitions() {
  return {
    y_pos: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]],
    y_neg: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]],
    x_neg: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
    z_pos: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    x_pos: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],
    z_neg: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]
  };
}

function getPolygonBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY)
  };
}

function getPolygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return 0;
  }

  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += (current.x * next.y) - (next.x * current.y);
  }

  return Math.abs(area) / 2;
}

function isPointInPolygon(point, polygon) {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }

  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const first = polygon[index];
    const second = polygon[previous];
    const intersects = ((first.y > point.y) !== (second.y > point.y))
      && point.x < (((second.x - first.x) * (point.y - first.y)) / ((second.y - first.y) || 0.000001)) + first.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function applyCanvasPolygonPath(context, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }

  context.beginPath();
  polygon.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.closePath();
  return true;
}

function getTriangleBarycentricPoint(point, first, second, third) {
  const v0x = second.x - first.x;
  const v0y = second.y - first.y;
  const v1x = third.x - first.x;
  const v1y = third.y - first.y;
  const v2x = point.x - first.x;
  const v2y = point.y - first.y;
  const denominator = (v0x * v1y) - (v1x * v0y);

  if (Math.abs(denominator) < 0.000001) {
    return null;
  }

  const u = ((v2x * v1y) - (v1x * v2y)) / denominator;
  const v = ((v0x * v2y) - (v2x * v0y)) / denominator;
  const w = 1 - u - v;
  const tolerance = -0.0001;

  if (u < tolerance || v < tolerance || w < tolerance) {
    return null;
  }

  return { first: w, second: u, third: v };
}

function interpolateTrianglePoint(barycentric, first, second, third) {
  return {
    x: (first.x * barycentric.first) + (second.x * barycentric.second) + (third.x * barycentric.third),
    y: (first.y * barycentric.first) + (second.y * barycentric.second) + (third.y * barycentric.third)
  };
}

function mapPointBetweenQuadPolygons(point, sourcePolygon, targetPolygon) {
  const triangleIndexes = [[0, 1, 2], [0, 2, 3]];

  for (const indexes of triangleIndexes) {
    const barycentric = getTriangleBarycentricPoint(
      point,
      sourcePolygon[indexes[0]],
      sourcePolygon[indexes[1]],
      sourcePolygon[indexes[2]]
    );

    if (barycentric) {
      return interpolateTrianglePoint(
        barycentric,
        targetPolygon[indexes[0]],
        targetPolygon[indexes[1]],
        targetPolygon[indexes[2]]
      );
    }
  }

  return null;
}

function getBoxFaceDisplayLocalPoint(faceId, vertex) {
  if (faceId === 'y_pos' || faceId === 'y_neg') {
    return { x: vertex.x, y: -vertex.z };
  }

  if (faceId === 'x_pos' || faceId === 'x_neg') {
    return { x: vertex.z, y: -vertex.y };
  }

  return { x: vertex.x, y: -vertex.y };
}

function getBoxFaceSourcePoint(faceId, vertex, sourceRegion, metrics) {
  const safeWidth = Math.max(metrics.widthUnits, 0.0001);
  const safeHeight = Math.max(metrics.heightUnits, 0.0001);
  const safeDepth = Math.max(metrics.depthUnits, 0.0001);
  let localU = (vertex.x / safeWidth) + 0.5;
  let localV = (vertex.y / safeHeight) + 0.5;

  if (faceId === 'y_pos' || faceId === 'y_neg') {
    localU = (vertex.x / safeWidth) + 0.5;
    localV = (vertex.z / safeDepth) + 0.5;
  } else if (faceId === 'x_pos' || faceId === 'x_neg') {
    localU = (vertex.z / safeDepth) + 0.5;
    localV = (vertex.y / safeHeight) + 0.5;
  }

  return {
    x: sourceRegion.x + (Math.min(1, Math.max(0, localU)) * sourceRegion.width),
    y: sourceRegion.y + ((1 - Math.min(1, Math.max(0, localV))) * sourceRegion.height)
  };
}

function getTileBoxFaceRawRegions(object, sourceRegions) {
  if (object?.type !== 'tile' || normalizeTileShape(object.shape).sides !== 4) {
    return null;
  }

  const metrics = getTileRenderMetrics(object);
  const definitions = getBoxFaceVertexDefinitions();
  const sourceById = new Map(sourceRegions.map((region) => [region.id, region]));

  return Object.entries(definitions).map(([faceId, signs]) => {
    const sourceRegion = sourceById.get(faceId);
    const baseVertices = signs.map(([xSign, ySign, zSign]) => (
      new THREE.Vector3(
        xSign * (metrics.widthUnits / 2),
        ySign * (metrics.heightUnits / 2),
        zSign * (metrics.depthUnits / 2)
      )
    ));
    const displayVertices = baseVertices.map((baseVertex) => {
      const vertex = baseVertex.clone();
      deformTaperedBoxPosition(vertex, metrics.widthUnits, metrics.heightUnits, metrics.depthUnits, object.shape);
      return vertex;
    });
    const localPolygon = displayVertices.map((vertex) => getBoxFaceDisplayLocalPoint(faceId, vertex));
    const sourcePolygon = baseVertices.map((vertex) => getBoxFaceSourcePoint(faceId, vertex, sourceRegion, metrics));

    return {
      id: faceId,
      sourceRegion,
      localPolygon,
      localBounds: getPolygonBounds(localPolygon),
      sourcePolygon
    };
  }).filter((region) => region.sourceRegion);
}

function getFallbackTextureDisplayRegions(object, metrics) {
  return getTextureRegions(object, metrics.sourceWidth, metrics.sourceHeight).map((sourceRegion) => ({
    id: sourceRegion.id,
    sourceRegion,
    x: sourceRegion.x,
    y: sourceRegion.y,
    width: sourceRegion.width,
    height: sourceRegion.height,
    bounds: {
      x: sourceRegion.x,
      y: sourceRegion.y,
      width: sourceRegion.width,
      height: sourceRegion.height
    },
    displayPolygon: [
      { x: sourceRegion.x, y: sourceRegion.y },
      { x: sourceRegion.x + sourceRegion.width, y: sourceRegion.y },
      { x: sourceRegion.x + sourceRegion.width, y: sourceRegion.y + sourceRegion.height },
      { x: sourceRegion.x, y: sourceRegion.y + sourceRegion.height }
    ],
    sourcePolygon: [
      { x: sourceRegion.x, y: sourceRegion.y },
      { x: sourceRegion.x + sourceRegion.width, y: sourceRegion.y },
      { x: sourceRegion.x + sourceRegion.width, y: sourceRegion.y + sourceRegion.height },
      { x: sourceRegion.x, y: sourceRegion.y + sourceRegion.height }
    ]
  }));
}

function createBoxDisplayRegion(rawRegion, x, y, scale) {
  const polygon = rawRegion.localPolygon.map((point) => ({
    x: x + ((point.x - rawRegion.localBounds.x) * scale),
    y: y + ((point.y - rawRegion.localBounds.y) * scale)
  }));
  const bounds = getPolygonBounds(polygon);

  return {
    id: rawRegion.id,
    sourceRegion: rawRegion.sourceRegion,
    sourcePolygon: rawRegion.sourcePolygon,
    displayPolygon: polygon,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    bounds
  };
}

function layoutTileBoxDisplayRegions(rawRegions, metrics, scaleMultiplier = 1) {
  const byId = new Map(rawRegions.map((region) => [region.id, region]));
  const requiredIds = ['x_neg', 'z_pos', 'x_pos', 'z_neg', 'y_pos', 'y_neg'];

  if (!requiredIds.every((id) => byId.has(id))) {
    return null;
  }

  const margin = 14;
  const gap = 12;
  const sideIds = ['x_neg', 'z_pos', 'x_pos', 'z_neg'];
  const sideWidth = sideIds.reduce((sum, id) => sum + byId.get(id).localBounds.width, 0);
  const sideHeight = Math.max(...sideIds.map((id) => byId.get(id).localBounds.height));
  const topHeight = byId.get('y_pos').localBounds.height;
  const bottomHeight = byId.get('y_neg').localBounds.height;
  const availableWidth = Math.max(32, metrics.displayWidth - (margin * 2) - (gap * 3));
  const availableHeight = Math.max(32, metrics.displayHeight - (margin * 2) - (gap * 2));
  let scale = Math.min(
    availableWidth / Math.max(sideWidth, 0.0001),
    availableHeight / Math.max(topHeight + sideHeight + bottomHeight, 0.0001)
  ) * scaleMultiplier;

  if (!Number.isFinite(scale) || scale <= 0) {
    scale = 1;
  }

  const scaledSideWidth = sideWidth * scale + (gap * 3);
  const rowX = Math.max(margin, (metrics.displayWidth - scaledSideWidth) / 2);
  const rowY = margin + (topHeight * scale) + gap;
  const positions = {};
  let cursorX = rowX;

  sideIds.forEach((id) => {
    const rawRegion = byId.get(id);
    positions[id] = {
      x: cursorX,
      y: rowY + ((sideHeight - rawRegion.localBounds.height) * scale)
    };
    cursorX += (rawRegion.localBounds.width * scale) + gap;
  });

  const zPosition = positions.z_pos;
  positions.y_pos = {
    x: zPosition.x + (((byId.get('z_pos').localBounds.width - byId.get('y_pos').localBounds.width) * scale) / 2),
    y: margin
  };
  positions.y_neg = {
    x: zPosition.x + (((byId.get('z_pos').localBounds.width - byId.get('y_neg').localBounds.width) * scale) / 2),
    y: rowY + (sideHeight * scale) + gap
  };

  return requiredIds.map((id) => createBoxDisplayRegion(byId.get(id), positions[id].x, positions[id].y, scale))
    .filter((region) => region.width >= 3 && region.height >= 3 && getPolygonArea(region.displayPolygon) >= 5);
}

function getBoxTextureDisplayRegions(object, metrics) {
  const sourceRegions = getBoxTextureRegions(metrics.sourceWidth, metrics.sourceHeight);
  const rawRegions = getTileBoxFaceRawRegions(object, sourceRegions);

  if (!rawRegions) {
    return getFallbackTextureDisplayRegions(object, metrics);
  }

  let displayRegions = layoutTileBoxDisplayRegions(rawRegions, metrics);

  if (!displayRegions || displayRegions.length === 0) {
    return getFallbackTextureDisplayRegions(object, metrics);
  }

  const allPoints = displayRegions.flatMap((region) => region.displayPolygon);
  const bounds = getPolygonBounds(allPoints);
  const margin = 8;
  const overflowScale = Math.min(
    1,
    (metrics.displayWidth - (margin * 2)) / Math.max(bounds.width, 1),
    (metrics.displayHeight - (margin * 2)) / Math.max(bounds.height, 1)
  );

  if (overflowScale < 1) {
    displayRegions = layoutTileBoxDisplayRegions(rawRegions, metrics, overflowScale);
  }

  return displayRegions || getFallbackTextureDisplayRegions(object, metrics);
}

function getTextureDisplayRegions(object, metrics) {
  if (metrics.layoutType === 'box') {
    return getBoxTextureDisplayRegions(object, metrics);
  }

  return getFallbackTextureDisplayRegions(object, metrics);
}

function getFullTextureRegions(width, height) {
  return [{ id: 'uv', x: 0, y: 0, width, height }];
}

function getSphereTextureRegions(width, height) {
  const columns = 12;
  const rows = 6;
  const regions = [];
  const cellWidth = width / columns;
  const cellHeight = height / rows;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      regions.push({
        id: `sphere-${column}-${row}`,
        x: column * cellWidth,
        y: row * cellHeight,
        width: cellWidth,
        height: cellHeight
      });
    }
  }

  return regions;
}

function getTextureRegions(object, width, height) {
  const layoutType = ensureObjectTexturePaint(object)?.layoutType || getDefaultTextureLayoutType(object);

  if (layoutType === 'sphere-equirect') {
    return getSphereTextureRegions(width, height);
  }

  if (layoutType === 'uv') {
    return getFullTextureRegions(width, height);
  }

  return getBoxTextureRegions(width, height);
}

function getTextureEditorMetrics(object, record) {
  const sourceWidth = record?.canvas?.width || defaultPaintTextureSize;
  const sourceHeight = record?.canvas?.height || defaultPaintTextureSize;
  const layoutType = ensureObjectTexturePaint(object)?.layoutType || getDefaultTextureLayoutType(object);
  const displayWidth = sourceWidth;
  const displayHeight = layoutType === 'sphere-equirect'
    ? Math.max(96, Math.round(sourceWidth / 2))
    : sourceHeight;

  return {
    layoutType,
    sourceWidth,
    sourceHeight,
    displayWidth,
    displayHeight
  };
}

function getSphereProjectionRect(metrics) {
  const inset = 1;

  return {
    x: inset,
    y: inset,
    width: Math.max(1, metrics.displayWidth - (inset * 2)),
    height: Math.max(1, metrics.displayHeight - (inset * 2))
  };
}

function getSphereProjectionFactor(v) {
  const latitude = (0.5 - Math.min(1, Math.max(0, v))) * Math.PI;
  return Math.max(0, Math.cos(latitude));
}

function getSphereProjectionX(u, v, metrics) {
  const rect = getSphereProjectionRect(metrics);
  const factor = getSphereProjectionFactor(v);

  return rect.x + (rect.width / 2) + ((Math.min(1, Math.max(0, u)) - 0.5) * rect.width * factor);
}

function getSphereProjectionY(v, metrics) {
  const rect = getSphereProjectionRect(metrics);
  return rect.y + (Math.min(1, Math.max(0, v)) * rect.height);
}

function getTextureSourcePointFromViewPoint(object, point, record) {
  const metrics = getTextureEditorMetrics(object, record);

  if (!point) {
    return null;
  }

  if (metrics.layoutType === 'sphere-equirect') {
    const rect = getSphereProjectionRect(metrics);
    const v = (point.y - rect.y) / rect.height;

    if (v < 0 || v > 1) {
      return null;
    }

    const factor = getSphereProjectionFactor(v);
    const halfWidth = (rect.width * factor) / 2;
    const centerX = rect.x + (rect.width / 2);

    if (halfWidth < 0.5) {
      if (Math.abs(point.x - centerX) > 3) {
        return null;
      }

      return {
        x: metrics.sourceWidth / 2,
        y: v * metrics.sourceHeight
      };
    }

    const left = centerX - halfWidth;
    const right = centerX + halfWidth;

    if (point.x < left || point.x > right) {
      return null;
    }

    const u = (point.x - left) / (right - left);

    return {
      x: u * metrics.sourceWidth,
      y: v * metrics.sourceHeight
    };
  }

  return {
    x: (point.x / metrics.displayWidth) * metrics.sourceWidth,
    y: (point.y / metrics.displayHeight) * metrics.sourceHeight
  };
}

function getBoxTexturePaintTargetAtViewPoint(object, point, record, metrics) {
  const displayRegions = getBoxTextureDisplayRegions(object, metrics);

  for (const displayRegion of displayRegions) {
    if (!isPointInPolygon(point, displayRegion.displayPolygon)) {
      continue;
    }

    const sourcePoint = mapPointBetweenQuadPolygons(
      point,
      displayRegion.displayPolygon,
      displayRegion.sourcePolygon
    );

    if (!sourcePoint) {
      continue;
    }

    const sourcePointClamped = {
      x: Math.min(record.canvas.width - 0.001, Math.max(0, sourcePoint.x)),
      y: Math.min(record.canvas.height - 0.001, Math.max(0, sourcePoint.y))
    };

    return {
      record,
      sourcePoint: sourcePointClamped,
      region: displayRegion.sourceRegion,
      sourcePolygon: displayRegion.sourcePolygon,
      displayRegion,
      metrics
    };
  }

  return null;
}

function getTextureRegionAtSourcePoint(object, point) {
  const texturePaint = ensureObjectTexturePaint(object);

  if (!texturePaint || !point) {
    return null;
  }

  return getTextureRegions(object, texturePaint.width, texturePaint.height)
    .find((region) => point.x >= region.x
      && point.x <= region.x + region.width
      && point.y >= region.y
      && point.y <= region.y + region.height) || null;
}

function getTexturePaintTargetAtViewPoint(object, viewPoint) {
  const record = ensurePaintCanvasRecord(object);

  if (!record) {
    return null;
  }

  const metrics = getTextureEditorMetrics(object, record);

  if (metrics.layoutType === 'box') {
    return getBoxTexturePaintTargetAtViewPoint(object, viewPoint, record, metrics);
  }

  const sourcePoint = getTextureSourcePointFromViewPoint(object, viewPoint, record);

  if (!sourcePoint) {
    return null;
  }

  const sourcePointClamped = {
    x: Math.min(record.canvas.width - 0.001, Math.max(0, sourcePoint.x)),
    y: Math.min(record.canvas.height - 0.001, Math.max(0, sourcePoint.y))
  };
  const region = getTextureRegionAtSourcePoint(object, sourcePointClamped);

  if (!region) {
    return null;
  }

  return {
    record,
    sourcePoint: sourcePointClamped,
    region,
    sourcePolygon: null,
    metrics
  };
}

function drawTextureGuideLine(context, x1, y1, x2, y2) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function drawSphereProjectionOutline(context, metrics) {
  const samples = 96;

  context.beginPath();

  for (let index = 0; index <= samples; index += 1) {
    const v = index / samples;
    const x = getSphereProjectionX(1, v, metrics);
    const y = getSphereProjectionY(v, metrics);

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  for (let index = samples; index >= 0; index -= 1) {
    const v = index / samples;
    context.lineTo(getSphereProjectionX(0, v, metrics), getSphereProjectionY(v, metrics));
  }

  context.closePath();
  context.stroke();
}

function drawSphereTextureGuides(context, metrics) {
  const columns = 12;
  const rows = 6;
  const samples = 80;

  context.save();
  context.lineWidth = Math.max(1, metrics.displayWidth / 320);
  context.strokeStyle = 'rgba(229, 225, 232, 0.88)';
  context.setLineDash([]);
  drawSphereProjectionOutline(context, metrics);
  context.setLineDash([6, 4]);

  for (let row = 1; row < rows; row += 1) {
    const v = row / rows;
    drawTextureGuideLine(
      context,
      getSphereProjectionX(0, v, metrics),
      getSphereProjectionY(v, metrics),
      getSphereProjectionX(1, v, metrics),
      getSphereProjectionY(v, metrics)
    );
  }

  for (let column = 1; column < columns; column += 1) {
    const u = column / columns;
    context.beginPath();

    for (let index = 0; index <= samples; index += 1) {
      const v = index / samples;
      const x = getSphereProjectionX(u, v, metrics);
      const y = getSphereProjectionY(v, metrics);

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    context.stroke();
  }

  context.restore();
}

function drawTextureGuides(context, object, metrics) {
  if (metrics.layoutType === 'sphere-equirect') {
    drawSphereTextureGuides(context, metrics);
    return;
  }

  const regions = getTextureDisplayRegions(object, metrics);

  context.save();
  context.lineWidth = Math.max(1, metrics.displayWidth / 256);
  context.strokeStyle = 'rgba(229, 225, 232, 0.82)';
  context.setLineDash([6, 4]);

  if (object.type === 'model') {
    const segments = getModelUvSegments(object);

    if (segments.length > 0) {
      segments.forEach((segment) => {
        drawTextureGuideLine(
          context,
          segment[0] * metrics.displayWidth,
          (1 - segment[1]) * metrics.displayHeight,
          segment[2] * metrics.displayWidth,
          (1 - segment[3]) * metrics.displayHeight
        );
      });
      context.restore();
      return;
    }
  }

  regions.forEach((region) => {
    if (region.displayPolygon && applyCanvasPolygonPath(context, region.displayPolygon)) {
      context.stroke();
      return;
    }

    context.strokeRect(region.x + 0.5, region.y + 0.5, region.width - 1, region.height - 1);
  });
  context.restore();
}

function getTriangleAffineTransform(sourceTriangle, targetTriangle) {
  const [sourceA, sourceB, sourceC] = sourceTriangle;
  const [targetA, targetB, targetC] = targetTriangle;
  const denominator = (sourceA.x * (sourceB.y - sourceC.y))
    + (sourceB.x * (sourceC.y - sourceA.y))
    + (sourceC.x * (sourceA.y - sourceB.y));

  if (Math.abs(denominator) < 0.000001) {
    return null;
  }

  const a = ((targetA.x * (sourceB.y - sourceC.y))
    + (targetB.x * (sourceC.y - sourceA.y))
    + (targetC.x * (sourceA.y - sourceB.y))) / denominator;
  const c = ((targetA.x * (sourceC.x - sourceB.x))
    + (targetB.x * (sourceA.x - sourceC.x))
    + (targetC.x * (sourceB.x - sourceA.x))) / denominator;
  const e = ((targetA.x * ((sourceB.x * sourceC.y) - (sourceC.x * sourceB.y)))
    + (targetB.x * ((sourceC.x * sourceA.y) - (sourceA.x * sourceC.y)))
    + (targetC.x * ((sourceA.x * sourceB.y) - (sourceB.x * sourceA.y)))) / denominator;
  const b = ((targetA.y * (sourceB.y - sourceC.y))
    + (targetB.y * (sourceC.y - sourceA.y))
    + (targetC.y * (sourceA.y - sourceB.y))) / denominator;
  const d = ((targetA.y * (sourceC.x - sourceB.x))
    + (targetB.y * (sourceA.x - sourceC.x))
    + (targetC.y * (sourceB.x - sourceA.x))) / denominator;
  const f = ((targetA.y * ((sourceB.x * sourceC.y) - (sourceC.x * sourceB.y)))
    + (targetB.y * ((sourceC.x * sourceA.y) - (sourceA.x * sourceC.y)))
    + (targetC.y * ((sourceA.x * sourceB.y) - (sourceB.x * sourceA.y)))) / denominator;

  return { a, b, c, d, e, f };
}

function getExpandedTriangle(triangle, amount = 0.35) {
  const center = triangle.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y
  }), { x: 0, y: 0 });
  center.x /= triangle.length;
  center.y /= triangle.length;

  return triangle.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.hypot(dx, dy);

    if (length < 0.000001) {
      return point;
    }

    return {
      x: point.x + ((dx / length) * amount),
      y: point.y + ((dy / length) * amount)
    };
  });
}

function applyTrianglePath(context, triangle) {
  context.beginPath();
  context.moveTo(triangle[0].x, triangle[0].y);
  context.lineTo(triangle[1].x, triangle[1].y);
  context.lineTo(triangle[2].x, triangle[2].y);
  context.closePath();
}

function drawWarpedTextureTriangle(context, sourceCanvas, sourceTriangle, displayTriangle) {
  const transform = getTriangleAffineTransform(sourceTriangle, displayTriangle);

  if (!transform) {
    return false;
  }

  context.save();
  applyTrianglePath(context, getExpandedTriangle(displayTriangle));
  context.clip();
  context.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
  context.drawImage(sourceCanvas, 0, 0);
  context.restore();
  return true;
}

function drawWarpedTextureQuad(context, sourceCanvas, sourcePolygon, displayPolygon) {
  if (!Array.isArray(sourcePolygon)
    || !Array.isArray(displayPolygon)
    || sourcePolygon.length < 4
    || displayPolygon.length < 4) {
    return false;
  }

  const triangles = [[0, 1, 2], [0, 2, 3]];

  return triangles
    .map((indexes) => drawWarpedTextureTriangle(
      context,
      sourceCanvas,
      indexes.map((index) => sourcePolygon[index]),
      indexes.map((index) => displayPolygon[index])
    ))
    .every(Boolean);
}

function drawBoxTexturePreview(context, object, sourceCanvas, metrics) {
  const regions = getBoxTextureDisplayRegions(object, metrics);

  regions.forEach((region) => {
    const sourceRegion = region.sourceRegion || region;

    if (region.sourcePolygon
      && region.displayPolygon
      && drawWarpedTextureQuad(context, sourceCanvas, region.sourcePolygon, region.displayPolygon)) {
      return;
    }

    context.save();

    if (region.displayPolygon) {
      applyCanvasPolygonPath(context, region.displayPolygon);
      context.clip();
    }

    context.drawImage(
      sourceCanvas,
      sourceRegion.x,
      sourceRegion.y,
      sourceRegion.width,
      sourceRegion.height,
      region.bounds?.x ?? region.x,
      region.bounds?.y ?? region.y,
      region.bounds?.width ?? region.width,
      region.bounds?.height ?? region.height
    );
    context.restore();
  });
}

function drawSphereTexturePreview(context, sourceCanvas, metrics) {
  const rect = getSphereProjectionRect(metrics);

  context.save();
  context.imageSmoothingEnabled = true;

  for (let row = 0; row < Math.ceil(rect.height); row += 1) {
    const v = (row + 0.5) / rect.height;
    const factor = getSphereProjectionFactor(v);
    const projectedWidth = Math.max(1, rect.width * factor);
    const sourceY = Math.min(metrics.sourceHeight - 1, Math.floor(v * metrics.sourceHeight));
    const targetX = rect.x + ((rect.width - projectedWidth) / 2);

    context.drawImage(
      sourceCanvas,
      0,
      sourceY,
      metrics.sourceWidth,
      1,
      targetX,
      rect.y + row,
      projectedWidth,
      1
    );
  }

  context.restore();
}

function drawTextureCanvasImage(context, object, record, metrics) {
  if (metrics.layoutType === 'sphere-equirect') {
    drawSphereTexturePreview(context, record.canvas, metrics);
    return;
  }

  if (metrics.layoutType === 'box') {
    drawBoxTexturePreview(context, object, record.canvas, metrics);
    return;
  }

  context.drawImage(record.canvas, 0, 0, metrics.displayWidth, metrics.displayHeight);
}

function renderTextureCanvasPreview(object, record) {
  const canvas = elements.textureCanvas;
  const context = canvas?.getContext('2d');

  if (!canvas || !context || !record) {
    return;
  }

  const metrics = getTextureEditorMetrics(object, record);

  if (canvas.width !== metrics.displayWidth) {
    canvas.width = metrics.displayWidth;
  }

  if (canvas.height !== metrics.displayHeight) {
    canvas.height = metrics.displayHeight;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  drawTextureCanvasImage(context, object, record, metrics);
  drawTextureGuides(context, object, metrics);

  const zoom = Math.min(textureZoomMax, Math.max(textureZoomMin, state.textureZoom));
  elements.textureCanvasStage?.style.setProperty('--texture-stage-width', `${canvas.width * zoom}px`);
  elements.textureCanvasStage?.style.setProperty('--texture-stage-height', `${canvas.height * zoom}px`);
}

function setTextureTool(tool) {
  state.textureTool = ['bucket', 'brush', 'eraser'].includes(tool) ? tool : 'bucket';
  renderTextureToolButtons();
}

function renderTextureToolButtons() {
  const buttons = {
    bucket: elements.textureBucketToolButton,
    brush: elements.textureBrushToolButton,
    eraser: elements.textureEraserToolButton
  };

  Object.entries(buttons).forEach(([tool, button]) => {
    button?.classList.toggle('tool-active', state.textureTool === tool);
    button?.setAttribute('aria-pressed', String(state.textureTool === tool));
  });
}

function isSelectedModelUvReady(object) {
  if (object?.type !== 'model') {
    return true;
  }

  const cacheEntry = getModelCacheEntry(object);
  return cacheEntry?.status === 'loaded' && cacheEntry.hasUv === true;
}

function renderTexturePanel() {
  renderTextureToolButtons();

  const object = getSelectedTextureObject();

  if (!object) {
    setTexturePanelMessage('Selecione um objeto pintável.');
    return;
  }

  if (object.type === 'model' && !isSelectedModelUvReady(object)) {
    const cacheEntry = getModelCacheEntry(object);
    const message = cacheEntry?.status === 'loaded' && cacheEntry.hasUv === false
      ? 'Modelo importado sem UV pintável.'
      : 'Carregando UV do modelo importado.';
    setTexturePanelMessage(message, {
      objectName: object.name,
      warning: cacheEntry?.hasUv === false
    });
    return;
  }

  const record = ensurePaintCanvasRecord(object);

  if (!record) {
    setTexturePanelMessage('Selecione um objeto pintável.');
    return;
  }

  setTexturePanelMessage('', { ready: true, objectName: object.name });
  renderTextureCanvasPreview(object, record);
}

function getTexturePointFromEvent(event) {
  const canvas = elements.textureCanvas;
  const rect = canvas.getBoundingClientRect();

  return {
    x: Math.min(canvas.width, Math.max(0, ((event.clientX - rect.left) / rect.width) * canvas.width)),
    y: Math.min(canvas.height, Math.max(0, ((event.clientY - rect.top) / rect.height) * canvas.height))
  };
}

function getActiveTexturePaintColor() {
  return state.textureTool === 'eraser' ? defaultTileColor : normalizeHexColor(state.texturePaintColor);
}

function fillTextureRegion(object, point) {
  const target = getTexturePaintTargetAtViewPoint(object, point);

  if (!target) {
    return false;
  }

  const context = target.record.canvas.getContext('2d');
  context.fillStyle = getActiveTexturePaintColor();

  if (target.sourcePolygon && applyCanvasPolygonPath(context, target.sourcePolygon)) {
    context.fill();
  } else {
    context.fillRect(
      Math.floor(target.region.x),
      Math.floor(target.region.y),
      Math.ceil(target.region.width),
      Math.ceil(target.region.height)
    );
  }

  return true;
}

function getSourceBrushSize(target) {
  const brushSize = Math.max(2, Number(state.textureBrushSize) || 14);

  if (!target?.metrics) {
    return brushSize;
  }

  if (target.displayRegion?.bounds && target.sourcePolygon) {
    const sourceBounds = getPolygonBounds(target.sourcePolygon);
    const scaleX = sourceBounds.width / Math.max(target.displayRegion.bounds.width, 1);
    const scaleY = sourceBounds.height / Math.max(target.displayRegion.bounds.height, 1);
    return Math.max(1, brushSize * ((scaleX + scaleY) / 2));
  }

  const scaleX = target.metrics.sourceWidth / target.metrics.displayWidth;
  const scaleY = target.metrics.sourceHeight / target.metrics.displayHeight;
  return Math.max(1, brushSize * ((scaleX + scaleY) / 2));
}

function drawTextureBrushSegment(object, fromPoint, toPoint) {
  const target = getTexturePaintTargetAtViewPoint(object, toPoint);
  const previousTarget = getTexturePaintTargetAtViewPoint(object, fromPoint);

  if (!target) {
    return false;
  }

  const fromSourcePoint = previousTarget?.region?.id === target.region.id
    ? previousTarget.sourcePoint
    : target.sourcePoint;
  const context = target.record.canvas.getContext('2d');
  const brushSize = getSourceBrushSize(target);

  context.save();
  context.beginPath();
  if (target.sourcePolygon) {
    applyCanvasPolygonPath(context, target.sourcePolygon);
  } else {
    context.rect(target.region.x, target.region.y, target.region.width, target.region.height);
  }
  context.clip();
  context.strokeStyle = getActiveTexturePaintColor();
  context.fillStyle = getActiveTexturePaintColor();
  context.lineWidth = brushSize;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(fromSourcePoint.x, fromSourcePoint.y);
  context.lineTo(target.sourcePoint.x, target.sourcePoint.y);
  context.stroke();
  context.beginPath();
  context.arc(target.sourcePoint.x, target.sourcePoint.y, brushSize / 2, 0, Math.PI * 2);
  context.fill();
  context.restore();

  return true;
}

function refreshPaintTexture(objectId) {
  const texture = viewport.paintTextureCache.get(objectId);

  if (texture) {
    texture.needsUpdate = true;
  }
}

function commitTexturePaint(object, record, options = {}) {
  persistPaintCanvas(object, record);
  refreshPaintTexture(object.id);
  syncProjectSceneToViewport();
  renderTextureCanvasPreview(object, record);

  if (options.recordHistory) {
    markEditorDirty();
  }
}

function applyTexturePaintAtPoint(object, point, previousPoint = point) {
  const record = ensurePaintCanvasRecord(object);
  const didPaint = state.textureTool === 'bucket'
    ? fillTextureRegion(object, point)
    : drawTextureBrushSegment(object, previousPoint, point);

  if (!didPaint || !record) {
    return false;
  }

  commitTexturePaint(object, record);
  return true;
}

function beginTextureCanvasPaint(event) {
  const object = getSelectedTextureObject();

  if (!object || isObjectEffectivelyLocked(object) || !isSelectedModelUvReady(object)) {
    return;
  }

  event.preventDefault();
  const point = getTexturePointFromEvent(event);
  const target = getTexturePaintTargetAtViewPoint(object, point);

  if (!target) {
    return;
  }

  textureInteraction.isPainting = true;
  textureInteraction.objectId = object.id;
  textureInteraction.lastPoint = point;
  textureInteraction.activeRegion = target.region.id;
  elements.textureCanvas.setPointerCapture(event.pointerId);
  applyTexturePaintAtPoint(object, point, point);

  if (state.textureTool === 'bucket') {
    endTextureCanvasPaint(event, { recordHistory: true });
  }
}

function updateTextureCanvasPaint(event) {
  if (!textureInteraction.isPainting || state.textureTool === 'bucket') {
    return;
  }

  const object = getObjectById(textureInteraction.objectId);

  if (!object || isObjectEffectivelyLocked(object)) {
    return;
  }

  event.preventDefault();
  const point = getTexturePointFromEvent(event);
  applyTexturePaintAtPoint(object, point, textureInteraction.lastPoint || point);
  textureInteraction.lastPoint = point;
}

function endTextureCanvasPaint(event, options = {}) {
  if (!textureInteraction.isPainting) {
    return;
  }

  const object = getObjectById(textureInteraction.objectId);
  const record = object ? ensurePaintCanvasRecord(object) : null;

  textureInteraction.isPainting = false;
  textureInteraction.objectId = null;
  textureInteraction.lastPoint = null;
  textureInteraction.activeRegion = null;

  if (elements.textureCanvas?.hasPointerCapture(event.pointerId)) {
    elements.textureCanvas.releasePointerCapture(event.pointerId);
  }

  if (object && record && options.recordHistory !== false) {
    commitTexturePaint(object, record, { recordHistory: true });
  }
}

function zoomTextureCanvas(factor, anchorEvent = null) {
  const scrollElement = elements.textureCanvasScroll;
  const previousZoom = Math.min(textureZoomMax, Math.max(textureZoomMin, state.textureZoom));
  const nextZoom = Math.min(textureZoomMax, Math.max(textureZoomMin, previousZoom * factor));

  if (Math.abs(nextZoom - previousZoom) < 0.001) {
    return;
  }

  const scrollRect = scrollElement?.getBoundingClientRect();
  const anchorViewportX = anchorEvent && scrollRect ? anchorEvent.clientX - scrollRect.left : (scrollElement?.clientWidth || 0) / 2;
  const anchorViewportY = anchorEvent && scrollRect ? anchorEvent.clientY - scrollRect.top : (scrollElement?.clientHeight || 0) / 2;
  const anchorCanvasX = scrollElement ? (scrollElement.scrollLeft + anchorViewportX) / previousZoom : 0;
  const anchorCanvasY = scrollElement ? (scrollElement.scrollTop + anchorViewportY) / previousZoom : 0;

  state.textureZoom = nextZoom;
  renderTexturePanel();

  if (scrollElement) {
    scrollElement.scrollLeft = Math.max(0, (anchorCanvasX * nextZoom) - anchorViewportX);
    scrollElement.scrollTop = Math.max(0, (anchorCanvasY * nextZoom) - anchorViewportY);
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
  } else if (propertyKey.startsWith('shape-') && selectedObject.type === 'tile') {
    selectedObject.shape = setTileShapeValue(selectedObject.shape, propertyKey, numericValue);
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
    const icon = createIconElement(getObjectIconId(object));
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

function isObjectInGroup(objectId) {
  return Boolean(getGroupContainingObject(objectId));
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
  const groupedObjectIds = [];
  const objectIdsToGroup = [];

  objectIds.forEach((objectId) => {
    if (isObjectInGroup(objectId)) {
      groupedObjectIds.push(objectId);
      return;
    }

    objectIdsToGroup.push(objectId);
  });

  if (objectIdsToGroup.length === 0) {
    showMessage('Desagrupe os itens antes de criar outro grupo com eles.');
    return;
  }

  const selectedObjectIds = new Set(objectIdsToGroup);

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
    objectIds: objectIdsToGroup
  });
  state.expandedGroupIds.add(groupId);

  selectGroup(groupId);
  renderObjectTree();
  renderPropertiesPanel();
  markEditorDirty();

  if (groupedObjectIds.length > 0) {
    showMessage('Grupo criado. Itens que ja estavam em grupos foram preservados.');
  }
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

  const ground = document.createElement('div');
  ground.className = 'thumbnail-ground';

  thumbnail.append(grid, object, ground);

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
    setView('editor');
    await refreshRecentProjects();
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
    setView('editor');
    await refreshRecentProjects();
    showMessage(`Projeto aberto: ${project.name}`);
  } catch (error) {
    showMessage(error.message || 'Nao foi possivel abrir o projeto.');
  }
}

async function openRecentProject(projectId) {
  try {
    const project = await window.engineFlat.projects.openRecent(projectId);
    setActiveProject(project);
    setView('editor');
    await refreshRecentProjects();
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

function getTilesetImageLoadStateKey(tileset) {
  if (!tileset?.imageDataUrl) {
    return 'no-image';
  }

  const cachedImage = viewport.imageCache.get(getTilesetImageCacheKey(tileset));

  if (!cachedImage) {
    return 'unrequested';
  }

  return cachedImage.complete && cachedImage.naturalWidth > 0 ? 'loaded' : 'loading';
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

  const textureCacheKey = [
    getTileMaterialKey(normalizedMaterial),
    getTilesetImageCacheKey(tileset),
    bounds.sourceX,
    bounds.sourceY,
    bounds.width,
    bounds.height
  ].join(':');
  const cachedTexture = viewport.textureCache.get(textureCacheKey);

  if (cachedTexture) {
    return cachedTexture;
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
  texture.userData.engineFlatCachedTexture = true;
  viewport.textureCache.set(textureCacheKey, texture);

  return texture;
}

function hasObjectPaintTexture(sceneObject) {
  return Boolean(isPaintableObjectType(sceneObject?.type) && sceneObject.texturePaint?.imageDataUrl);
}

function createPaintTextureMap(sceneObject) {
  if (!hasObjectPaintTexture(sceneObject)) {
    return null;
  }

  const record = ensurePaintCanvasRecord(sceneObject);

  if (!record) {
    return null;
  }

  const cachedTexture = viewport.paintTextureCache.get(sceneObject.id);

  if (cachedTexture) {
    return cachedTexture;
  }

  const texture = new THREE.CanvasTexture(record.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.userData.engineFlatPaintTexture = true;
  viewport.paintTextureCache.set(sceneObject.id, texture);

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

function createSceneObjectRenderMaterial(sceneObject) {
  const paintMap = createPaintTextureMap(sceneObject);

  if (paintMap) {
    return new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: paintMap,
      metalness: 0,
      roughness: 0.86,
      side: THREE.FrontSide
    });
  }

  if (sceneObject.type === 'tile') {
    return createTileRenderMaterial(sceneObject.material);
  }

  return new THREE.MeshStandardMaterial({
    color: getObjectMaterialColor(sceneObject),
    metalness: 0,
    roughness: 0.86,
    side: THREE.FrontSide
  });
}

function getTextureRegionById(sceneObject, regionId) {
  const texturePaint = ensureObjectTexturePaint(sceneObject);

  if (!texturePaint) {
    return null;
  }

  return getTextureRegions(sceneObject, texturePaint.width, texturePaint.height)
    .find((region) => region.id === regionId) || null;
}

function setGeometryUvAt(uvs, index, u, v) {
  uvs.setXY(index, Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v)));
}

function storeGeometryPaintBasis(geometry) {
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;

  if (!positions || !normals) {
    return;
  }

  geometry.userData.paintBasePositions = new Float32Array(positions.array);
  geometry.userData.paintBaseNormals = new Float32Array(normals.array);
}

function mapLocalUvToRegion(localU, localV, region, texturePaint) {
  const imageX = region.x + (Math.min(1, Math.max(0, localU)) * region.width);
  const imageY = region.y + ((1 - Math.min(1, Math.max(0, localV))) * region.height);

  return {
    u: imageX / texturePaint.width,
    v: 1 - (imageY / texturePaint.height)
  };
}

function applyBoxPaintUvs(geometry, sceneObject, width, height, depth) {
  const texturePaint = ensureObjectTexturePaint(sceneObject);
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const uvs = geometry.attributes.uv;

  if (!texturePaint || !positions || !normals || !uvs) {
    return;
  }

  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const safeWidth = Math.max(width, 0.0001);
  const safeHeight = Math.max(height, 0.0001);
  const safeDepth = Math.max(depth, 0.0001);
  const basePositions = geometry.userData.paintBasePositions;
  const baseNormals = geometry.userData.paintBaseNormals;

  for (let index = 0; index < positions.count; index += 1) {
    if (basePositions) {
      position.fromArray(basePositions, index * 3);
    } else {
      position.fromBufferAttribute(positions, index);
    }

    if (baseNormals) {
      normal.fromArray(baseNormals, index * 3);
    } else {
      normal.fromBufferAttribute(normals, index);
    }

    const absX = Math.abs(normal.x);
    const absY = Math.abs(normal.y);
    const absZ = Math.abs(normal.z);
    let faceId = 'z_pos';
    let localU = (position.x / safeWidth) + 0.5;
    let localV = (position.y / safeHeight) + 0.5;

    if (absY >= absX && absY >= absZ) {
      faceId = normal.y >= 0 ? 'y_pos' : 'y_neg';
      localU = (position.x / safeWidth) + 0.5;
      localV = (position.z / safeDepth) + 0.5;
    } else if (absX >= absZ) {
      faceId = normal.x >= 0 ? 'x_pos' : 'x_neg';
      localU = (position.z / safeDepth) + 0.5;
      localV = (position.y / safeHeight) + 0.5;
    } else {
      faceId = normal.z >= 0 ? 'z_pos' : 'z_neg';
      localU = (position.x / safeWidth) + 0.5;
      localV = (position.y / safeHeight) + 0.5;
    }

    const region = getTextureRegionById(sceneObject, faceId);

    if (region) {
      const uv = mapLocalUvToRegion(localU, localV, region, texturePaint);
      setGeometryUvAt(uvs, index, uv.u, uv.v);
    }
  }

  uvs.needsUpdate = true;
}

function createTileRenderGeometry(sceneObject, metrics) {
  const geometry = createTileGeometry(
    metrics.widthUnits,
    metrics.heightUnits,
    metrics.depthUnits,
    sceneObject.rounding,
    sceneObject.shape
  );

  if (hasObjectPaintTexture(sceneObject)) {
    applyBoxPaintUvs(geometry, sceneObject, metrics.widthUnits, metrics.heightUnits, metrics.depthUnits);
  }

  return geometry;
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

function getShapePolygonPoint(index, sides, width, depth) {
  if (sides === 4) {
    const corners = [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [width / 2, depth / 2],
      [-width / 2, depth / 2]
    ];
    const [x, z] = corners[index % corners.length];

    return { x, z };
  }

  const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / sides);

  return {
    x: Math.cos(angle) * (width / 2),
    z: Math.sin(angle) * (depth / 2)
  };
}

function getShapeFaceUv(point, width, depth) {
  return [
    (point.x / Math.max(width, 0.0001)) + 0.5,
    (point.z / Math.max(depth, 0.0001)) + 0.5
  ];
}

function createTaperedTileGeometry(width, height, depth, shape) {
  const normalizedShape = normalizeTileShape(shape);
  const sides = normalizedShape.sides;
  const bottomY = -height / 2;
  const topY = height / 2;
  const positions = [];
  const uvs = [];
  const bottom = [];
  const top = [];
  const perimeterU = [0];
  let perimeter = 0;

  for (let index = 0; index < sides; index += 1) {
    const point = getShapePolygonPoint(index, sides, width, depth);
    bottom.push({ x: point.x, y: bottomY, z: point.z });
    top.push({
      x: point.x,
      y: topY,
      z: point.z
    });
  }

  for (let index = 0; index < sides; index += 1) {
    const nextIndex = (index + 1) % sides;
    perimeter += Math.hypot(
      bottom[nextIndex].x - bottom[index].x,
      bottom[nextIndex].z - bottom[index].z
    );
    perimeterU.push(perimeter);
  }

  const safePerimeter = Math.max(perimeter, 0.0001);

  function pushVertex(vertex, uv) {
    positions.push(vertex.x, vertex.y, vertex.z);
    uvs.push(uv[0], uv[1]);
  }

  function pushTriangle(first, second, third, firstUv, secondUv, thirdUv) {
    pushVertex(first, firstUv);
    pushVertex(second, secondUv);
    pushVertex(third, thirdUv);
  }

  const bottomCenter = { x: 0, y: bottomY, z: 0 };
  const topCenter = { x: 0, y: topY, z: 0 };

  for (let index = 0; index < sides; index += 1) {
    const nextIndex = (index + 1) % sides;
    const currentBottomUv = getShapeFaceUv(bottom[index], width, depth);
    const nextBottomUv = getShapeFaceUv(bottom[nextIndex], width, depth);
    const currentTopUv = getShapeFaceUv(top[index], width, depth);
    const nextTopUv = getShapeFaceUv(top[nextIndex], width, depth);
    const currentU = perimeterU[index] / safePerimeter;
    const nextU = perimeterU[index + 1] / safePerimeter;

    pushTriangle(
      bottomCenter,
      bottom[index],
      bottom[nextIndex],
      [0.5, 0.5],
      currentBottomUv,
      nextBottomUv
    );

    pushTriangle(
      topCenter,
      top[nextIndex],
      top[index],
      [0.5, 0.5],
      nextTopUv,
      currentTopUv
    );
    pushTriangle(
      bottom[index],
      top[nextIndex],
      bottom[nextIndex],
      [currentU, 0],
      [nextU, 1],
      [nextU, 0]
    );
    pushTriangle(
      bottom[index],
      top[index],
      top[nextIndex],
      [currentU, 0],
      [currentU, 1],
      [nextU, 1]
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  storeGeometryPaintBasis(geometry);
  applyShapeFaceTapersToGeometry(geometry, width, height, depth, shape);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function deformTaperedBoxPosition(position, width, height, depth, shape) {
  const normalizedShape = normalizeTileShape(shape);
  const half = {
    x: width / 2,
    y: height / 2,
    z: depth / 2
  };
  shapeFaceDefinitions.forEach((face) => {
    const percent = normalizedShape.faces[face.id];

    if (percent <= 0.0001) {
      return;
    }

    const axisHalf = Math.max(half[face.axis], 0.0001);
    const influence = Math.min(1, Math.max(0, ((position[face.axis] * face.sign) + axisHalf) / (axisHalf * 2)));
    const scale = Math.max(0, 1 - ((percent / 100) * influence));

    ['x', 'y', 'z'].forEach((axis) => {
      if (axis !== face.axis) {
        position[axis] *= scale;
      }
    });
  });

}

function applyShapeFaceTapersToGeometry(geometry, width, height, depth, shape) {
  const positions = geometry.attributes.position;
  const position = new THREE.Vector3();

  for (let index = 0; index < positions.count; index += 1) {
    position.fromBufferAttribute(positions, index);
    deformTaperedBoxPosition(position, width, height, depth, shape);
    positions.setXYZ(index, position.x, position.y, position.z);
  }

  positions.needsUpdate = true;
}

function createTaperedBoxTileGeometry(width, height, depth, rounding, shape) {
  const geometry = hasTileRounding(rounding)
    ? createRoundedTileGeometry(width, height, depth, rounding)
    : new THREE.BoxGeometry(width, height, depth);

  storeGeometryPaintBasis(geometry);
  applyShapeFaceTapersToGeometry(geometry, width, height, depth, shape);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function createTileGeometry(width, height, depth, rounding, shape) {
  if (hasTileShape(shape)) {
    if (normalizeTileShape(shape).sides === 4) {
      return createTaperedBoxTileGeometry(width, height, depth, rounding, shape);
    }

    return createTaperedTileGeometry(width, height, depth, shape);
  }

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
  const metrics = {
    tileSizePixels,
    widthUnits,
    depthUnits,
    heightPixels,
    heightUnits
  };
  const geometry = createTileRenderGeometry(sceneObject, metrics);
  const material = createSceneObjectRenderMaterial(sceneObject);
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

function applyExportTransform(object3d, sceneObject, fallbackPosition = [0, 0, 0]) {
  const position = sceneObject.transform?.position || fallbackPosition;

  object3d.name = sceneObject.name || 'Objeto';
  object3d.position.set(position[0], position[1], position[2]);
  object3d.rotation.set(
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[0])),
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[1])),
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[2]))
  );
  object3d.scale.setScalar(getObjectUniformScale(sceneObject));
}

function createExportPrimitiveMesh(sceneObject) {
  const geometry = createPrimitiveGeometry(sceneObject);
  const material = createSceneObjectRenderMaterial(sceneObject);
  const mesh = new THREE.Mesh(geometry, material);

  applyExportTransform(mesh, sceneObject, [0.5, 0.5, 0.5]);
  return mesh;
}

function createExportModelMesh(sceneObject) {
  const group = new THREE.Group();
  const modelScene = cloneLoadedModelScene(sceneObject);

  group.add(modelScene || createModelPlaceholder(sceneObject));
  applyExportTransform(group, sceneObject, [0.5, 0.5, 0.5]);
  return group;
}

function createExportSceneObject(sceneObject) {
  if (sceneObject.type === 'tile') {
    return createExportTileMesh(sceneObject);
  }

  if (sceneObject.type === 'sphere') {
    return createExportPrimitiveMesh(sceneObject);
  }

  if (sceneObject.type === 'model') {
    return createExportModelMesh(sceneObject);
  }

  return null;
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

    if (isPaintableObjectType(sceneObject.type)) {
      const exportedObject = createExportSceneObject(sceneObject);

      if (exportedObject) {
        root.add(exportedObject);
      }
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

async function ensureProjectModelsLoaded() {
  const modelEntries = getSceneObjects()
    .filter((object) => object.type === 'model')
    .map((object) => getModelCacheEntry(object))
    .filter((entry) => entry?.promise);

  if (modelEntries.length > 0) {
    await Promise.all(modelEntries.map((entry) => entry.promise));
  }
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
    await ensureProjectModelsLoaded();
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

function getTileRenderMetrics(sceneObject) {
  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  const widthUnits = (sceneObject.size?.widthPixels || tileSizePixels) / tileSizePixels;
  const depthUnits = (sceneObject.size?.depthPixels || tileSizePixels) / tileSizePixels;
  const heightPixels = sceneObject.size?.heightPixels || 1;
  const heightUnits = getTileHeightUnits(tileSizePixels, heightPixels);

  return {
    tileSizePixels,
    widthUnits,
    depthUnits,
    heightPixels,
    heightUnits
  };
}

function getTileGeometryKey(sceneObject, metrics = getTileRenderMetrics(sceneObject)) {
  const rounding = normalizeTileRounding(sceneObject.rounding);
  const shape = normalizeTileShape(sceneObject.shape);
  const roundingKey = roundingEdgeIds.map((edgeId) => rounding.edges[edgeId]).join(',');
  const shapeFacesKey = shapeFaceIds.map((faceId) => shape.faces[faceId]).join(',');
  const texturePaint = normalizeTexturePaint(sceneObject.texturePaint, getDefaultTextureLayoutType(sceneObject));
  const paintKey = hasObjectPaintTexture(sceneObject)
    ? `${texturePaint.layoutType}:${texturePaint.width}x${texturePaint.height}`
    : 'no-paint';

  return [
    metrics.tileSizePixels,
    metrics.widthUnits,
    metrics.heightUnits,
    metrics.depthUnits,
    roundingKey,
    shape.sides,
    shapeFacesKey,
    paintKey
  ].join('|');
}

function removeTileSelectionOutline(mesh) {
  const currentOutline = mesh.getObjectByName('tile-selection-outline');

  if (!currentOutline) {
    return;
  }

  mesh.remove(currentOutline);
  currentOutline.geometry.dispose();
  currentOutline.material.dispose();
}

function updateTileMeshGeometry(mesh, sceneObject, metrics) {
  const geometryKey = getTileGeometryKey(sceneObject, metrics);

  if (mesh.userData.geometryKey === geometryKey) {
    return;
  }

  const previousGeometry = mesh.geometry;
  removeTileSelectionOutline(mesh);
  mesh.geometry = createTileRenderGeometry(sceneObject, metrics);
  mesh.userData.geometryKey = geometryKey;

  if (previousGeometry) {
    previousGeometry.dispose();
  }
}

function getTileMeshMaterialKey(sceneObject) {
  if (hasObjectPaintTexture(sceneObject)) {
    const texturePaint = normalizeTexturePaint(sceneObject.texturePaint, getDefaultTextureLayoutType(sceneObject));
    return `paint:${sceneObject.id}:${texturePaint.layoutType}:${texturePaint.width}x${texturePaint.height}`;
  }

  const normalizedMaterial = normalizeTileMaterial(sceneObject.material);

  if (!normalizedMaterial.texture) {
    return getTileMaterialKey(normalizedMaterial);
  }

  const tileset = getTilesetById(normalizedMaterial.texture.tilesetId);
  const tileSizePixels = state.activeProject?.grid?.tileSizePixels || defaultTileSizePixels;
  const tilesetKey = tileset?.imageDataUrl ? getTilesetImageCacheKey(tileset) : 'missing';
  const imageLoadKey = tileset ? getTilesetImageLoadStateKey(tileset) : 'missing';

  return `${getTileMaterialKey(normalizedMaterial)}:${tileSizePixels}:${tilesetKey}:${imageLoadKey}`;
}

function updateTileMeshMaterial(mesh, sceneObject) {
  const materialKey = getTileMeshMaterialKey(sceneObject);

  if (mesh.userData.materialKey === materialKey) {
    return;
  }

  const previousMaterial = mesh.material;
  mesh.material = createSceneObjectRenderMaterial(sceneObject);
  mesh.userData.materialKey = materialKey;

  if (previousMaterial) {
    disposeMaterial(previousMaterial);
  }
}

function updateTileMeshTransform(mesh, sceneObject, metrics) {
  const position = sceneObject.transform?.position || [0, metrics.heightUnits / 2, 0];

  mesh.name = sceneObject.name;
  mesh.userData.objectId = sceneObject.id;
  mesh.userData.baseColor = hasObjectPaintTexture(sceneObject) ? '#ffffff' : getTileMaterialPreviewColor(sceneObject.material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[0])),
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[1])),
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[2]))
  );
  mesh.scale.setScalar(getObjectUniformScale(sceneObject));
  setTileMeshSelected(mesh, state.selectedObjectIds.has(sceneObject.id) || getSelectedGroup()?.objectIds.includes(sceneObject.id));
}

function updateTileMesh(mesh, sceneObject) {
  const metrics = getTileRenderMetrics(sceneObject);

  updateTileMeshGeometry(mesh, sceneObject, metrics);
  updateTileMeshMaterial(mesh, sceneObject);
  updateTileMeshTransform(mesh, sceneObject, metrics);
}

function createTileMesh(sceneObject) {
  const metrics = getTileRenderMetrics(sceneObject);
  const geometry = createTileRenderGeometry(sceneObject, metrics);
  const material = createSceneObjectRenderMaterial(sceneObject);
  const mesh = new THREE.Mesh(geometry, material);

  mesh.userData.geometryKey = getTileGeometryKey(sceneObject, metrics);
  mesh.userData.materialKey = getTileMeshMaterialKey(sceneObject);
  updateTileMeshTransform(mesh, sceneObject, metrics);

  return mesh;
}

function getPrimitiveGeometryKey(sceneObject) {
  const texturePaint = normalizeTexturePaint(sceneObject.texturePaint, getDefaultTextureLayoutType(sceneObject));
  const paintKey = hasObjectPaintTexture(sceneObject)
    ? `${texturePaint.layoutType}:${texturePaint.width}x${texturePaint.height}`
    : 'no-paint';

  return `${sceneObject.type}:${paintKey}`;
}

function getSceneObjectMaterialKey(sceneObject) {
  if (sceneObject.type === 'tile') {
    return getTileMeshMaterialKey(sceneObject);
  }

  if (hasObjectPaintTexture(sceneObject)) {
    const texturePaint = normalizeTexturePaint(sceneObject.texturePaint, getDefaultTextureLayoutType(sceneObject));
    return `paint:${sceneObject.id}:${texturePaint.layoutType}:${texturePaint.width}x${texturePaint.height}`;
  }

  return `color:${getObjectMaterialColor(sceneObject)}`;
}

function createPrimitiveGeometry(sceneObject) {
  return new THREE.SphereGeometry(0.5, 48, 24);
}

function updateSceneObjectMeshTransform(mesh, sceneObject) {
  const position = sceneObject.transform?.position || [0, 0, 0];

  mesh.name = sceneObject.name;
  mesh.userData.objectId = sceneObject.id;
  mesh.userData.baseColor = hasObjectPaintTexture(sceneObject) ? '#ffffff' : getObjectMaterialColor(sceneObject);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[0])),
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[1])),
    THREE.MathUtils.degToRad(rotationOrZero(sceneObject.transform?.rotation?.[2]))
  );
  mesh.scale.setScalar(getObjectUniformScale(sceneObject));
}

function createPrimitiveMesh(sceneObject) {
  const geometry = createPrimitiveGeometry(sceneObject);
  const material = createSceneObjectRenderMaterial(sceneObject);
  const mesh = new THREE.Mesh(geometry, material);

  mesh.userData.geometryKey = getPrimitiveGeometryKey(sceneObject);
  mesh.userData.materialKey = getSceneObjectMaterialKey(sceneObject);
  updateSceneObjectMeshTransform(mesh, sceneObject);
  setTileMeshSelected(mesh, state.selectedObjectIds.has(sceneObject.id) || getSelectedGroup()?.objectIds.includes(sceneObject.id));

  return mesh;
}

function updatePrimitiveMesh(mesh, sceneObject) {
  const geometryKey = getPrimitiveGeometryKey(sceneObject);
  const materialKey = getSceneObjectMaterialKey(sceneObject);

  if (mesh.userData.geometryKey !== geometryKey) {
    const previousGeometry = mesh.geometry;
    removeTileSelectionOutline(mesh);
    mesh.geometry = createPrimitiveGeometry(sceneObject);
    mesh.userData.geometryKey = geometryKey;
    previousGeometry?.dispose();
  }

  if (mesh.userData.materialKey !== materialKey) {
    const previousMaterial = mesh.material;
    mesh.material = createSceneObjectRenderMaterial(sceneObject);
    mesh.userData.materialKey = materialKey;
    disposeMaterial(previousMaterial);
  }

  updateSceneObjectMeshTransform(mesh, sceneObject);
  setTileMeshSelected(mesh, state.selectedObjectIds.has(sceneObject.id) || getSelectedGroup()?.objectIds.includes(sceneObject.id));
}

function getModelCacheKey(sceneObject) {
  const sourceModel = normalizeSourceModel(sceneObject.sourceModel);
  return `${sourceModel.name}:${sourceModel.format}:${sourceModel.dataUrl.length}`;
}

function geometryHasUv(geometry) {
  return Boolean(geometry?.attributes?.uv && geometry.attributes.uv.count > 0);
}

function modelSceneHasUv(root) {
  let hasUv = false;

  root.traverse((child) => {
    if (child.isMesh && geometryHasUv(child.geometry)) {
      hasUv = true;
    }
  });

  return hasUv;
}

function addUvSegment(segments, first, second, maxSegments) {
  if (segments.length >= maxSegments) {
    return;
  }

  segments.push([first.x, first.y, second.x, second.y]);
}

function extractModelUvSegments(root) {
  const maxSegments = 2400;
  const segments = [];

  root.traverse((child) => {
    const geometry = child.isMesh ? child.geometry : null;
    const uv = geometry?.attributes?.uv;

    if (!uv || segments.length >= maxSegments) {
      return;
    }

    const index = geometry.index;
    const vertexCount = index ? index.count : uv.count;
    const getUv = (vertexIndex) => {
      const sourceIndex = index ? index.getX(vertexIndex) : vertexIndex;
      return new THREE.Vector2(uv.getX(sourceIndex), uv.getY(sourceIndex));
    };

    for (let vertexIndex = 0; vertexIndex + 2 < vertexCount && segments.length < maxSegments; vertexIndex += 3) {
      const first = getUv(vertexIndex);
      const second = getUv(vertexIndex + 1);
      const third = getUv(vertexIndex + 2);

      addUvSegment(segments, first, second, maxSegments);
      addUvSegment(segments, second, third, maxSegments);
      addUvSegment(segments, third, first, maxSegments);
    }
  });

  return segments;
}

function getModelCacheEntry(sceneObject) {
  if (!sceneObject || sceneObject.type !== 'model') {
    return null;
  }

  const sourceModel = normalizeSourceModel(sceneObject.sourceModel);
  const cacheKey = getModelCacheKey(sceneObject);
  let entry = viewport.modelCache.get(cacheKey);

  if (entry) {
    return entry;
  }

  entry = {
    status: sourceModel.dataUrl ? 'loading' : 'missing',
    sourceKey: cacheKey,
    scene: null,
    hasUv: false,
    uvSegments: [],
    error: null,
    promise: null
  };
  viewport.modelCache.set(cacheKey, entry);

  if (!sourceModel.dataUrl) {
    return entry;
  }

  entry.promise = new Promise((resolve) => {
    if (sourceModel.format === 'obj') {
      fetch(sourceModel.dataUrl)
        .then((response) => response.text())
        .then((content) => {
          const scene = objLoader.parse(content);
          entry.status = 'loaded';
          entry.scene = scene;
          entry.hasUv = modelSceneHasUv(scene);
          entry.uvSegments = extractModelUvSegments(scene);
          syncProjectSceneToViewport();
          renderTexturePanel();
          resolve(entry);
        })
        .catch((error) => {
          entry.status = 'error';
          entry.error = error;
          showMessage('Não foi possível carregar o modelo .obj importado.');
          renderTexturePanel();
          resolve(entry);
        });
      return;
    }

    gltfLoader.load(
      sourceModel.dataUrl,
      (gltf) => {
        entry.status = 'loaded';
        entry.scene = gltf.scene;
        entry.hasUv = modelSceneHasUv(gltf.scene);
        entry.uvSegments = extractModelUvSegments(gltf.scene);
        syncProjectSceneToViewport();
        renderTexturePanel();
        resolve(entry);
      },
      undefined,
      (error) => {
        entry.status = 'error';
        entry.error = error;
        showMessage('Não foi possível carregar o modelo importado.');
        renderTexturePanel();
        resolve(entry);
      }
    );
  });

  return entry;
}

function getModelUvSegments(sceneObject) {
  return getModelCacheEntry(sceneObject)?.uvSegments || [];
}

function cloneLoadedModelScene(sceneObject) {
  const entry = getModelCacheEntry(sceneObject);

  if (entry?.status !== 'loaded' || !entry.scene) {
    return null;
  }

  const clone = entry.scene.clone(true);

  clone.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.geometry = child.geometry?.clone();
    child.material = createSceneObjectRenderMaterial(sceneObject);
    child.userData = {
      ...child.userData,
      objectId: sceneObject.id
    };
    child.castShadow = true;
    child.receiveShadow = true;
  });

  return clone;
}

function clearGroupChildren(group) {
  [...group.children].forEach((child) => {
    group.remove(child);
    disposeObjectTree(child);
  });
}

function createModelPlaceholder(sceneObject) {
  const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const material = new THREE.MeshStandardMaterial({
    color: getObjectMaterialColor(sceneObject),
    metalness: 0,
    roughness: 0.86,
    transparent: true,
    opacity: 0.46
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.userData.objectId = sceneObject.id;
  return mesh;
}

function updateModelGroupContent(group, sceneObject) {
  const entry = getModelCacheEntry(sceneObject);
  const materialKey = getSceneObjectMaterialKey(sceneObject);
  const contentKey = `${entry?.sourceKey || 'missing'}:${entry?.status || 'unknown'}:${materialKey}`;

  if (group.userData.contentKey === contentKey) {
    return;
  }

  clearGroupChildren(group);

  const modelScene = cloneLoadedModelScene(sceneObject);
  group.add(modelScene || createModelPlaceholder(sceneObject));
  group.userData.contentKey = contentKey;
}

function createModelMesh(sceneObject) {
  const group = new THREE.Group();

  group.userData.objectId = sceneObject.id;
  updateModelGroupContent(group, sceneObject);
  updateSceneObjectMeshTransform(group, sceneObject);

  return group;
}

function updateModelMesh(group, sceneObject) {
  updateModelGroupContent(group, sceneObject);
  updateSceneObjectMeshTransform(group, sceneObject);
}

function createSceneObjectMesh(sceneObject) {
  if (sceneObject.type === 'tile') {
    return createTileMesh(sceneObject);
  }

  if (sceneObject.type === 'sphere') {
    return createPrimitiveMesh(sceneObject);
  }

  if (sceneObject.type === 'model') {
    return createModelMesh(sceneObject);
  }

  return null;
}

function updateSceneObjectMesh(mesh, sceneObject) {
  if (sceneObject.type === 'tile') {
    updateTileMesh(mesh, sceneObject);
    return;
  }

  if (sceneObject.type === 'sphere') {
    updatePrimitiveMesh(mesh, sceneObject);
    return;
  }

  if (sceneObject.type === 'model') {
    updateModelMesh(mesh, sceneObject);
  }
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

    if (item.map && !item.map.userData?.engineFlatCachedTexture && !item.map.userData?.engineFlatPaintTexture) {
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
  viewport.paintTextureCache.forEach((texture) => texture.dispose());
  viewport.paintTextureCache.clear();
  viewport.paintCanvasCache.clear();
  viewport.modelCache.clear();
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

  if (object.type === 'model') {
    const visualBounds = getSceneObjectVisualTransformBounds(object);

    if (visualBounds) {
      return visualBounds;
    }
  }

  const scale = getObjectUniformScale(object);

  return {
    center: new THREE.Vector3(position[0], position[1], position[2]),
    half: new THREE.Vector3(0.5 * scale, 0.5 * scale, 0.5 * scale),
    radius: Math.max(scale, 1) * 0.68
  };
}

function getSceneObjectVisualTransformBounds(object) {
  const mesh = viewport.sceneObjectMeshes.get(object.id);

  if (!mesh) {
    return null;
  }

  mesh.updateWorldMatrix(true, true);

  const box = new THREE.Box3().setFromObject(mesh);

  if (box.isEmpty()) {
    return null;
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();

  box.getCenter(center);
  box.getSize(size);

  const half = size.multiplyScalar(0.5);
  const radius = Math.max(half.x * 2, half.y * 2, half.z * 2, 0.25) * 0.68;

  return { center, half, radius };
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

  group.position.copy(center);

  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.012, 8, 96),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      depthTest: false
    })
  );

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

function getShapeFaceDefinition(faceId) {
  return shapeFaceDefinitions.find((face) => face.id === faceId) || shapeFaceDefinitions[0];
}

function getShapeTaperBasis(tile, bounds, faceId = 'y_pos') {
  const face = getShapeFaceDefinition(faceId);
  const origin = bounds.center.clone();
  const direction = getTransformAxisDirection(face.axis, face.sign);

  origin[face.axis] += face.sign * bounds.half[face.axis];

  return { origin, direction };
}

function createShapeHandle(tile, face, bounds) {
  const group = new THREE.Group();
  const { origin, direction } = getShapeTaperBasis(tile, bounds, face.id);
  const color = getCssColor('--md-sys-color-tertiary');
  const handleData = {
    shapeHandle: {
      targetType: 'object',
      objectId: tile.id,
      shapeHandleId: `face:${face.id}`,
      shapeFaceId: face.id,
      propertyKey: `shape-face-${face.id}`
    }
  };
  const tipPosition = origin.clone().add(direction.clone().multiplyScalar(0.56));
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
    new THREE.OctahedronGeometry(0.15, 0),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      depthTest: false
    })
  );
  const hitTarget = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 18, 14),
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
  prepareTransformHandlePart(grip, 0.92, 1, 1.18);
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

  if (state.viewportTool === 'shape' && !isGroupTarget && selectedObject?.type === 'tile') {
    shapeFaceDefinitions.forEach((face) => {
      handleGroup.add(createShapeHandle(selectedObject, face, bounds));
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
      disposeObjectTree(viewport.lightMarker);
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
      disposeObjectTree(viewport.lightMarker);
      viewport.lightMarker = null;
    }
  }

  const previousMeshes = viewport.sceneObjectMeshes;
  const nextMeshes = new Map();

  getSceneObjects()
    .filter((object) => isPaintableObjectType(object.type) && isObjectEffectivelyVisible(object))
    .forEach((object) => {
      let mesh = previousMeshes.get(object.id);

      if (mesh && mesh.userData.sceneObjectType !== object.type) {
        viewport.objectGroup.remove(mesh);
        disposeObjectTree(mesh);
        mesh = null;
      }

      if (!mesh) {
        mesh = createSceneObjectMesh(object);
      } else {
        updateSceneObjectMesh(mesh, object);
      }

      if (mesh) {
        mesh.userData.sceneObjectType = object.type;
        viewport.objectGroup.add(mesh);
        nextMeshes.set(object.id, mesh);
      }
    });

  previousMeshes.forEach((mesh, objectId) => {
    if (nextMeshes.has(objectId)) {
      return;
    }

    viewport.objectGroup.remove(mesh);
    disposeObjectTree(mesh);
  });

  viewport.sceneObjectMeshes = nextMeshes;
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
  return state.activeTool === 'tile' || state.activeTool === 'sphere' || state.activeTool === 'bucket';
}

function renderViewportToolButtons() {
  const buttons = {
    select: elements.viewportSelectToolButton,
    move: elements.viewportMoveToolButton,
    rotate: elements.viewportRotateToolButton,
    scale: elements.viewportScaleToolButton,
    round: elements.viewportRoundToolButton,
    shape: elements.viewportShapeToolButton
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
    elements.addSphereButton.classList.remove('tool-active');
    elements.addSphereButton.setAttribute('aria-pressed', 'false');
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
  setPropertyAccordionOpen(getPropertySectionKeyForViewportTool());
}

function configureViewportControlsForTool() {
  if (!viewport.controls) {
    return;
  }

  viewport.controls.enabled = true;
  viewport.controls.noRotate = false;
  viewport.controls.noZoom = false;
  viewport.controls.noPan = false;

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

function setViewportControlsInteractionEnabled(isEnabled) {
  if (!viewport.controls) {
    return;
  }

  viewport.controls.enabled = true;
  viewport.controls.noRotate = !isEnabled;
  viewport.controls.noZoom = !isEnabled;
  viewport.controls.noPan = !isEnabled;
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
  elements.addSphereButton.classList.toggle('tool-active', state.activeTool === 'sphere');
  elements.addSphereButton.setAttribute('aria-pressed', String(state.activeTool === 'sphere'));
  elements.stampToolButton.classList.toggle('tool-active', state.activeTool === 'tile');
  elements.stampToolButton.setAttribute('aria-pressed', String(state.activeTool === 'tile'));
  elements.bucketToolButton.classList.toggle('tool-active', state.activeTool === 'bucket');
  elements.bucketToolButton.setAttribute('aria-pressed', String(state.activeTool === 'bucket'));
  elements.sceneViewport.style.cursor = isTileEditingToolActive() ? 'crosshair' : '';

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

function getSphereAtCell(cellX, cellZ) {
  return getSceneObjects().find((object) => {
    if (object.type !== 'sphere') {
      return false;
    }

    const position = object.transform?.position || [0.5, 0.5, 0.5];
    return Math.floor(position[0]) === cellX && Math.floor(position[2]) === cellZ;
  }) || null;
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
    shape: normalizeTileShape(),
    visible: true,
    locked: false,
    moveSnap: true,
    rotateSnap: true,
    resizeSnap: true
  };
}

function getNextObjectName(prefix, type) {
  const count = getSceneObjects().filter((object) => object.type === type).length + 1;
  return `${prefix} ${count}`;
}

function createSphereObject(cellX = 0, cellZ = 0, name = getNextObjectName('Esfera', 'sphere')) {
  return {
    id: `sphere-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    type: 'sphere',
    gridPosition: [cellX, cellZ],
    transform: {
      position: [cellX + 0.5, 0.5, cellZ + 0.5],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    },
    material: { color: defaultTileColor },
    texturePaint: normalizeTexturePaint({}, 'sphere-equirect'),
    visible: true,
    locked: false,
    moveSnap: true,
    rotateSnap: true
  };
}

function createImportedModelObject(file, dataUrl) {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'glb';

  return {
    id: `model-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name.replace(/\.[^.]+$/, '') || getNextObjectName('Modelo', 'model'),
    type: 'model',
    transform: {
      position: [0.5, 0.5, 0.5],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    },
    material: { color: defaultTileColor },
    texturePaint: normalizeTexturePaint({}, 'uv'),
    sourceModel: {
      name: file.name,
      format: extension,
      dataUrl
    },
    visible: true,
    locked: false,
    moveSnap: true,
    rotateSnap: true
  };
}

function addSceneObject(object) {
  if (!state.activeProject || !object) {
    showMessage('Abra ou crie um projeto antes de adicionar objetos.');
    return;
  }

  setActiveTool('select');
  state.activeProject.scene.objects.push(normalizeSceneObject(object, state.activeProject.grid.tileSizePixels));
  setSelectedObjects([object.id], object.id);
  syncProjectSceneToViewport();
  renderObjectTree();
  renderPropertiesPanel();
  markEditorDirty();
}

function triggerModelImport() {
  if (!state.activeProject) {
    showMessage('Abra ou crie um projeto antes de importar um modelo.');
    return;
  }

  elements.modelImportInput.value = '';
  elements.modelImportInput.click();
}

async function importModelFile(file) {
  if (!file) {
    return;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();

  if (!['glb', 'gltf', 'obj'].includes(extension)) {
    showMessage('Importe um arquivo .glb, .gltf autocontido ou .obj simples.');
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  const object = createImportedModelObject(file, dataUrl);

  addSceneObject(object);
  showMessage(`Modelo importado: ${file.name}`);
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

function placeSphereAtCell(cellX, cellZ) {
  if (!state.activeProject) {
    showMessage('Abra ou crie um projeto antes de adicionar esferas.');
    return;
  }

  const existingTile = getTileAtCell(cellX, cellZ);

  if (existingTile) {
    setSelectedObjects([existingTile.id], existingTile.id);
    renderObjectTree();
    renderPropertiesPanel();
    showMessage('Quadrado ocupado. Escolha um quadrado vazio para adicionar a esfera.');
    return;
  }

  const existingSphere = getSphereAtCell(cellX, cellZ);

  if (existingSphere) {
    setSelectedObjects([existingSphere.id], existingSphere.id);
    renderObjectTree();
    renderPropertiesPanel();
    return;
  }

  const sphereCount = getSceneObjects().filter((object) => object.type === 'sphere').length + 1;
  const sphereObject = createSphereObject(cellX, cellZ, `Esfera ${sphereCount}`);

  state.activeProject.scene.objects.push(sphereObject);
  setSelectedObjects([sphereObject.id], sphereObject.id);
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
    const previewSurface = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fillMaterial.clone());
    previewSurface.rotation.x = -Math.PI / 2;
    previewSurface.position.set(cell.cellX + 0.5, 0.045, cell.cellZ + 0.5);
    previewSurface.renderOrder = 12;
    group.add(previewSurface);

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

function activateSpherePaintTool() {
  if (!state.activeProject) {
    showMessage('Abra ou crie um projeto antes de adicionar esferas.');
    return;
  }

  setActiveTool('sphere');
  showMessage(state.activeTool === 'sphere'
    ? 'Clique em um quadrado vazio da grade para adicionar uma esfera.'
    : 'Ferramenta Esfera desativada.');
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
    || userData.shapeHandle
    || null;

  return handle
    ? {
      ...handle,
      target
    }
    : null;
}

function getViewportObjectIntersection(event) {
  const sceneMeshes = [...viewport.sceneObjectMeshes.values()];
  const lightMeshes = [];

  if (viewport.lightMarker) {
    viewport.lightMarker.traverse((child) => {
      if (child.isMesh && child.userData?.objectId) {
        lightMeshes.push(child);
      }
    });
  }

  if (sceneMeshes.length === 0 && lightMeshes.length === 0) {
    return null;
  }

  updateViewportRayFromPointerEvent(event);
  const intersections = [
    ...viewportInteraction.raycaster.intersectObjects(sceneMeshes, true),
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

function getRotationQuaternion(rotation = [0, 0, 0]) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(rotationOrZero(rotation[0])),
    THREE.MathUtils.degToRad(rotationOrZero(rotation[1])),
    THREE.MathUtils.degToRad(rotationOrZero(rotation[2])),
    'XYZ'
  ));
}

function getRotationDegreesFromQuaternion(quaternion) {
  const euler = new THREE.Euler().setFromQuaternion(quaternion.normalize(), 'XYZ');

  return [euler.x, euler.y, euler.z].map((radians) => {
    const degrees = THREE.MathUtils.radToDeg(radians);
    const rounded = Number(degrees.toFixed(3));
    return Object.is(rounded, -0) ? 0 : rounded;
  });
}

function getRotationWithWorldDelta(startRotation, axisWorld, deltaDegrees) {
  const rotationQuaternion = getRotationQuaternion(startRotation);
  const deltaQuaternion = new THREE.Quaternion().setFromAxisAngle(
    axisWorld.clone().normalize(),
    THREE.MathUtils.degToRad(deltaDegrees)
  );

  return getRotationDegreesFromQuaternion(rotationQuaternion.premultiply(deltaQuaternion));
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

function applyGroupWorldRotationFromStart(group, startObjects, center, axisWorld, deltaDegrees) {
  const radians = THREE.MathUtils.degToRad(deltaDegrees);
  const normalizedAxis = axisWorld.clone().normalize();

  startObjects.forEach((startObject) => {
    const object = getObjectById(startObject.id);

    if (!object) {
      return;
    }

    const nextPosition = startObject.position.clone()
      .sub(center)
      .applyAxisAngle(normalizedAxis, radians)
      .add(center);

    setObjectPositionFromVector(object, nextPosition);
    object.transform.rotation = getRotationWithWorldDelta(startObject.rotation, normalizedAxis, deltaDegrees);
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
      setViewportControlsInteractionEnabled(false);
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
    setViewportControlsInteractionEnabled(false);
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
      startRotation: [...(group.transform?.rotation || [0, 0, 0])],
      startAxisWorld: getAxisVectorByIndex(getTransformAxisIndex(handle.axis))
    };

    if (viewport.controls) {
      setViewportControlsInteractionEnabled(false);
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
    setViewportControlsInteractionEnabled(false);
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

    const pointerDelta = (event.clientX - drag.startClientX) + (drag.startClientY - event.clientY);
    const snappedDelta = Number(snapRotationDegrees(pointerDelta * 0.5, group).toFixed(3));
    const rotation = getRotationWithWorldDelta(drag.startRotation, drag.startAxisWorld, snappedDelta);
    group.transform = {
      ...group.transform,
      rotation
    };
    applyGroupWorldRotationFromStart(
      group,
      drag.startObjects,
      drag.startCenter,
      drag.startAxisWorld,
      snappedDelta
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

  const pointerDelta = (event.clientX - drag.startClientX) + (drag.startClientY - event.clientY);
  const snappedDelta = Number(snapRotationDegrees(pointerDelta * 0.5, object).toFixed(3));
  const rotation = getRotationWithWorldDelta(
    drag.startRotation,
    getAxisVectorByIndex(getTransformAxisIndex(drag.axis)),
    snappedDelta
  );
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
    setViewportControlsInteractionEnabled(false);
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

function beginShapeDrag(event, handle) {
  const object = getObjectById(handle.objectId);

  if (!object || object.type !== 'tile' || isObjectEffectivelyLocked(object)) {
    return false;
  }

  const bounds = getSelectedTransformBounds(object);
  const faceId = shapeFaceIds.includes(handle.shapeFaceId) ? handle.shapeFaceId : 'y_pos';
  const { origin, direction } = getShapeTaperBasis(object, bounds, faceId);
  const originScreen = projectWorldToViewportPoint(origin);
  const tipScreen = projectWorldToViewportPoint(origin.clone().add(direction));
  const screenDirection = tipScreen.clone().sub(originScreen);

  if (screenDirection.lengthSq() < 0.0001) {
    screenDirection.set(0, -1);
  } else {
    screenDirection.normalize();
  }

  viewportInteraction.shapeDrag = {
    ...handle,
    shapeFaceId: faceId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startValue: getShapeFaceValue(object.shape, faceId),
    screenDirection
  };

  if (viewport.controls) {
    setViewportControlsInteractionEnabled(false);
  }

  elements.sceneViewport.setPointerCapture(event.pointerId);
  return true;
}

function updateShapeDrag(event) {
  const drag = viewportInteraction.shapeDrag;

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

  object.shape = setTileShapeValue(object.shape, drag.propertyKey || 'shape-taper', nextValue);
  syncProjectSceneToViewport();
  renderPropertiesPanel();
  markEditorDirty();
}

function endShapeDrag(event) {
  if (!viewportInteraction.shapeDrag) {
    return;
  }

  viewportInteraction.shapeDrag = null;

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
    setViewportControlsInteractionEnabled(false);
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
    setViewportControlsInteractionEnabled(false);
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

function paintSphereFromPointerEvent(event) {
  const cell = getViewportCellFromPointerEvent(event);

  if (!cell) {
    return;
  }

  const targetKey = `sphere-cell:${getCellKey(cell)}`;

  if (viewportInteraction.lastPaintTargetKey === targetKey) {
    return;
  }

  viewportInteraction.lastPaintTargetKey = targetKey;
  placeSphereAtCell(cell.cellX, cell.cellZ);
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

    if (transformHandle.shapeHandleId && state.viewportTool === 'shape') {
      beginShapeDrag(event, transformHandle);
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

  if ((state.activeTool !== 'tile' && state.activeTool !== 'sphere' && state.activeTool !== 'bucket') || !viewport.initialized) {
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

  if (state.activeTool === 'sphere') {
    if (event.button !== 0) {
      return;
    }

    viewportInteraction.isPaintingTiles = true;
    viewportInteraction.lastPaintTargetKey = null;
    elements.sceneViewport.setPointerCapture(event.pointerId);
    paintSphereFromPointerEvent(event);
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
  if (viewportInteraction.shapeDrag) {
    event.preventDefault();
    updateShapeDrag(event);
    return;
  }

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

  if ((state.activeTool !== 'tile' && state.activeTool !== 'sphere') || !viewportInteraction.isPaintingTiles) {
    return;
  }

  event.preventDefault();
  if (state.activeTool === 'sphere') {
    paintSphereFromPointerEvent(event);
  } else {
    paintTileFromPointerEvent(event);
  }
}

function handleViewportPointerUp(event) {
  if (viewportInteraction.shapeDrag) {
    endShapeDrag(event);
    return;
  }

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
  if (viewportInteraction.resizeDrag || viewportInteraction.moveDrag || viewportInteraction.rotateDrag || viewportInteraction.groupResizeDrag || viewportInteraction.roundDrag || viewportInteraction.shapeDrag) {
    return;
  }

  clearTransformHandleHover();
  viewportInteraction.selectionClick = null;
  viewportInteraction.isPaintingTiles = false;
  viewportInteraction.lastPaintTargetKey = null;
  clearBucketPreview();
}

function handleViewportContextMenu(event) {
  if (state.activeTool === 'tile' || state.activeTool === 'sphere' || state.activeTool === 'bucket') {
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

  const controls = new TrackballControls(camera, canvas);
  controls.staticMoving = false;
  controls.dynamicDampingFactor = 0.08;
  controls.keys = [];
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
  viewport.controls?.handleResize?.();
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
  const sectionSummary = event.target.closest('[data-property-section-summary]');

  if (sectionSummary) {
    event.preventDefault();
    setPropertyAccordionOpen(sectionSummary.dataset.propertySectionSummary);
    return;
  }

  const actionButton = event.target.closest('button[data-light-action]');

  if (actionButton) {
    moveSelectedLight(actionButton.dataset.lightAction);
  }
});
elements.propertyFields.addEventListener('keydown', (event) => {
  const sectionSummary = event.target.closest('[data-property-section-summary]');

  if (sectionSummary && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    setPropertyAccordionOpen(sectionSummary.dataset.propertySectionSummary);
    return;
  }

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
elements.modelImportInput.addEventListener('change', async () => {
  try {
    await importModelFile(elements.modelImportInput.files?.[0]);
  } catch (error) {
    showMessage(error.message || 'Não foi possível importar o modelo.');
  } finally {
    elements.modelImportInput.value = '';
  }
});
elements.textureBucketToolButton.addEventListener('click', () => setTextureTool('bucket'));
elements.textureBrushToolButton.addEventListener('click', () => setTextureTool('brush'));
elements.textureEraserToolButton.addEventListener('click', () => setTextureTool('eraser'));
elements.textureColorPicker.addEventListener('input', () => {
  state.texturePaintColor = normalizeHexColor(elements.textureColorPicker.value);
});
elements.textureBrushSizeInput.addEventListener('input', () => {
  state.textureBrushSize = Math.max(2, Number(elements.textureBrushSizeInput.value) || 14);
});
elements.textureZoomOutButton?.addEventListener('click', () => zoomTextureCanvas(1 / textureZoomStep));
elements.textureZoomInButton?.addEventListener('click', () => zoomTextureCanvas(textureZoomStep));
elements.textureCanvas.addEventListener('pointerdown', beginTextureCanvasPaint);
elements.textureCanvas.addEventListener('pointermove', updateTextureCanvasPaint);
elements.textureCanvas.addEventListener('pointerup', endTextureCanvasPaint);
elements.textureCanvas.addEventListener('pointercancel', endTextureCanvasPaint);
elements.textureCanvas.addEventListener('pointerleave', (event) => {
  if (textureInteraction.isPainting) {
    endTextureCanvasPaint(event);
  }
});
elements.textureCanvasScroll.addEventListener('wheel', (event) => {
  if (!getSelectedTextureObject()) {
    return;
  }

  event.preventDefault();
  const factor = event.deltaY > 0 ? 1 / textureZoomStep : textureZoomStep;
  zoomTextureCanvas(factor, event);
}, { passive: false });
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
elements.viewportShapeToolButton.addEventListener('click', () => setViewportTool('shape'));
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
elements.addSphereButton.addEventListener('click', activateSpherePaintTool);
elements.importModelButton.addEventListener('click', triggerModelImport);
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
