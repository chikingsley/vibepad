# Icon sources

VibePad compiles these SVG sources into Nano Icons fonts at build time.

- `ui/` contains the interface icons currently used by the client. The Lucide
  sources were copied from `lucide-static` 1.25.0 under the ISC license. The
  two OpenCode status variants reproduce the status glyph used by the current
  OpenCode desktop application.
- `providers/` is synchronized from
  `References/OpenCode/packages/ui/src/assets/icons/provider` at OpenCode
  commit `fab213312927ea64cf968832c527206e8c944f9e`. OpenCode is MIT licensed;
  provider names and logos remain trademarks of their respective owners.

The generated `.ttf` and `.glyphmap.json` files live under `nanoicons/` so
Expo Go can load the fonts directly. A future development build can use Nano
Icons' native static linking without changing call sites.
