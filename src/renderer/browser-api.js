(function setupBrowserApi() {
  if (window.engineFlat) {
    return;
  }

  async function request(path, options) {
    const response = await fetch(path, {
      headers: {
        'Content-Type': 'application/json'
      },
      ...options
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Falha na API local.');
    }

    return payload.data;
  }

  window.engineFlat = {
    projects: {
      create: (payload) => request('/api/projects/create', {
        method: 'POST',
        body: JSON.stringify(payload || {})
      }),
      getLocation: () => request('/api/projects/location'),
      listRecent: () => request('/api/projects/recent'),
      openDialog: async () => {
        const recentProjects = await request('/api/projects/recent');

        if (recentProjects.length === 0) {
          throw new Error('Nenhum projeto recente para abrir no preview web.');
        }

        return request('/api/projects/open-recent', {
          method: 'POST',
          body: JSON.stringify({ projectId: recentProjects[0].id })
        });
      },
      openFolder: () => request('/api/projects/open-folder', { method: 'POST' }),
      openRecent: (projectId) => request('/api/projects/open-recent', {
        method: 'POST',
        body: JSON.stringify({ projectId })
      }),
      rename: (projectId, name) => request('/api/projects/rename', {
        method: 'POST',
        body: JSON.stringify({ projectId, name })
      }),
      delete: (projectId) => request('/api/projects/delete', {
        method: 'POST',
        body: JSON.stringify({ projectId })
      }),
      save: (projectId, changes) => request('/api/projects/save', {
        method: 'POST',
        body: JSON.stringify({ projectId, changes })
      }),
      exportGlb: (projectId, payload) => request('/api/projects/export-glb', {
        method: 'POST',
        body: JSON.stringify({ projectId, payload })
      })
    },
    onMenuAction: () => () => {}
  };
})();
