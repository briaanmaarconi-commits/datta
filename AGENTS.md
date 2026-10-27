# Change log (required)

- Every push to `postgres-backend` must add a dated, plain-Spanish line at the top of `docs/CAMBIOS.md` (say "Publicado" once it is deployed). If the change alters how the system works overall (new role, module, hosting, deploy flow), also update `docs/CONTEXTO-PROYECTO.md`. The owner's claude.ai Project reads these two files from GitHub to stay up to date.

# Architecture decisions

- Private role layouts activate their shared workspace theme through `usePrivateTheme`; this keeps Datta's private UI consistent without changing the public QR menu.
- Private workspaces use editorial white surfaces, a charcoal gradient sidebar, and orange only for actions and selection; this maximizes operational legibility while preserving Datta's identity.
- The public commercial presentation is a static, authentication-free route backed by sanitized screenshots; this prevents customer data exposure and keeps sales demos reliable.
