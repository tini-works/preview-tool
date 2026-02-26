# Design Tokens Reference

Source: `packages/tokens/src/*.json`

## Colors

**Bold** = primary brand value used in the app (see legend below table).

| Scale | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|
| teal | #E8F6F8 | #C5E9ED | #9DD9E0 | #6EC6D0 | #40B3C3 | **#13A3B5** | #0F8A99 | #0B6F7C | #085560 | #053B43 |
| charcoal | #E8EAEB | #C5CACC | #9DA6AA | #748188 | #4E5D64 | **#1C2A30** | #182428 | #131D21 | #0F1719 | #0A1012 |
| cream | #FDFCFB | **#FAF8F5** | #F5F3EF | #EFEBE5 | #E8E3DB | #E1DBD1 | — | — | — | — |
| slate | #EEF1F3 | #D5DBDF | #B8C3C9 | #9AABB3 | #7C939D | **#5E7A86** | #4E666F | #3E5159 | #2E3D43 | #1F292D |
| coral | #FDF3F0 | #FAE0D9 | #F5C7BC | #F0AD9E | #EC9488 | **#E88A73** | #E06A4F | #C9503A | #A03D2D | #772D21 |

Legend: **teal-500** Primary CTA | **charcoal-500** Primary text | **cream-100** Main background | **slate-500** Secondary text | **coral-500** Accent

Semantic: success(#22C55E) error(#E06A4F) warning(#F59E0B) info(#3B82F6) — each with 50/100/500/600/700 stops.

Neutral: white(#FFFFFF) black(#000000)

## Spacing

| 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 11 | 12 | 16 | 20 | 24 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.25rem | 0.5rem | 0.75rem | 1rem | 1.25rem | 1.5rem | 2rem | 2.5rem | 2.75rem | 3rem | 4rem | 5rem | 6rem |

## Typography

Fonts: DM Sans (primary), system-ios, system-android, JetBrains Mono

Sizes: xs(0.75) sm(0.875) md/base(1) lg(1.125) xl(1.25) 2xl(1.5) 3xl(1.875) 4xl(2.25) + display-lg/md/sm, headline-lg/md/sm, body-lg/md/sm, label-lg/md/sm, kpi(2rem)

Weights: normal(400) medium(500) semibold(600) bold(700)

Line heights: kpi(1.2) tight(1.25) heading(1.35) snug(1.375) label(1.4) normal(1.5) relaxed(1.75)

Letter spacing: tighter(-0.02em) tight(-0.01em) normal(0) wide(0.02em) wider(0.05em)

Font scale presets: 100(default) 115 130 160 200 — each scales label/body/title/headline/display/lineHeight by different ratios for accessibility.

## Radius

none(0) sm(4px) md(8px) lg(12px) xl(16px) 2xl(24px) full(9999px)

## Shadow

none | sm: 0 1px 2px rgba(28,42,48,0.05) | md: 0 4px 6px rgba(28,42,48,0.07) | lg: 0 10px 15px rgba(28,42,48,0.08) | xl: 0 20px 25px rgba(28,42,48,0.1) | 2xl: 0 25px 50px rgba(28,42,48,0.15) | inner: inset 0 2px 4px rgba(28,42,48,0.05) | focus: 0 0 0 3px rgba(19,163,181,0.4)

## Motion

instant(0ms) fast(150ms) normal(200ms) slow(300ms) slower(400ms)
