# Dependency Architecture Design Report

## Executive Summary

This report analyzes the current dependency management system in the RouteVN Creator Client and identifies that while the dual-platform setup is already well-designed, the main issue is the complex, multi-level dependency hierarchy. Handlers directly access both low-level infrastructure and high-level services, creating tight coupling and making the system difficult to maintain and test. This report proposes a reorganized dependency structure with clear layers and boundaries.

## Current Architecture Analysis

### Structure Overview

The application uses a dual-platform setup that's already well-designed:

- **Web Platform**: `src/setup.web.js` (168 lines)
- **Tauri Platform**: `src/setup.tauri.js` (201 lines)

Both platforms share a common `src/deps/` directory containing 25 specialized modules. **The platform separation is already solved correctly** - the real issue is the dependency organization.

### Current Dependency Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                    Handlers (Presentation)               │
│  • Direct access to RepositoryFactory (low level)       │
│  • Direct access to FileManagerFactory (infrastructure) │
│  • Direct access to AudioManager (service)              │
│  • Direct access to Subject (infrastructure)            │
│  └─────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                 Mixed Dependency Levels                  │
│  • RepositoryFactory → Repository → StoreAdapter        │
│  • FileManagerFactory → FileManager → StorageAdapter    │
│  • Services → Infrastructure → Platform Adapters        │
│  └─────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                Infrastructure Layer                      │
│  • Storage Adapters, File System, HTTP Client           │
│  └─────────────────────────────────────────────────────┘
```

### Positive Aspects (Keep These!)

1. **Good Platform Separation**: Dual setup files work correctly
2. **Single Responsibility**: Each module has one clear purpose
3. **Factory Patterns**: Good abstraction for complex object creation
4. **Modular Design**: Dependencies organized in dedicated modules

### Critical Issues - The Real Problems

#### 1. **Handlers Access Multiple Dependency Levels**
- **Problem**: 7+ handler files directly access `repositoryFactory`
- **Problem**: 8+ handler files directly access `fileManagerFactory`
- **Impact**: Violates separation of concerns, tight coupling
- **Example**:
  ```javascript
  // Handler accessing 4 different dependency levels
  const { store, repositoryFactory, fileManagerFactory, audioManager } = deps;
  const repository = await repositoryFactory.getByProject(p);
  const fileManager = await fileManagerFactory.getByProject(p);
  ```

#### 2. **Deep Dependency Chains**
- **Problem**: 4+ level dependency chains
- **Chain 1**: Handler → RepositoryFactory → Repository → StoreAdapter → FileSystem
- **Chain 2**: Handler → FileManagerFactory → FileManager → StorageAdapter → FileSystem
- **Impact**: Complex initialization, hard to reason about, difficult to test

#### 3. **Mixed Abstraction Levels**
- **Problem**: High-level handlers directly access low-level infrastructure
- **Examples**:
  - Repository operations in presentation layer
  - File management scattered across components
  - Storage operations mixed with business logic
- **Impact**: Tight coupling, code duplication, difficult to maintain

#### 4. **No Clear Layer Boundaries**
- **Expected**: Handlers → Services → Repository → Storage
- **Current**: Handlers → All Levels (Repository, FileManager, Storage, Services)
- **Impact**: Violates SOLID principles, poor architecture

#### 5. **Inconsistent Dependency Patterns**
- **Problem**: Some handlers use services, others bypass them
- **Problem**: Similar patterns implemented differently across files
- **Impact**: Inconsistent code, hard to understand and maintain

## Proposed Architecture Design

### Core Principles

Focus on organizing dependencies by clear layers and responsibilities:

1. **Clear Layer Boundaries**: Handlers → Services → Infrastructure (no skipping levels)
2. **Single Responsibility**: Each handler gets only the dependencies it needs
3. **Encapsulation**: Hide complex dependencies behind simple service interfaces
4. **Consistency**: Same patterns across all handlers
5. **Keep Working Solutions**: Don't fix what isn't broken (platform separation)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                 Presentation Layer                       │
│  ┌─────────────────┐    ┌─────────────────┐             │
│  │   Handlers      │    │    Stores       │             │
│  └─────────────────┘    └─────────────────┘             │
│  • Only access: store, render, services                  │
│  • No direct repository or file manager access          │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                 Service Layer                           │
│  ┌─────────────────┐    ┌─────────────────┐             │
│  │  ProjectService │    │  MediaService   │             │
│  └─────────────────┘    └─────────────────┘             │
│  ┌─────────────────┐    ┌─────────────────┐             │
│  │ AudioService    │    │ UIService       │             │
│  └─────────────────┘    └─────────────────┘             │
│  • Encapsulate repository and file manager access        │
│  • Provide simple, focused interfaces                  │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│              Infrastructure Layer                        │
│  ┌─────────────────┐    ┌─────────────────┐             │
│  │ Repository      │    │  FileManager    │             │
│  │   Factory       │    │    Factory      │             │
│  └─────────────────┘    └─────────────────┘             │
│  ┌─────────────────┐    ┌─────────────────┐             │
│  │ Storage         │    │  HTTP Client    │             │
│  │  Adapters       │    │                 │             │
│  └─────────────────┘    └─────────────────┘             │
│  • Keep current structure, it works well               │
└─────────────────────────────────────────────────────────┘
```

### Proposed Dependency Organization

Instead of moving files, let's organize dependencies better in the existing structure:

```
src/
├── setup.tauri.js                # Keep as-is (works well)
├── setup.web.js                  # Keep as-is (works well)
├── deps/                         # Reorganize this directory
│   ├── infrastructure/           # Low-level components (keep existing)
│   │   ├── storageAdapterFactory.js
│   │   ├── fileManagerFactory.js
│   │   ├── repository.js
│   │   └── createRouteVnHttpClient.js
│   ├── services/                 # New - high-level services
│   │   ├── projectService.js     # Handles all project operations
│   │   ├── mediaService.js       # Handles images, audio, videos
│   │   ├── uiService.js          # Handles dialogs, navigation
│   │   └── audioService.js       # Wraps audioManager
│   └── shared/                   # Keep existing shared components
│       ├── audioManager.js
│       ├── fontManager.js
│       ├── router.js
│       ├── subject.js
│       └── userConfig.js
└── pages/                        # Handler files stay here
```

**Key Change**: Add a thin service layer that encapsulates complex dependencies

### Key Design Patterns

#### 1. **Simple Configuration Object**

```javascript
// config/app.config.js
export const createAppConfig = () => ({
  api: {
    baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8788',
    timeout: parseInt(import.meta.env.VITE_API_TIMEOUT) || 5000,
    headers: {
      'Content-Type': 'application/json',
    },
  },
  storage: {
    type: import.meta.env.VITE_STORAGE_TYPE || 'auto', // 'indexeddb', 'filesystem', 'auto'
    options: {},
  },
  platform: {
    autoDetect: import.meta.env.VITE_PLATFORM_AUTO_DETECT !== 'false',
    force: import.meta.env.VITE_FORCE_PLATFORM || null, // 'web', 'tauri'
  },
});

// Simple platform detection
export const detectPlatform = (config) => {
  if (config.platform.force) {
    return config.platform.force;
  }

  return (typeof window !== 'undefined' && window.__TAURI__) ? 'tauri' : 'web';
};
```

#### 2. **Simple Function Factories**

```javascript
// setup/factories.js
export const createHttpClient = (config) => {
  return createRouteVnHttpClient({
    baseUrl: config.api.baseUrl,
    headers: config.api.headers,
  });
};

// Platform-specific adapters - SEPARATE FILES TO AVOID IMPORT ISSUES
export const createStorageAdapterFactory = async (platform, config) => {
  if (platform === 'web') {
    const { createWebStorageAdapterFactory } = await import('../adapters/web/webStorageFactory.js');
    return createWebStorageAdapterFactory();
  } else {
    const { createStorageAdapterFactory } = await import('../adapters/tauri/tauriStorageFactory.js');
    const { createKeyValueStore } = await import('../services/storage/keyValueStore.js');
    return createStorageAdapterFactory(createKeyValueStore());
  }
};

export const createFileManagerFactory = async (platform, config) => {
  const fontManager = createFontManager();
  const storageAdapterFactory = await createStorageAdapterFactory(platform, config);

  if (platform === 'web') {
    const { createWebFileManagerFactory } = await import('../adapters/web/webFileManagerFactory.js');
    return createWebFileManagerFactory(fontManager, storageAdapterFactory);
  } else {
    const { createFileManagerFactory } = await import('../adapters/tauri/tauriFileManagerFactory.js');
    return createFileManagerFactory(fontManager, storageAdapterFactory);
  }
};
```

#### 3. **Plain Dependency Object**

```javascript
// setup/index.js - Simple composition with dynamic imports
export const setupDependencies = async () => {
  const config = createAppConfig();
  const platform = detectPlatform(config);

  // Core services (platform-agnostic)
  const httpClient = createHttpClient(config);
  const subject = new Subject();
  const router = new Router();
  const audioManager = new AudioManager();
  const fontManager = createFontManager();
  const drenderer = await create2dRenderer({ subject });

  // Platform-specific services - DYNAMIC IMPORTS TO AVOID BUNDLE ISSUES
  const storageAdapterFactory = await createStorageAdapterFactory(platform, config);
  const fileManagerFactory = await createFileManagerFactory(platform, config);
  const repositoryFactory = await createRepositoryFactory(platform, config, storageAdapterFactory);
  const platformServices = await createPlatformServices(platform, config);

  return {
    // All dependencies in one simple object
    httpClient,
    subject,
    router,
    repositoryFactory,
    fileManagerFactory,
    audioManager,
    fontManager,
    drenderer,
    ...platformServices,
    config,
    platform,
  };
};
```

#### 4. **Platform Service Functions**

```javascript
// setup/platformServices.js - Dynamic imports to avoid bundle issues
export const createPlatformServices = async (platform, config) => {
  if (platform === 'web') {
    // Import only web-specific modules
    const [
      { createFilePicker },
      { createGlobalUI },
      { isInputFocused },
      { createKeyValueStore },
    ] = await Promise.all([
      import('../services/web/filePicker.js'),
      import('../services/web/globalUI.js'),
      import('../services/web/isInputFocused.js'),
      import('../services/web/keyValueStore.js'),
    ]);

    return {
      filePicker: createFilePicker(),
      globalUI: createGlobalUI(document.querySelector('rtgl-global-ui')),
      isInputFocused,
      keyValueStore: await createKeyValueStore(),
    };
  } else {
    // Import only Tauri-specific modules
    const [
      { createFilePicker },
      { createTauriDialog },
      { createGlobalUI },
      { isInputFocused },
      { createKeyValueStore },
      { createProjectsService },
      { createUpdater },
      { createBundleService },
      { setupCloseListener },
      { getVersion },
      { openUrl },
    ] = await Promise.all([
      import('../services/tauri/filePicker.js'),
      import('../services/tauri/tauriDialog.js'),
      import('../services/tauri/globalUI.js'),
      import('../services/web/isInputFocused.js'), // Shared
      import('../services/tauri/keyValueStore.js'),
      import('../services/tauri/projectsService.js'),
      import('../services/tauri/updater.js'),
      import('../services/tauri/bundleService.js'),
      import('../services/tauri/windowClose.js'),
      import('@tauri-apps/api/app'),
      import('@tauri-apps/plugin-opener'),
    ]);

    const keyValueStore = await createKeyValueStore();
    const globalUI = createGlobalUI(document.querySelector('rtgl-global-ui'));
    const appVersion = await getVersion();

    const projectsService = createProjectsService({
      keyValueStore,
      repositoryFactory: null, // Will be set later
      fileManagerFactory: null, // Will be set later
    });

    const updaterService = createUpdater({ globalUI, keyValueStore });
    const bundleService = createBundleService();

    setupCloseListener({ globalUI });

    return {
      filePicker: createFilePicker(),
      tauriDialog: createTauriDialog(),
      globalUI,
      isInputFocused,
      keyValueStore,
      projectsService,
      updaterService,
      bundleService,
      appVersion,
      openUrl,
    };
  }
};
```

#### 5. **Simple Repository Function**

```javascript
// services/repositories/createRepository.js - Dynamic imports to avoid bundle issues
export const createRepositoryFactory = async (platform, config, storageAdapterFactory) => {
  const initialData = {
    project: { name: "Project 1", description: "Project 1 description" },
    story: { initialSceneId: "" },
    images: { items: {}, tree: [] },
    // ... other initial data
  };

  if (platform === 'web') {
    const { createIndexeddbRepositoryAdapter } = await import('../adapters/web/indexedDbAdapter.js');
    const { createWebRepositoryFactory } = await import('../adapters/web/webRepositoryFactory.js');
    const repositoryAdapter = createIndexeddbRepositoryAdapter();
    return createWebRepositoryFactory(initialData, repositoryAdapter);
  } else {
    const { createRepositoryFactory } = await import('../adapters/tauri/tauriRepositoryFactory.js');
    const { createKeyValueStore } = await import('../services/tauri/keyValueStore.js');
    const keyValueStore = await createKeyValueStore();
    return createRepositoryFactory(initialData, keyValueStore);
  }
};

### Migration Strategy

#### Phase 1: Foundation (Week 1)
1. **Create configuration module**: Move all hardcoded values to config files
2. **Setup platform detection**: Simple platform detection function
3. **Create simple factory functions**: Replace complex classes with functions
4. **Create unified setup file**: Single entry point for dependency creation

#### Phase 2: Core Services (Week 2-3)
1. **Migrate core services**: Convert Audio, Font, Router to simple functions
2. **Unify storage adapters**: Simple function-based storage abstraction
3. **Simplify factories**: Remove complex inheritance, use composition
4. **Test setup**: Ensure all services work with new approach

#### Phase 3: Data Layer (Week 4)
1. **Migrate repositories**: Simple function-based repository creation
2. **Unify file managers**: Consistent APIs across platforms
3. **Simplify platform services**: Remove complex class hierarchies
4. **Update handlers**: Use new dependency object structure

#### Phase 4: Cleanup (Week 5)
1. **Remove old setup files**: Delete setup.web.js and setup.tauri.js
2. **Update all imports**: Use new unified setup
3. **Add documentation**: Simple setup and usage guide
4. **Performance testing**: Ensure no regressions

### Practical Implementation Examples

#### Before: Complex Handler Dependencies

```javascript
// ❌ Current approach - handler accessing multiple levels
export const handleImageUpload = async (deps, payload) => {
  const {
    store,
    render,
    repositoryFactory,        // Low level
    fileManagerFactory,       // Low level
    router,                   // Infrastructure
    globalUI                 // High level
  } = deps;

  // Complex multi-level operations
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const fileManager = await fileManagerFactory.getByProject(projectId);

  // More complex logic...
};
```

#### After: Clean Service-Layer Dependencies

```javascript
// ✅ Clean approach - handler only uses high-level services
export const handleImageUpload = async ({ store, render, mediaService, uiService }) => {
  try {
    const result = await mediaService.uploadImage(store.getSelectedProject(), payload.file);

    store.addImage(result);
    render();
  } catch (error) {
    uiService.showAlert(`Upload failed: ${error.message}`);
  }
};
```

### Migration Strategy

#### Phase 1: Create Service Layer (Week 1)
1. **Create service files**: `deps/services/projectService.js`, `mediaService.js`, `uiService.js`
2. **Wrap existing functionality**: Don't rewrite, just encapsulate
3. **Add services to setup**: Include in both setup.tauri.js and setup.web.js

#### Phase 2: Update Handlers (Week 2-3)
1. **Start with new handlers**: Use service pattern for new code
2. **Gradually update existing handlers**: Replace direct dependencies
3. **Keep old dependencies available**: Backwards compatibility during transition

#### Phase 3: Cleanup (Week 4)
1. **Remove old dependencies**: Once all handlers use services
2. **Update documentation**: New patterns for handlers
3. **Add tests**: Test service layer boundaries

### Benefits of Service Layer Approach

#### 1. **Clear Boundaries**
- **Handlers**: Only deal with UI logic and state management
- **Services**: Handle business logic and infrastructure
- **Infrastructure**: Keep existing factory pattern (works well)

#### 2. **Easy to Test**
```javascript
// ✅ Easy to mock services in tests
const mockMediaService = {
  uploadImage: jest.fn().mockResolvedValue({ id: 'test' })
};
```

#### 3. **Consistent Patterns**
- All handlers follow same dependency pattern
- No more "sometimes use repository, sometimes use service"
- Clear naming conventions

#### 4. **Minimal Disruption**
- Keep existing setup files
- Keep existing infrastructure layer
- Just add thin service layer on top

#### 5. **Easy to Debug**
- Clear call stack: Handler → Service → Infrastructure
- No more jumping between abstraction levels
- Service layer isolates problems

## Implementation Examples

### New Unified Setup File

```javascript
// src/setup.js - Single unified setup
import { createAppConfig, detectPlatform } from './config/app.config.js';
import { setupDependencies } from './setup/index.js';

export async function initializeApp() {
  // Create all dependencies in one place
  const deps = await setupDependencies();

  // Export the dependencies and create patch
  const { h, patch } = await import('@rettangoli/fe');

  // Split dependencies for pages and components if needed
  const finalDeps = {
    components: { ...deps },
    pages: { ...deps },
  };

  return { h, patch, deps: finalDeps };
}
```

### Handler with Simple Dependencies

```javascript
// Before: Manual dependency injection
export const handleCreateButtonClick = async (deps) => {
  const { render, store } = deps;
  store.toggleDialog();
  render();
};

// After: Simple destructuring
export const handleCreateButtonClick = async ({ store, render }) => {
  store.toggleDialog();
  render();
};

export const handleBrowseFolder = async ({ store, render, tauriDialog, globalUI }) => {
  try {
    const selected = await tauriDialog.openFolderDialog({
      title: "Select Project Location",
    });

    if (selected) {
      store.setProjectPath(selected);
      render();
    }
  } catch (error) {
    globalUI.showAlert({
      message: `Error selecting folder: ${error.message}`,
      title: "Error",
    });
  }
};
```

### Complete Example Usage

```javascript
// main.js - Application entry point
import { initializeApp } from './setup.js';

async function main() {
  const { h, patch, deps } = await initializeApp();

  // Start the application
  // All components get the same deps object
  const app = createApp({ h, patch, deps });
  app.mount('#app');
}

main();
```

### Simple Configuration Example

```javascript
// config/app.config.js
export const createAppConfig = () => ({
  api: {
    baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:8788',
    timeout: 5000,
  },
  features: {
    multiProject: import.meta.env.VITE_ENABLE_MULTI_PROJECT !== 'false',
    updater: import.meta.env.VITE_ENABLE_UPDATER !== 'false',
  },
});

// Simple usage in handlers
export const handleFeature = ({ config }) => {
  if (config.features.multiProject) {
    // Do multi-project logic
  } else {
    // Do single-project logic
  }
};
```

## Risk Assessment

### High Risk Items
1. **Breaking Changes**: Large-scale refactor will break existing code
2. **Migration Complexity**: 200+ files need updates
3. **Testing Coverage**: Comprehensive test suite required

### Medium Risk Items
1. **Performance Impact**: New abstraction layer might affect performance
2. **Learning Curve**: Team needs to learn new patterns
3. **Debugging Complexity**: Dependency injection can be harder to debug

### Mitigation Strategies
1. **Incremental Migration**: Phase-by-phase approach reduces risk
2. **Comprehensive Testing**: 100% test coverage during migration
3. **Fallback Strategy**: Keep old code working during transition
4. **Team Training**: Workshops on new architecture patterns

## Conclusion

The proposed dependency architecture addresses the current system's major issues while maintaining its strengths. By implementing modern dependency injection patterns, interface-based design, and unified configuration management, we can create a more maintainable, testable, and scalable codebase.

The migration requires significant upfront investment but will pay dividends in:
- **Reduced maintenance costs**
- **Improved developer productivity**
- **Enhanced code quality**
- **Better platform consistency**

Recommended next steps:
1. **Prototype the container implementation** to validate the approach
2. **Create detailed migration plan** with specific timelines
3. **Set up automated testing** to prevent regressions
4. **Begin Phase 1 migration** with core infrastructure

## References

1. **Martin Fowler - Inversion of Control Containers and the Dependency Injection Pattern** - Foundational DI principles
2. **InversifyJS Documentation** - Modern TypeScript DI implementation patterns
3. **SOLID Principles** - Robert C. Martin's object-oriented design principles
4. **Clean Architecture** - Robert C. Martin's architectural patterns
5. **Dependency Injection in .NET Core** - Microsoft's modern DI implementation (applicable patterns)

---

*This report was generated based on analysis of the current codebase structure and modern software architecture best practices as of 2025.*