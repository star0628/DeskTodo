## Summary

Describe the focused change and why it is needed.

## User Impact

Describe visible behavior, data migration, or compatibility impact. Write `None` when there is no user-facing impact.

## Validation

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm audit`
- [ ] `npm run tauri build` for native changes
- [ ] `npm run test:ui` for visual changes

## Safety

- [ ] No personal Store data, credentials, generated binaries, or build output is included.
- [ ] Reducer, persistence, and schema changes include focused tests.
- [ ] Browser fallback and Windows-native behavior were considered.
