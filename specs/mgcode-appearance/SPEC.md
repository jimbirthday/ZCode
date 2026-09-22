# mgcode branding and Mango appearance

## Product rules

- Display name is `mgcode` (development/preview may add Dev/Preview). Keep existing protocol, package IDs, storage directories and session identity stable; a visual rename must not lose user data.
- Application, dock, window, installer and browser icons use the designed lowercase `mgcode` wordmark. The HTML startup shell, React loading state and empty conversation retain Mango character assets. No Z wordmark or standalone `Mg` mark.
- The macOS development app bundle synchronizes its icon from the project ICNS on each launch, including cached bundles, without modifying the Electron dependency or user data.
- Mango is a built-in dark theme, selectable from both sidebar and Appearance. Missing/invalid preferences default to Mango; saved Light/Dark/System are respected after restart.
- Custom theme selection removes Mango artwork/classes and applies its light/dark foundation. Returning to a built-in clears the custom selection and tokens. No independent React hook theme state.
- Midnight-navy reading surfaces, cream text, mango-yellow primary buttons with dark labels, sky-blue focus/selection. Menus, inputs, cards and tools use opaque semantic surfaces. Normal primary/secondary/tertiary text must reach 4.5:1 against their surfaces.
- Artwork is quiet, confined to sidebar bottom and conversation outer edge, never a high-contrast backdrop for text. Desktop/mobile share tokens; small screens reduce decoration. Transparent marks keep safe margins and alpha.
- Welcome and onboarding surfaces use the Mango character asset; the login hero keeps the face in the upper half while shifting the crop downward enough to include the shoulders. No legacy Z mark is rendered in HTML startup, React startup, login, or onboarding states.

## Ownership and sequence

```mermaid
sequenceDiagram
  participant UI as Sidebar / Appearance / useTheme
  participant Store as window Zustand store
  participant Storage as existing localStorage
  participant DOM as theme applicator
  participant Peer as other window store
  UI->>Store: setTheme(valid built-in preference)
  Store->>Storage: persist preference; clear active custom theme
  Store->>DOM: clear custom tokens; apply classes and font preference
  Store->>Peer: existing broadcast (no echo on receive)
  Peer->>DOM: same setter / projection
```

Custom documents remain owned by the existing theme library; built-in selection belongs to the store. No runtime, Host, remote queue or protocol changes.

## Acceptance

1. Sidebar Mango → Light → Mango and Mango → Dark → Mango change the visible selection and DOM; repeat through Appearance and reload each preference.
2. Mango resolves dark with either OS setting; System follows OS without reselecting Mango. Invalid stored/broadcast values cannot produce mixed classes.
3. Custom light/dark → Mango clears custom CSS and artwork leaks; custom selection/removal restores coherent base classes.
4. Startup shows character asset, bundled/development app names say mgcode, browser title/favicon and wordmark match. Existing app-data/session paths remain unchanged.
5. Welcome login and onboarding show the Mango character with the intended downward crop and no horizontal overflow at 1440px desktop and 390px phone. Check selected/hover/input/menu/tooltip/terminal states, reduced motion and alpha edges. Measure token contrast; run Node regression tests and browser interaction E2E, typecheck, lint, architecture check.

## 2026-09-22 visual revision

- Desktop/application icons are wordmarks only: lowercase `mgcode` in cream white with mango-yellow `mg` emphasis on a midnight sky-blue field. Do not place character art or extra symbols in dock/window/installer icons.
- Built-in Mango uses a Midnight Anime palette inspired by popular night-editor themes (Tokyo Night-like navy structure and Catppuccin-like softened contrast), with Mango Yellow reserved for primary actions and the active theme, Sky Blue for focus/selection, Midnight Navy for reading layers, and Cream White for text.
- Palette roles: background `#101525`, panel `#171F36`, card `#1B2944`, border `#344764`, foreground `#FFF6DF`, subtle text `#C9D5E7`, blue focus `#78C8FF`, mango action `#FFC107`.
- Decorative images must be dimmed behind opaque content layers. The sidebar may show the character in the lower third; the chat art stays within a maximum 720px-wide lower-right decoration rather than scaling to fill long pages. Mobile removes chat decoration.
- Acceptance: lowercase `mgcode` app/dock/installer assets; theme screenshot shows navy layered surfaces with yellow actions and blue selection; primary and secondary text remain >=4.5:1; no theme-switching regression.

## Icon and palette acceptance

- `icon.png`, `icon_windows.png`, `icon.icns`, installer variants and web favicon are rendered as the lowercase `mgcode` wordmark only; they must not contain the Mango character or scene art.
- Mango surface colors are midnight navy rather than warm-brown. Yellow is an action color, never a large reading surface. Sky blue is limited to focus, selected rows and links.

## 2026-09-23 motion and surface revision

- Mango keeps one semantic token owner in the existing theme applicator. The redesign changes the palette and component projection only; it does not add React theme state or a second persistence path.
- Reading layers use `#0B1020` / `#131F38` / `#172B49`; primary actions use mango `#FFB703`; focus and links use sky `#7DD3FC`; selected rows use the darker blue `#174D69` so secondary text remains readable.
- Workspace entry and primary button feedback animate only `opacity` and `transform`; the hover shadow is an instantaneous emphasis. Buttons use a short lift and `scale(.97)` press response. No layout metric is animated.
- `prefers-reduced-motion: reduce` disables workspace entry and button transitions. Focus-visible controls keep a 2px sky-blue outline with offset.

### Acceptance

1. Mango token contrast remains at least 4.5:1 for primary, secondary, and tertiary text across background, panel, card, popover, input, selected, menu-hover, and tooltip surfaces.
2. Reloading Mango keeps the same class and token projection; switching to Light, Dark, System, or Custom removes Mango tokens and artwork.
3. At 390px the conversation decoration remains hidden, no horizontal overflow is introduced, and reduced-motion mode has no workspace entrance animation.
