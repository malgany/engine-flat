const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');
const {
  createProject,
  deleteProject,
  exportProjectGlb,
  listRecentProjects,
  openRecent,
  projectsDir,
  renameProject,
  saveProject
} = require('../src/main/projectStore');

const port = Number(process.env.PORT || 4173);
const rendererDir = path.resolve(__dirname, '..', 'src', 'renderer');
const nodeModulesDir = path.resolve(__dirname, '..', 'node_modules');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(data));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
    });

    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    request.on('error', reject);
  });
}

function openProjectsFolder() {
  if (process.platform === 'win32') {
    execFile('explorer.exe', [projectsDir]);
  } else if (process.platform === 'darwin') {
    execFile('open', [projectsDir]);
  } else {
    execFile('xdg-open', [projectsDir]);
  }
}

async function handleApi(request, response) {
  try {
    if (request.method === 'GET' && request.url === '/api/projects/recent') {
      sendJson(response, 200, { data: listRecentProjects() });
      return;
    }

    if (request.method === 'GET' && request.url === '/api/projects/location') {
      sendJson(response, 200, { data: projectsDir });
      return;
    }

    if (request.method === 'POST' && request.url === '/api/projects/create') {
      const body = await readRequestBody(request);
      sendJson(response, 200, { data: createProject(body) });
      return;
    }

    if (request.method === 'POST' && request.url === '/api/projects/open-recent') {
      const body = await readRequestBody(request);
      sendJson(response, 200, { data: openRecent(body.projectId) });
      return;
    }

    if (request.method === 'POST' && request.url === '/api/projects/rename') {
      const body = await readRequestBody(request);
      sendJson(response, 200, { data: renameProject(body.projectId, body.name) });
      return;
    }

    if (request.method === 'POST' && request.url === '/api/projects/delete') {
      const body = await readRequestBody(request);
      sendJson(response, 200, { data: deleteProject(body.projectId) });
      return;
    }

    if (request.method === 'POST' && request.url === '/api/projects/save') {
      const body = await readRequestBody(request);
      sendJson(response, 200, { data: saveProject(body.projectId, body.changes) });
      return;
    }

    if (request.method === 'POST' && request.url === '/api/projects/export-glb') {
      const body = await readRequestBody(request);
      sendJson(response, 200, { data: exportProjectGlb(body.projectId, body.payload) });
      return;
    }

    if (request.method === 'POST' && request.url === '/api/projects/open-folder') {
      openProjectsFolder();
      sendJson(response, 200, { data: projectsDir });
      return;
    }

    sendJson(response, 404, { error: 'Endpoint nao encontrado.' });
  } catch (error) {
    sendJson(response, 500, { error: error.message || 'Erro no preview local.' });
  }
}

function handleStatic(request, response) {
  const url = new URL(request.url, `http://localhost:${port}`);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const staticRoot = pathname.startsWith('/node_modules/') ? nodeModulesDir : rendererDir;
  const relativePath = pathname.startsWith('/node_modules/')
    ? pathname.slice('/node_modules/'.length)
    : pathname;
  const filePath = path.normalize(path.join(staticRoot, relativePath));

  if (!filePath.startsWith(staticRoot)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream'
    });
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  if (request.url.startsWith('/api/')) {
    handleApi(request, response);
    return;
  }

  handleStatic(request, response);
});

server.listen(port, () => {
  console.log(`Engine Flat web preview: http://localhost:${port}`);
});
