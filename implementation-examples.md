# Implementation Examples: Schema-Driven Architecture with Rettangoli-FE

## 1. Resource Schema Definitions

```javascript
// src/schemas/resourceSchemas.js
export const RESOURCE_SCHEMAS = {
  images: {
    displayName: "Images",
    icon: "image",
    fileTypes: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'],
    viewMode: 'grid',
    preview: 'image',
    searchFields: ['name', 'tags', 'description'],
    sortFields: ['name', 'size', 'dateCreated', 'dateModified'],
    filters: [
      { name: 'size', type: 'range', min: 0, max: 10000000 },
      { name: 'format', type: 'select', options: ['jpg', 'png', 'gif', 'svg'] }
    ],
    features: ['upload', 'preview', 'organize', 'zoom'],
    customFields: [
      { name: 'alt', type: 'text', label: 'Alt Text' },
      { name: 'tags', type: 'tags', label: 'Tags' }
    ],
    bulkActions: ['delete', 'move', 'tag', 'resize'],
    dragDrop: {
      uploadText: "Drag images here or click to upload",
      acceptedFileTypes: "image/*"
    }
  },
  
  audio: {
    displayName: "Audio Files",
    icon: "volume-up",
    fileTypes: ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a'],
    viewMode: 'list',
    preview: 'waveform',
    searchFields: ['name', 'artist', 'album'],
    sortFields: ['name', 'duration', 'size', 'dateCreated'],
    filters: [
      { name: 'duration', type: 'range', min: 0, max: 3600 },
      { name: 'format', type: 'select', options: ['mp3', 'wav', 'ogg'] }
    ],
    features: ['upload', 'player', 'organize', 'trim'],
    customFields: [
      { name: 'artist', type: 'text', label: 'Artist' },
      { name: 'album', type: 'text', label: 'Album' },
      { name: 'duration', type: 'number', label: 'Duration (seconds)', readonly: true }
    ],
    bulkActions: ['delete', 'move', 'normalize'],
    dragDrop: {
      uploadText: "Drag audio files here or click to upload",
      acceptedFileTypes: "audio/*"
    }
  },
  
  characters: {
    displayName: "Characters",
    icon: "user",
    fileTypes: ['.jpg', '.jpeg', '.png'],
    viewMode: 'card',
    preview: 'image',
    searchFields: ['name', 'description', 'role'],
    sortFields: ['name', 'role', 'dateCreated'],
    filters: [
      { name: 'role', type: 'select', options: ['protagonist', 'antagonist', 'supporting', 'minor'] }
    ],
    features: ['upload', 'create', 'sprites', 'organize'],
    customFields: [
      { name: 'description', type: 'textarea', label: 'Description', required: true },
      { name: 'role', type: 'select', label: 'Role', options: ['protagonist', 'antagonist', 'supporting', 'minor'] },
      { name: 'voice', type: 'resource-selector', resourceType: 'audio', label: 'Voice Sample' }
    ],
    bulkActions: ['delete', 'move', 'update-role'],
    dragDrop: {
      uploadText: "Drag character images here or click to upload",
      acceptedFileTypes: "image/*"
    }
  }
};
```

## 2. Command Schema Definitions

```javascript
// src/schemas/commandSchemas.js
export const COMMAND_SCHEMAS = {
  background: {
    displayName: "Background",
    icon: "image",
    description: "Set the scene background",
    form: {
      fields: [
        { 
          id: 'image',
          fieldName: 'image',
          inputType: 'resourceSelector',
          resourceType: 'images',
          label: 'Background Image',
          required: true
        },
        { 
          id: 'animation',
          fieldName: 'animation',
          inputType: 'select',
          label: 'Transition',
          options: [
            { value: 'fade', label: 'Fade' },
            { value: 'slide-left', label: 'Slide Left' },
            { value: 'slide-right', label: 'Slide Right' },
            { value: 'instant', label: 'Instant' }
          ],
          value: 'fade'
        },
        { 
          id: 'duration',
          fieldName: 'duration',
          inputType: 'inputNumber',
          label: 'Duration (ms)',
          min: 0,
          max: 5000,
          value: 1000
        }
      ],
      actions: {
        layout: 'row',
        buttons: [
          { id: 'add', variant: 'pr', content: 'Add Background' },
          { id: 'cancel', variant: 'se', content: 'Cancel' }
        ]
      }
    },
    preview: (data) => `Background: ${data.image?.name || 'None'} (${data.animation})`
  },
  
  dialogue: {
    displayName: "Dialogue Box",
    icon: "message-square",
    description: "Character dialogue",
    form: {
      fields: [
        { 
          id: 'character',
          fieldName: 'character',
          inputType: 'resourceSelector',
          resourceType: 'characters',
          label: 'Character',
          required: true
        },
        { 
          id: 'text',
          fieldName: 'text',
          inputType: 'richText',
          label: 'Dialogue Text',
          required: true
        },
        { 
          id: 'layout',
          fieldName: 'layout',
          inputType: 'resourceSelector',
          resourceType: 'layouts',
          label: 'Dialogue Layout'
        },
        { 
          id: 'voice',
          fieldName: 'voice',
          inputType: 'resourceSelector',
          resourceType: 'audio',
          label: 'Voice Audio'
        },
        { 
          id: 'auto',
          fieldName: 'auto',
          inputType: 'checkbox',
          label: 'Auto-advance',
          value: false
        }
      ],
      actions: {
        layout: 'row',
        buttons: [
          { id: 'add', variant: 'pr', content: 'Add Dialogue' },
          { id: 'cancel', variant: 'se', content: 'Cancel' }
        ]
      }
    },
    preview: (data) => `${data.character?.name || 'Unknown'}: "${data.text?.substring(0, 50) || ''}..."`
  },
  
  choices: {
    displayName: "Player Choices",
    icon: "git-branch",
    description: "Present choices to the player",
    form: {
      fields: [
        { 
          id: 'prompt',
          fieldName: 'prompt',
          inputType: 'inputText',
          label: 'Choice Prompt',
          required: true
        },
        { 
          id: 'choices',
          fieldName: 'choices',
          inputType: 'arrayEditor',
          label: 'Choices',
          itemType: 'choice',
          minItems: 2,
          maxItems: 6
        },
        { 
          id: 'timer',
          fieldName: 'timer',
          inputType: 'inputNumber',
          label: 'Time Limit (seconds)',
          min: 0,
          max: 300
        }
      ],
      actions: {
        layout: 'row',
        buttons: [
          { id: 'add', variant: 'pr', content: 'Add Choices' },
          { id: 'cancel', variant: 'se', content: 'Cancel' }
        ]
      }
    },
    preview: (data) => `Choice: ${data.prompt} (${data.choices?.length || 0} options)`
  }
};
```

## 3. Universal Resource Manager Store

```javascript
// src/components/universal/UniversalResourceManager.store.js
import { produce } from 'immer';

export const INITIAL_STATE = Object.freeze({
  flatGroups: [],
  collapsedIds: [],
  selectedItemId: null,
  searchQuery: '',
  zoomLevel: 1.0,
  viewMode: 'grid', // 'grid', 'list', 'card'
  sortBy: 'name',
  sortOrder: 'asc',
  filters: {},
  isLoading: false,
  error: null,
  fullPreviewVisible: false,
  fullPreviewFileId: null,
  bulkSelectedIds: []
});

export const setResources = (state, resources) => {
  state.flatGroups = resources;
  state.isLoading = false;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const setSearchQuery = (state, query) => {
  state.searchQuery = query;
};

export const setZoomLevel = (state, zoomLevel) => {
  const newZoomLevel = Math.max(0.5, Math.min(4.0, zoomLevel));
  if (Math.abs(state.zoomLevel - newZoomLevel) > 0.001) {
    state.zoomLevel = newZoomLevel;
  }
};

export const setViewMode = (state, viewMode) => {
  state.viewMode = viewMode;
};

export const setSortBy = (state, sortBy) => {
  state.sortBy = sortBy;
};

export const setSortOrder = (state, sortOrder) => {
  state.sortOrder = sortOrder;
};

export const setFilter = (state, filterName, value) => {
  state.filters[filterName] = value;
};

export const toggleGroupCollapse = (state, groupId) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
};

export const showFullPreview = (state, fileId) => {
  state.fullPreviewVisible = true;
  state.fullPreviewFileId = fileId;
};

export const hideFullPreview = (state) => {
  state.fullPreviewVisible = false;
  state.fullPreviewFileId = null;
};

export const toggleBulkSelection = (state, itemId) => {
  const index = state.bulkSelectedIds.indexOf(itemId);
  if (index > -1) {
    state.bulkSelectedIds.splice(index, 1);
  } else {
    state.bulkSelectedIds.push(itemId);
  }
};

export const clearBulkSelection = (state) => {
  state.bulkSelectedIds = [];
};

export const setLoading = (state, isLoading) => {
  state.isLoading = isLoading;
};

export const setError = (state, error) => {
  state.error = error;
};

export const toViewData = ({ state, props }) => {
  const { schema } = props;
  const searchQuery = state.searchQuery.toLowerCase();
  
  // Filter and process groups based on search, filters, and collapse state
  const processedGroups = state.flatGroups.map(group => {
    let filteredChildren = group.children || [];
    
    // Apply search filter
    if (searchQuery) {
      filteredChildren = filteredChildren.filter(item => 
        schema.searchFields.some(field => 
          item[field]?.toLowerCase().includes(searchQuery)
        )
      );
    }
    
    // Apply schema filters
    Object.entries(state.filters).forEach(([filterName, value]) => {
      if (value) {
        const filterConfig = schema.filters.find(f => f.name === filterName);
        if (filterConfig) {
          filteredChildren = applySchemaFilter(filteredChildren, filterConfig, value);
        }
      }
    });
    
    // Apply sorting
    if (state.sortBy) {
      filteredChildren.sort((a, b) => {
        const aVal = a[state.sortBy];
        const bVal = b[state.sortBy];
        const order = state.sortOrder === 'asc' ? 1 : -1;
        return aVal > bVal ? order : -order;
      });
    }
    
    // Add UI properties
    const processedChildren = filteredChildren.map(item => ({
      ...item,
      selectedStyle: item.id === state.selectedItemId ? 'border: 2px solid #007bff;' : '',
      isSelected: state.bulkSelectedIds.includes(item.id)
    }));
    
    return {
      ...group,
      children: processedChildren,
      hasChildren: processedChildren.length > 0,
      isCollapsed: state.collapsedIds.includes(group.id)
    };
  });
  
  // Calculate image dimensions based on zoom level
  const baseImageHeight = 120;
  const baseMaxWidth = 160;
  const imageHeight = Math.round(baseImageHeight * state.zoomLevel);
  const maxWidth = Math.round(baseMaxWidth * state.zoomLevel);
  
  return {
    schema,
    flatGroups: processedGroups,
    selectedItemId: state.selectedItemId,
    searchQuery: state.searchQuery,
    zoomLevel: state.zoomLevel,
    viewMode: state.viewMode,
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
    filters: state.filters,
    imageHeight,
    maxWidth,
    isLoading: state.isLoading,
    error: state.error,
    fullPreviewVisible: state.fullPreviewVisible,
    fullPreviewFileId: state.fullPreviewFileId,
    bulkSelectedIds: state.bulkSelectedIds,
    bulkSelectedCount: state.bulkSelectedIds.length,
    uploadText: schema.dragDrop.uploadText,
    acceptedFileTypes: schema.dragDrop.acceptedFileTypes
  };
};

// Helper function to apply schema-defined filters
const applySchemaFilter = (items, filterConfig, value) => {
  switch (filterConfig.type) {
    case 'range':
      return items.filter(item => 
        item[filterConfig.name] >= value.min && 
        item[filterConfig.name] <= value.max
      );
    case 'select':
      return items.filter(item => 
        item[filterConfig.name] === value
      );
    default:
      return items;
  }
};
```

## 4. Universal Resource Manager View

```yaml
# src/components/universal/UniversalResourceManager.view.yaml
elementName: rvn-universal-resource-manager

onMount:
  handler: handleOnMount

viewDataSchema:
  type: object
  properties:
    schema:
      type: object
    flatGroups:
      type: array
    searchQuery:
      type: string
    zoomLevel:
      type: number
    viewMode:
      type: string
    imageHeight:
      type: number
    maxWidth:
      type: number
    isLoading:
      type: boolean
    error:
      type: string
    fullPreviewVisible:
      type: boolean
    bulkSelectedCount:
      type: number

propsSchema:
  type: object
  properties:
    schema:
      type: object
      description: Resource schema defining behavior
    resourceType:
      type: string
      description: Type of resource (images, audio, etc.)

refs:
  search-input:
    eventListeners:
      input-keydown:
        handler: handleSearchInput
  zoom-slider:
    eventListeners:
      change:
        handler: handleZoomChange
      input:
        handler: handleZoomChange
  zoom-out:
    eventListeners:
      click:
        handler: handleZoomOut
  zoom-in:
    eventListeners:
      click:
        handler: handleZoomIn
  view-mode-*:
    eventListeners:
      click:
        handler: handleViewModeChange
  sort-select:
    eventListeners:
      change:
        handler: handleSortChange
  filter-*:
    eventListeners:
      change:
        handler: handleFilterChange
  group-*:
    eventListeners:
      click:
        handler: handleGroupClick
  item-*:
    eventListeners:
      click:
        handler: handleItemClick
      dblclick:
        handler: handleItemDoubleClick
  bulk-select-*:
    eventListeners:
      click:
        handler: handleBulkSelectClick
  bulk-delete:
    eventListeners:
      click:
        handler: handleBulkDelete
  bulk-move:
    eventListeners:
      click:
        handler: handleBulkMove
  drag-drop-*:
    eventListeners:
      file-selected:
        handler: handleDragDropFileSelected
  preview-overlay:
    eventListeners:
      click:
        handler: handlePreviewOverlayClick

template:
  - 'rtgl-view w=f h=100vh g=lg style="overflow-y: scroll;"':
    # Header with search and controls
    - 'rtgl-view h=48 w=f bgc=bg bwb=xs ph=md av=c style="position: sticky; top: 0px; z-index: 1000;"':
      - rtgl-view d=h av=c g=xl w=f:
        - 'rtgl-input#search-input s=sm pl=xl placeholder="Search ${schema.displayName}..." value=${searchQuery} style="border:none; flex: 1;"':
        
        # View mode toggles
        - rtgl-view d=h av=c g=sm:
          - 'rtgl-button#view-mode-grid w=10 v=${viewMode === "grid" ? "pr" : "gh"} s=sm': "⊞"
          - 'rtgl-button#view-mode-list w=10 v=${viewMode === "list" ? "pr" : "gh"} s=sm': "≡"
          - 'rtgl-button#view-mode-card w=10 v=${viewMode === "card" ? "pr" : "gh"} s=sm': "▣"
        
        # Zoom controls (only for image-based resources)
        - $if schema.features.includes("zoom"):
          - rtgl-view d=h av=c g=sm:
            - rtgl-button#zoom-out w=10 v="gh" s=sm: "-"
            - input#zoom-slider type="range" w=120 min="0.5" max="4.0" step="0.1" value="${zoomLevel}":
            - rtgl-button#zoom-in w=10 v="gh" s=sm: "+"
        
        # Sort controls
        - rtgl-view d=h av=c g=sm:
          - rtgl-text s=sm: "Sort:"
          - select#sort-select:
            - $for field in schema.sortFields:
              - option value="${field}" selected="${field === sortBy}": "${field}"
    
    # Filters row
    - $if schema.filters && schema.filters.length > 0:
      - 'rtgl-view h=40 w=f bgc=mu-bg bwb=xs ph=md av=c style="position: sticky; top: 48px; z-index: 999;"':
        - rtgl-view d=h av=c g=md w=f:
          - $for filter in schema.filters:
            - rtgl-view d=h av=c g=sm:
              - rtgl-text s=sm: "${filter.name}:"
              - $if filter.type === "select":
                - select#filter-${filter.name} s=sm:
                  - option value="": "All"
                  - $for option in filter.options:
                    - option value="${option}": "${option}"
    
    # Bulk actions bar
    - $if bulkSelectedCount > 0:
      - 'rtgl-view h=40 w=f bgc=warning-bg bwb=xs ph=md av=c style="position: sticky; top: 88px; z-index: 998;"':
        - rtgl-view d=h av=c jc=sb w=f:
          - rtgl-text s=sm: "${bulkSelectedCount} items selected"
          - rtgl-view d=h av=c g=sm:
            - rtgl-button#bulk-delete v="danger" s=sm: "Delete"
            - rtgl-button#bulk-move v="se" s=sm: "Move"
    
    # Loading state
    - $if isLoading:
      - rtgl-view w=f h=400 av=c ah=c:
        - rtgl-text s=lg c=mu-fg: "Loading ${schema.displayName}..."
    
    # Error state
    - $elif error:
      - rtgl-view w=f h=400 av=c ah=c:
        - rtgl-text s=lg c=danger-fg: "${error}"
    
    # Main content
    - $elif flatGroups.length > 0:
      - $for group in flatGroups:
        - rtgl-view w=f ph=md:
          # Group header
          - 'rtgl-view#group-${group.id} d=h w=f av=c bgc=bg cur=p style="position: sticky; top: 128px; z-index: 997;"':
            - $if group.isCollapsed:
              - rtgl-svg wh=16 svg=folderArrowRight:
            - $else:
              - rtgl-svg wh=16 svg=folderArrowDown:
            - rtgl-view d=h av=c g=md:
              - rtgl-svg wh=16 svg=folder:
              - rtgl-text: ${group.fullLabel}
          
          # Group content
          - $if !group.isCollapsed:
            - rtgl-view w=f mb=md p=sm:
              # Grid/List/Card view based on viewMode
              - $if viewMode === "grid":
                - rtgl-view d=h fw=w g=md:
                  - $if group.hasChildren:
                    - $for item in group.children:
                      - 'rtgl-view#item-${item.id} cur=p style="${item.selectedStyle}" pos=rel':
                        - $if schema.preview === "image":
                          - rvn-file-image br=md mw=${maxWidth} h=${imageHeight} fileId=${item.fileId} key=${item.fileId}-${imageHeight}x${maxWidth}:
                        - $elif schema.preview === "waveform":
                          - rvn-waveform-visualizer w=${maxWidth} h=${imageHeight} fileId=${item.fileId}:
                        - $else:
                          - rtgl-view w=${maxWidth} h=${imageHeight} bgc=mu-bg av=c ah=c br=md:
                            - rtgl-svg wh=32 svg=${schema.icon}:
                            - rtgl-text s=sm ellipsis=true: ${item.name}
                        
                        # Bulk selection checkbox
                        - 'rtgl-view pos=abs style="top: 4px; right: 4px;"':
                          - 'rtgl-button#bulk-select-${item.id} w=6 h=6 v=${item.isSelected ? "pr" : "gh"} s=xs': "✓"
                        
                        # Item name
                        - rtgl-view w=f av=c mt=xs:
                          - rtgl-text s=sm ellipsis=true: ${item.name}
                  
                  # Drag and drop area
                  - rvn-drag-drop#drag-drop-${group.id} .uploadText=uploadText .acceptedFileTypes=acceptedFileTypes:
              
              - $elif viewMode === "list":
                - rtgl-view d=v g=xs:
                  - $if group.hasChildren:
                    - $for item in group.children:
                      - 'rtgl-view#item-${item.id} d=h av=c g=md ph=md pv=sm cur=p style="${item.selectedStyle}" bwb=xs':
                        - 'rtgl-button#bulk-select-${item.id} w=6 h=6 v=${item.isSelected ? "pr" : "gh"} s=xs': "✓"
                        - rtgl-svg wh=16 svg=${schema.icon}:
                        - rtgl-text s=sm flex=1: ${item.name}
                        - rtgl-text s=xs c=mu-fg: ${item.size | formatFileSize}
                        - rtgl-text s=xs c=mu-fg: ${item.dateModified | formatDate}
                  
                  - rvn-drag-drop#drag-drop-${group.id} .uploadText=uploadText .acceptedFileTypes=acceptedFileTypes:
              
              - $elif viewMode === "card":
                - rtgl-view d=h fw=w g=md:
                  - $if group.hasChildren:
                    - $for item in group.children:
                      - 'rtgl-view#item-${item.id} w=300 cur=p style="${item.selectedStyle}" bc=mu-bc bw=xs br=md p=md pos=rel':
                        - $if schema.preview === "image":
                          - rvn-file-image br=md w=f h=200 fileId=${item.fileId}:
                        - $elif schema.preview === "waveform":
                          - rvn-waveform-visualizer w=f h=200 fileId=${item.fileId}:
                        - $else:
                          - rtgl-view w=f h=200 bgc=mu-bg av=c ah=c br=md:
                            - rtgl-svg wh=48 svg=${schema.icon}:
                        
                        # Bulk selection checkbox
                        - 'rtgl-view pos=abs style="top: 8px; right: 8px;"':
                          - 'rtgl-button#bulk-select-${item.id} w=6 h=6 v=${item.isSelected ? "pr" : "gh"} s=xs': "✓"
                        
                        # Item info
                        - rtgl-view mt=md:
                          - rtgl-text s=md fw=bold: ${item.name}
                          - rtgl-text s=sm c=mu-fg: ${item.size | formatFileSize}
                          
                          # Custom fields
                          - $if schema.customFields:
                            - $for field in schema.customFields:
                              - $if item[field.name]:
                                - rtgl-view mt=xs:
                                  - rtgl-text s=sm c=mu-fg: "${field.label}: ${item[field.name]}"
                  
                  - rvn-drag-drop#drag-drop-${group.id} .uploadText=uploadText .acceptedFileTypes=acceptedFileTypes:
    
    # Empty state
    - $elif searchQuery:
      - rtgl-view w=f h=400 av=c ah=c:
        - rtgl-text s=lg c=mu-fg: 'No ${schema.displayName} found matching "${searchQuery}"'
    
    - $else:
      - rtgl-view w=f h=400 av=c ah=c:
        - rtgl-text s=lg c=mu-fg: 'No ${schema.displayName} found'
    
    # Spacer
    - rtgl-view h=33vh:
  
  # Full preview overlay
  - $if fullPreviewVisible:
    - rtgl-view#preview-overlay pos=fix cor=full ah=c av=c z=3000 cur=p:
      - rtgl-view w=f h=f pos=fix cor=full ah=c av=c bgc=bg op="0.5":
      - $if fullPreviewFileId:
        - $if schema.preview === "image":
          - rvn-file-image fileId=${fullPreviewFileId} w=80% h=80% z=3001:
        - $elif schema.preview === "waveform":
          - rvn-waveform-visualizer fileId=${fullPreviewFileId} w=80% h=80% z=3001:
```

## 5. Universal Resource Manager Handlers

```javascript
// src/components/universal/UniversalResourceManager.handlers.js
import { repository } from '../../deps/repository.js';

export const handlers = {
  handleOnMount: (event, { store, render, props }) => {
    const { schema, resourceType } = props;
    
    // Load initial data
    loadResourceData(resourceType, store);
    
    render();
  },
  
  handleSearchInput: (event, { store, render }) => {
    const query = event.target.value;
    store.setSearchQuery(query);
    render();
  },
  
  handleZoomChange: (event, { store, render }) => {
    const zoomLevel = parseFloat(event.target.value);
    store.setZoomLevel(zoomLevel);
    render();
  },
  
  handleZoomOut: (event, { store, render }) => {
    const state = store.getState();
    store.setZoomLevel(state.zoomLevel - 0.1);
    render();
  },
  
  handleZoomIn: (event, { store, render }) => {
    const state = store.getState();
    store.setZoomLevel(state.zoomLevel + 0.1);
    render();
  },
  
  handleViewModeChange: (event, { store, render }) => {
    const viewMode = event.target.id.replace('view-mode-', '');
    store.setViewMode(viewMode);
    render();
  },
  
  handleSortChange: (event, { store, render }) => {
    const sortBy = event.target.value;
    store.setSortBy(sortBy);
    render();
  },
  
  handleFilterChange: (event, { store, render }) => {
    const filterName = event.target.id.replace('filter-', '');
    const value = event.target.value || null;
    store.setFilter(filterName, value);
    render();
  },
  
  handleGroupClick: (event, { store, render }) => {
    const groupId = event.currentTarget.id.replace('group-', '');
    store.toggleGroupCollapse(groupId);
    render();
  },
  
  handleItemClick: (event, { store, render }) => {
    const itemId = event.currentTarget.id.replace('item-', '');
    store.setSelectedItemId(itemId);
    render();
  },
  
  handleItemDoubleClick: (event, { store, render, props }) => {
    const itemId = event.currentTarget.id.replace('item-', '');
    const { schema } = props;
    
    // Show full preview for image/audio resources
    if (schema.features.includes('preview')) {
      store.showFullPreview(itemId);
      render();
    }
  },
  
  handleBulkSelectClick: (event, { store, render }) => {
    event.stopPropagation();
    const itemId = event.currentTarget.id.replace('bulk-select-', '');
    store.toggleBulkSelection(itemId);
    render();
  },
  
  handleBulkDelete: async (event, { store, render, props }) => {
    const { resourceType } = props;
    const state = store.getState();
    
    if (confirm(`Delete ${state.bulkSelectedIds.length} items?`)) {
      store.setLoading(true);
      render();
      
      try {
        // Delete items from repository
        for (const itemId of state.bulkSelectedIds) {
          await repository.deleteResource(resourceType, itemId);
        }
        
        store.clearBulkSelection();
        await loadResourceData(resourceType, store);
      } catch (error) {
        store.setError(`Delete failed: ${error.message}`);
      } finally {
        store.setLoading(false);
        render();
      }
    }
  },
  
  handleBulkMove: async (event, { store, render, props }) => {
    const { resourceType } = props;
    const state = store.getState();
    
    // TODO: Implement bulk move functionality
    // This would open a folder selector dialog
    console.log('Bulk move not implemented yet', state.bulkSelectedIds);
  },
  
  handleDragDropFileSelected: async (event, { store, render, props }) => {
    const { resourceType, schema } = props;
    const { files, targetGroupId } = event.detail;
    
    store.setLoading(true);
    render();
    
    try {
      // Upload files to the target group
      for (const file of files) {
        await repository.uploadFile(resourceType, file, targetGroupId);
      }
      
      await loadResourceData(resourceType, store);
    } catch (error) {
      store.setError(`Upload failed: ${error.message}`);
    } finally {
      store.setLoading(false);
      render();
    }
  },
  
  handlePreviewOverlayClick: (event, { store, render }) => {
    store.hideFullPreview();
    render();
  }
};

// Helper function to load resource data
const loadResourceData = async (resourceType, store) => {
  try {
    store.setLoading(true);
    
    // Get resource data from repository
    const resources = await repository.getResourcesByType(resourceType);
    
    // Transform into flat groups structure (existing pattern)
    const flatGroups = transformToFlatGroups(resources);
    
    store.setResources(flatGroups);
  } catch (error) {
    store.setError(`Failed to load ${resourceType}: ${error.message}`);
  } finally {
    store.setLoading(false);
  }
};

// Transform repository data into the flat groups structure used by existing components
const transformToFlatGroups = (resources) => {
  // This would transform the repository data into the format expected by the view
  // Similar to how groupImagesView currently processes data
  return resources.map(group => ({
    id: group.id,
    fullLabel: group.name,
    children: group.items || [],
    hasChildren: (group.items || []).length > 0
  }));
};
```

## 6. Usage Examples - Replacing Existing Components

```javascript
// BEFORE: src/pages/images/images.handlers.js - 50+ lines
// AFTER: src/pages/images/images.handlers.js - 5 lines
import { RESOURCE_SCHEMAS } from '../../schemas/resourceSchemas.js';

export const handlers = {
  handleOnMount: (event, { render }) => {
    render();
  }
};

// BEFORE: src/pages/images/images.store.js - 100+ lines
// AFTER: src/pages/images/images.store.js - DELETED (no longer needed)

// BEFORE: src/pages/images/images.view.yaml - 30+ lines
// AFTER: src/pages/images/images.view.yaml - 8 lines
```

```yaml
# src/pages/images/images.view.yaml
elementName: rvn-images-page

onMount:
  handler: handleOnMount

template:
  - rtgl-view w=f h=f:
    - rvn-universal-resource-manager:
        schema: "{{resourceSchemas.images}}"
        resourceType: "images"

props:
  resourceSchemas: "{{RESOURCE_SCHEMAS}}"
```

## 7. Command Line Interface Example

```yaml
# src/components/universal/SchemaBasedCommandLine.view.yaml
elementName: rvn-schema-based-command-line

template:
  - rtgl-view w=f h=f d=v g=md:
    # Command selector
    - rtgl-view d=h av=c g=md:
      - rtgl-text s=sm: "Add Command:"
      - rtgl-select#command-selector:
        - $for command in availableCommands:
          - option value="${command.type}": "${command.displayName}"
    
    # Dynamic form based on selected command schema
    - $if selectedCommandSchema:
      - rtgl-form#command-form .form=commandForm:
    
    # Command preview
    - $if formData && selectedCommandSchema:
      - rtgl-view bgc=mu-bg p=md br=md:
        - rtgl-text s=sm c=mu-fg: "Preview:"
        - rtgl-text s=md: "${selectedCommandSchema.preview(formData)}"

props:
  availableCommands: "{{Object.values(COMMAND_SCHEMAS)}}"
  selectedCommandSchema: "{{COMMAND_SCHEMAS[selectedCommandType]}}"
  commandForm: "{{selectedCommandSchema?.form}}"
  formData: "{{currentFormData}}"
```

This schema-driven approach using proper Rettangoli-FE patterns eliminates the need for separate `groupImagesView`, `groupAudioView`, `commandLineBackground`, etc. components - they all become instances of universal components with different schemas!