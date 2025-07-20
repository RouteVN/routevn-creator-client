# Animation Properties Implementation Plan

## Overview
Implement an "Add Properties" button inside the animation creation dialog that allows users to add animation properties (x, y, alpha, scaleX, scaleY, rotation) with keyframe configuration using a timeline view.

## Correct Implementation Flow
1. Click "Add Animation" → Opens dialog
2. In dialog: Fill in animation name
3. In dialog: Click "Add Property" → Opens dropdown to select property type
4. Selected properties appear as list items with Remove buttons
5. Timeline preview shows all added properties
6. Submit creates animation with property-based structure

## Current State Analysis
- Animation page uses Rettangoli framework with 3-file pattern (view, store, handlers)
- Dialog already exists for animation creation with form and timeline components
- Timeline component `rvn-keyframe-timeline` already exists

## Implementation Details

### 1. Dialog Structure Updates
**Location**: `src/components/groupAnimationsView/groupAnimationsView.view.yaml`
- ✅ Added "Add Property" button inside the dialog
- ✅ Added properties list section showing added properties
- ✅ Added remove buttons for each property
- ✅ Restructured dialog layout to accommodate property management
- ✅ Added dropdown menu for property selection

### 2. Data Structure Implementation
**Location**: Animation item data structure
```javascript
// Extended tracks format (reuses existing structure)
item.tracks = [
  {
    name: "Alpha",
    property: "alpha", 
    initialValue: 1,
    keyframes: [
      { start: 0, duration: 1, value: 0, easing: 'linear' }
    ]
  },
  {
    name: "Position X",
    property: "x",
    initialValue: 0, 
    keyframes: [
      { start: 0, duration: 1, value: 100, easing: 'linear' }
    ]
  }
];
item.totalDuration = "2s";

// Legacy format (for backwards compatibility)
item.duration = "4s";
item.keyframes = 3;
```

### 3. Store Updates
**Location**: `src/components/groupAnimationsView/groupAnimationsView.store.js`
- ✅ Added `animationProperties` array to track tracks in current animation
- ✅ Added dropdown state management  
- ✅ Added track management actions: `addAnimationProperty`, `removeAnimationProperty`
- ✅ Creates tracks in existing format with extended keyframes (value, easing)
- ✅ Reset tracks when dialog closes

### 4. Handler Updates
**Location**: `src/components/groupAnimationsView/groupAnimationsView.handlers.js`
- ✅ Added `handleAddPropertyClick` - opens dropdown for property selection
- ✅ Added `handleRemovePropertyClick` - removes track from list
- ✅ Added `handlePropertiesDropdownItemClick` - adds selected property as track
- ✅ Updated `handleFormActionClick` - includes tracks in animation creation
- ✅ Added dropdown overlay handling

### 5. Repository Integration
**Location**: `src/pages/animations/animations.handlers.js`
- ✅ Updated `handleAnimationCreated` to support both tracks and legacy formats
- ✅ Maintains backwards compatibility
- ✅ Uses existing tracks structure (no new format needed!)

## Property Configuration

### Default Track Values
- **x**: initialValue: 0, keyframe: start=0, duration=1, value=100, easing='linear'
- **y**: initialValue: 0, keyframe: start=0, duration=1, value=100, easing='linear'  
- **alpha**: initialValue: 1, keyframe: start=0, duration=1, value=0, easing='linear'
- **scaleX**: initialValue: 1, keyframe: start=0, duration=1, value=1.5, easing='linear'
- **scaleY**: initialValue: 1, keyframe: start=0, duration=1, value=1.5, easing='linear'
- **rotation**: initialValue: 0, keyframe: start=0, duration=1, value=360, easing='linear'

### Dropdown Options
- Position X / Position Y
- Alpha (Opacity)  
- Scale X / Scale Y
- Rotation

## Key Features
- ✅ Properties are managed within the dialog, not as external buttons
- ✅ Each property can only be added once (prevents duplicates)
- ✅ Properties can be removed individually
- ✅ Timeline component shows preview of each track
- ✅ Backwards compatibility with existing legacy animations
- ✅ **Reuses existing tracks format - no new data structure needed!**

### 6. Keyframe Timeline Component Updates
**Location**: `src/components/keyframeTimeline/keyframeTimeline.store.js`, `keyframeTimeline.view.yaml`
- ✅ Simplified to use standard tracks format only
- ✅ Extended tracks schema to include value and easing in keyframes
- ✅ Dynamic track rendering based on tracks prop
- ✅ Shows track name, initial value, and keyframe values
- ✅ Removed complex property format - keeps it simple!

## Testing Completed
- ✅ Dialog opens correctly with new layout
- ✅ Add Property button opens dropdown
- ✅ Property selection adds to list with individual timelines
- ✅ Remove buttons work correctly
- ✅ Form submission includes animation properties
- ✅ Timeline component shows actual property data (no more placeholders)
- ✅ Each property displays its own keyframes and values
- ✅ Data structure matches specification
- ✅ Build completed successfully