# Font Weight Extraction Audit

Date: 2026-07-22

## Goal

Test `fontkit`-backed weight extraction against real fonts beyond the default
template and unit-test fixtures. The corpus intentionally mixes static,
variable, color, emoji, icon, monospace, CJK, TrueType-outline, CFF, and CFF2
fonts in TTF, OTF, WOFF, and WOFF2 containers.

## Corpus

The temporary corpus contained 61 font files from 11 independent upstream
projects or distribution sources:

- [Adobe Source Serif](https://github.com/adobe-fonts/source-serif): static and
  variable CFF/CFF2 fonts in OTF, WOFF, and WOFF2
- [Google Fonts](https://github.com/google/fonts): Roboto Flex, Nabla COLRv1,
  Noto Emoji Variable, and Noto Color Emoji TTFs
- [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono): static and
  variable TTF and WOFF2
- [Recursive](https://github.com/arrowtype/recursive): static and multi-axis
  variable TTF and WOFF2
- [Font Awesome](https://github.com/FortAwesome/Font-Awesome): brand and solid
  icon WOFF2 fonts
- [Inter](https://github.com/rsms/inter): roman and italic variable WOFF2
- [Mozilla Twemoji COLR](https://github.com/mozilla/twemoji-colr): color TTF
- [0xProto](https://github.com/0xType/0xProto): OTF, TTF, and WOFF2
- [Fontsource](https://fontsource.org/): Noto Sans SC 600 TTF and WOFF2
- [Fira Code](https://github.com/tonsky/FiraCode): the official 6.2 static and
  variable TTF, WOFF, and WOFF2 release files
- [Velvetyne Compagnon](https://velvetyne.fr/fonts/compagnon/): experimental
  static OTF, WOFF, and WOFF2 styles

Format distribution:

| Format | Files | Successful extraction |
| ------ | ----: | --------------------: |
| TTF    |    17 |                    17 |
| OTF    |     9 |                     9 |
| WOFF   |    13 |                    13 |
| WOFF2  |    22 |                    22 |
| Total  |    61 |                    61 |

The results contained 47 static fonts and 14 variable fonts.

## Results

- All 61 files opened and returned usable weight metadata.
- Equivalent TTF/OTF, WOFF, and WOFF2 builds agreed for Source Serif, Fira
  Code, 0xProto, Noto Sans SC, JetBrains Mono, and Compagnon.
- Complex fonts did not require special cases: Nabla COLRv1, Noto Color Emoji,
  Mozilla Twemoji COLR, and Font Awesome all returned their static weight.
- Multi-axis fonts returned only their `wght` bounds. Roboto Flex returned
  100/400/1000, Inter 100/400/900, Recursive 300/300/1000, Source Serif
  200/400/900, and JetBrains Mono 100/400/800.
- One surprising value was accurate to the source metadata: the official
  JetBrains Mono files named `Bold.ttf` and `Bold.woff2` both store
  `OS/2.usWeightClass = 558`. A direct SFNT table read confirmed the value, so
  the extractor correctly returns 558 rather than inferring 700 from the file
  name.

This audit is evidence of broad compatibility, not proof that every font in the
wild has valid metadata. Run the reusable audit against another directory with:

```bash
bun scripts/audit-font-weight-extraction.js /path/to/font-corpus
```

## Unknown-Weight Fallback

Supported font containers with missing, invalid, or unreadable weight metadata
remain usable:

1. no `minWeight`, `defaultWeight`, or `maxWeight` fields are persisted;
2. the in-memory capability is `unrestricted`;
3. Text Styles offers all standard weights from 100 through 900;
4. malformed files that cannot be opened as TTF, OTF, WOFF, or WOFF2 are still
   rejected for new uploads.

Unit tests cover the fallback with a structurally readable font whose weight
class is unusable, blank persisted fields, and the all-weight selector output.
