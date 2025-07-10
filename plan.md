# Font Preview Feature Implementation Plan

## Overview
Add font preview functionality to the existing font management system in `/src/pages/fonts/` and `/src/components/groupFontsView/`. The current system already handles font upload, organization, and file management - we need to add live font preview capabilities similar to Apple's Font Book.

## Current Implementation Analysis

### ✅ Already Implemented
- **Font Upload**: Complete drag-and-drop upload system supporting `.ttf`, `.otf`, `.woff`, `.woff2`, `.eot`
- **Font Organization**: Tree-based folder structure with search functionality
- **Font Management**: Full CRUD operations through repository system
- **UI Structure**: Grid layout with collapsible folders and file cards
- **File Handling**: Integration with file system via fileId references

### ❌ Missing Font Preview
- Font cards display as generic text labels ("Font file")
- No font family application to preview text
- No sample text rendering with actual fonts
- No font loading or CSS font-face generation

## Implementation Plan

### Phase 1: Font Loading Infrastructure

#### 1.1 Font File Loading System
**Location**: Create `src/components/fontLoader/` component
- Load font files from fileId using existing file system
- Generate CSS `@font-face` declarations dynamically
- Create unique font-family names to avoid conflicts
- Handle font loading states (loading, loaded, error)
- Cache loaded fonts to avoid re-processing

#### 1.2 Font Metadata Extraction
**Enhance**: `groupFontsView.store.js`
- Extract font family name using CSS Font Loading API
- Detect font style (normal, italic) and weight (100-900)
- Store font metadata in view data for preview rendering
- Handle font loading errors gracefully with fallbacks

### Phase 2: Preview Enhancement

#### 2.1 Font Card Preview
**Modify**: `groupFontsView.view.yaml` lines 64-66
- Replace static "Font file" text with live preview
- Apply loaded font-family to sample text
- Default sample text: "Aa Bb 123" (compact preview)
- Handle loading states with skeleton/placeholder

#### 2.2 Font Preview Controls
**Enhance**: `groupFontsView.view.yaml` search bar area (line 44-46)
- Add font size slider (similar to images zoom: 12px - 48px)
- Add sample text input field
- Add preview mode toggle (compact vs. expanded)
- Reuse existing zoom control pattern from `groupImagesView`

#### 2.3 Preview Text Rendering
**New Component**: `src/components/fontPreviewText/`
- Render customizable sample text with applied font
- Support multiple preview formats:
  - Compact: "Aa Bb 123" for grid view
  - Expanded: "The quick brown fox..." for detailed view
  - Custom: User-defined sample text
- Handle font loading states with progressive enhancement

### Phase 3: Enhanced Preview Experience

#### 3.1 Detailed Font Preview
**Add**: Full-screen font preview modal (similar to image preview)
- Triggered by double-click on font card
- Large-scale font preview with multiple sample texts
- Font information display (family, style, weight, file size)
- Alphabet and character set preview
- Close on overlay click (reuse existing pattern)

#### 3.2 Typography Integration
**Connect**: Link with existing typography system
- "Create Typography" button on font cards
- Pre-populate typography form with selected font
- Bridge font files with typography styles

### Phase 4: Performance and UX

#### 4.1 Lazy Loading
- Load fonts only when visible (intersection observer)
- Unload fonts when scrolled out of view
- Batch font loading for better performance
- Progressive font preview (fallback → loaded font)

#### 4.2 Error Handling
- Graceful fallback for corrupt/unsupported fonts
- User feedback for font loading failures
- Retry mechanism for failed font loads
- Clear error states in UI

## Technical Implementation Details

### Files to Modify
1. **`src/components/groupFontsView/groupFontsView.view.yaml`**
   - Add font size controls (lines 44-46)
   - Replace static font cards with preview cards (lines 64-66)
   - Add full preview modal overlay (after line 73)

2. **`src/components/groupFontsView/groupFontsView.store.js`**
   - Add font size state management
   - Add font loading state tracking
   - Add sample text state management

3. **`src/components/groupFontsView/groupFontsView.handlers.js`**
   - Add font loading handlers
   - Add preview controls handlers
   - Add full preview modal handlers

### New Components to Create
1. **`src/components/fontLoader/`** - Font file loading and CSS generation
2. **`src/components/fontPreviewText/`** - Rendered font preview text
3. **`src/components/fontPreviewModal/`** - Full-screen font preview

### Integration Points
- **File System**: Use existing fileId system for font file access
- **Repository**: Leverage existing font data structure
- **Event System**: Use existing event bubbling for inter-component communication
- **Styling**: Follow existing component styling patterns and design system

### Technical Approach
- **CSS Font Loading API**: For dynamic font loading and metadata extraction
- **Progressive Enhancement**: Start with fallback text, enhance with loaded fonts
- **Performance**: Lazy loading, caching, and efficient re-rendering
- **Accessibility**: Proper loading states, error messages, and keyboard navigation

## Success Criteria
- [ ] Font cards show actual font preview instead of generic text
- [ ] Font size controls work smoothly (12px - 48px range)
- [ ] Custom sample text input updates previews in real-time
- [ ] Full-screen font preview modal with detailed information
- [ ] Fonts load progressively without blocking UI
- [ ] Error handling for corrupt/unsupported fonts
- [ ] Performance remains smooth with 50+ fonts loaded
- [ ] Integration with existing typography creation workflow

## Implementation Priority
1. **High**: Basic font preview in cards with default sample text
2. **High**: Font size controls and dynamic loading
3. **Medium**: Custom sample text input
4. **Medium**: Full-screen preview modal
5. **Low**: Advanced typography integration
6. **Low**: Character set and alphabet preview