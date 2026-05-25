# Engine Flat

Engine Flat é um MVP de editor 3D em Electron para criar cenas simples baseadas em tiles. O foco atual é montar áreas de jogo rapidamente, organizar objetos da cena, pintar tiles e exportar o resultado em GLB.

## Recursos

- Editor 3D com câmera orbitável e gizmo de orientação.
- Coleção da cena com seleção, visibilidade, bloqueio e grupos.
- Ferramentas de selecionar, mover, rotacionar e escalar.
- Propriedades editáveis para posição, rotação, escala e dimensões dos tiles.
- Pintura por carimbo e balde de tinta.
- TileSet com paleta de cores e importação de imagens para recortes por grade.
- Exportação de cena para `.glb`.
- Preview web local para testar a interface no navegador.

## Requisitos

- Node.js
- npm

## Como rodar

Instale as dependências:

```bash
npm install
```

Abra o app Electron:

```bash
npm start
```

Ou rode o preview web local:

```bash
npm run web
```

O preview abre em:

```text
http://localhost:4173/
```

## Estrutura

```text
src/main/       Processo principal do Electron e persistência de projetos
src/preload/    Ponte segura entre Electron e renderer
src/renderer/   Interface, viewport 3D, ferramentas e painel TileSet
scripts/        Servidor de preview web
projects/       Projetos locais gerados em tempo de uso
```

## Dados locais

Os projetos criados pelo editor ficam na pasta `projects/`. Essa pasta é ignorada pelo git porque contém dados locais, exports e cenas de trabalho.

## Design

Este projeto usa instruções locais de Material Design 3 em `.codex/skills/material-3`, conforme definido em `AGENTS.md`.

## Licença

Licença ainda não definida.
