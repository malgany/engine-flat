# Project Instructions

## UI Design System

Use the project-local Material Design 3 skill for UI work in this workspace:

- Skill path: `.codex/skills/material-3/SKILL.md`
- Source: `https://github.com/hamen/material-3-skill`
- Scope: this project only. Do not install or modify a global Material 3 skill unless the user explicitly asks.

When building the MVP interface, follow Material Design 3 tokens and patterns for layout, navigation, components, typography, shape, color, elevation, motion, and accessibility. For web UI, prefer MD3 CSS custom properties and selective `@material/web` imports only when useful.

## Browser Tooling

Do not use Playwright/MCP Playwright for this project unless the user explicitly asks for Playwright by name.

Terminology for this workspace:

- "Chrome embutido", "navegador embutido", or "browser do Codex" means the browser panel running inside Codex.
- "Extensao do Chrome", "meu Chrome", or "navegador pessoal" means the user's personal Chrome connected through the Chrome extension/plugin, when that connector is available.

For browser checks in this project, prefer the non-Playwright browser surface that matches the user's wording. If only Playwright is available, do not silently use it; explain that Playwright is the only available browser automation in the current session and ask before proceeding.
