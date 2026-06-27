---
name: Aura Curation System
colors:
  surface: '#f6f9ff'
  surface-dim: '#d4dbe2'
  surface-bright: '#f6f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eef4fc'
  surface-container: '#e8eef6'
  surface-container-high: '#e3e9f1'
  surface-container-highest: '#dde3eb'
  on-surface: '#161c22'
  on-surface-variant: '#4c4546'
  inverse-surface: '#2b3137'
  inverse-on-surface: '#ebf1f9'
  outline: '#7e7576'
  outline-variant: '#cfc4c5'
  surface-tint: '#5e5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b1b1b'
  on-primary-container: '#848484'
  inverse-primary: '#c6c6c6'
  secondary: '#52606d'
  on-secondary: '#ffffff'
  secondary-container: '#d2e1f1'
  on-secondary-container: '#566472'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#191c1d'
  on-tertiary-container: '#828485'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c6'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#d5e4f4'
  secondary-fixed-dim: '#b9c8d8'
  on-secondary-fixed: '#0f1d28'
  on-secondary-fixed-variant: '#3a4855'
  tertiary-fixed: '#e1e3e4'
  tertiary-fixed-dim: '#c5c7c8'
  on-tertiary-fixed: '#191c1d'
  on-tertiary-fixed-variant: '#454748'
  background: '#f6f9ff'
  on-background: '#161c22'
  surface-variant: '#dde3eb'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.1em
  button-text:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.02em
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
  section-gap: 80px
---

## Brand & Style

The design system is anchored in a **Minimalist Art Gallery** aesthetic. It prioritizes the content—imagery and curated "wishes"—by treating the interface as a silent, premium frame. The emotional response should be one of calm, focus, and intentionality. 

The style utilizes expansive whitespace (negative space) as a structural element rather than a void. Visual hierarchy is established through precise typography and sharp, high-contrast accents. This system avoids unnecessary decorative flourishes, leaning on the rhythmic alignment of grids and the clarity of a monochromatic base to convey a sense of high-end curation.

## Colors

This design system employs a **monochromatic core with structural neutrals**. The palette is designed to be invisible enough to let vibrant photography shine, yet sharp enough to command authority.

- **Primary (Pure Black):** Used for critical typography, primary CTAs, and structural borders. It represents the "ink" on the gallery wall.
- **Secondary (Deep Slate):** Reserved for secondary actions, subtle icons, and metadata.
- **Surface & Backgrounds:** A range of whites and off-whites (`#FFFFFF` to `#F8F9FA`) creates "breathable" layers.
- **Dividers & Strokes:** Soft grays (`#E2E8F0`) define boundaries without creating visual noise.
- **Functional States:** Success, Error, and Warning states should use desaturated versions of their respective colors (e.g., a deep oxblood for errors) to maintain the premium feel.

## Typography

The typography strategy focuses on the juxtaposition between a **refined geometric sans-serif** (Hanken Grotesk) and a **utilitarian technical mono-style** (Space Grotesk).

- **Headlines:** Use Hanken Grotesk with tight tracking to create a "locked-in" editorial look.
- **Body Text:** Inter is utilized for maximum legibility in descriptions and comments, ensuring a neutral reading experience.
- **Captions & Metadata:** Space Grotesk in uppercase is used for labels, navigation categories, and counters to provide a subtle "archival" or "industrial" feel.
- **Scale:** Maintain a strict hierarchy. If an element isn't a headline, it should be significantly smaller to preserve the feeling of a vast layout.

## Layout & Spacing

The design system utilizes a **Fluid-Fixed Hybrid Grid**. Content is housed in a 12-column grid that scales fluidly until a maximum width of 1280px, at which point it centers.

- **The "Breathing" Principle:** Use vertical section gaps of 80px or more to separate distinct functional areas. 
- **The Wish Board Grid:** Photos and cards should use an asymmetrical masonry layout or a strict square grid with 24px gutters. 
- **Mobile Reflow:** On mobile devices, margins shrink to 16px, and the 12-column grid collapses into a 2-column or single-column view for media-heavy content.
- **Padding:** Internal card padding should be generous (24px - 32px) to prevent content from feeling crowded near the edges of their containers.

## Elevation & Depth

To maintain a "High-End" feel, this design system rejects heavy shadows in favor of **Tonal Layering and Sharp Outlines**.

- **Depth through Contrast:** Instead of shadows, use subtle background shifts (e.g., a `#F8F9FA` card on a `#FFFFFF` background).
- **The "Ghost" Border:** Use 1px solid borders in `#E2E8F0` for cards and input fields. This creates a crisp, architectural boundary.
- **Active Elevation:** Only use a shadow for floating elements (like a "New Wish" FAB). The shadow should be a "Large Ambient" style: 0px 20px 40px rgba(0,0,0,0.05)—barely visible, but providing a soft lift.
- **Glassmorphism:** Use sparingly for top navigation bars or overlays to maintain context of the underlying imagery. Apply a `blur(20px)` with a 90% white opacity.

## Shapes

The shape language is **Strictly Geometric (Sharp)**. 

- **Corners:** 0px radius for all primary elements, including buttons, cards, and image containers. This mimics the sharp edges of physical photo prints and gallery frames.
- **Exceptions:** Very small functional UI elements like checkboxes or radio buttons may use a 1px soft corner to ensure they don't appear "broken" at low resolutions, but the overall system should feel uncompromisingly rectangular.
- **Icons:** Use thin-stroke (1.5pt) linear icons with sharp joins to match the typography and border style.

## Components

### Buttons
- **Primary:** Solid Black background, White text. No border. Sharp corners.
- **Secondary:** Transparent background, 1px Black border. Sharp corners.
- **Tertiary/Ghost:** No border or background. Bold uppercase text with an arrow or icon suffix.

### Input Fields
- **Text Inputs:** 1px border on the bottom only, or a full 1px light gray border. Use `label-caps` for the field title above the input.
- **Dropzones:** Use a dashed 1px border (`#E2E8F0`) with a centered icon and `label-caps` instructions.

### Cards & Boards
- **Image Cards:** The image is the primary focus. Titles and "Wish" details should appear either as a subtle overlay on hover or in a clean white area below the image using `body-md` for the title and `label-caps` for metadata.
- **Status Chips:** Small, sharp rectangles with light gray backgrounds and dark gray text.

### Selection Controls
- **Checkboxes:** Square, 1px black stroke. When active, fill with black and a white checkmark.
- **Radio Buttons:** Square-in-square aesthetic rather than circles to maintain the sharp geometric theme.

### Interaction
- **Hovers:** Use a subtle opacity shift (100% to 90%) for images or a slight background tint change for buttons. Avoid "lifting" or scaling effects to keep the interface feeling grounded and professional.