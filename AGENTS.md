# Architecture decisions

- Private role layouts activate their shared workspace theme through `usePrivateTheme`; this keeps Datta's private UI consistent without changing the public QR menu.
- Private workspaces use editorial white surfaces, a charcoal gradient sidebar, and orange only for actions and selection; this maximizes operational legibility while preserving Datta's identity.
- The public commercial presentation is a static, authentication-free route backed by sanitized screenshots; this prevents customer data exposure and keeps sales demos reliable.
