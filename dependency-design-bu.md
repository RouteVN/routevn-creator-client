# Dependency Architecture Design Report

## Executive Summary

This report analyzes the current dependency management system in the RouteVN Creator Client and proposes a modern, maintainable architecture based on industry best practices. The current system demonstrates functional separation of concerns but suffers from code duplication, tight coupling, and inconsistent patterns between Web and Tauri platforms.

## Current Architecture Analysis

### Structure Overview

The application uses a dual-platform setup with two separate initialization files:

- **Web Platform**: `src/setup.web.js` (168 lines)
- **Tauri Platform**: `src/setup.tauri.js` (201 lines)

Both platforms share a common `src/deps/` directory containing 23 specialized modules organized around factory patterns and platform-specific adapters.

### Current Dependency Flow

```
HttpClient → Subject → Router → RepositoryFactory → FileManagerFactory →
StorageAdapter → FontManager → AudioManager → 2DRenderer → [Platform Services]
```

### Positive Aspects

1. **Clear Separation of Concerns**: Each module has a single responsibility
2. **Factory Pattern Usage**: Proper abstraction for complex object creation
3. **Platform Abstraction**: Clean separation between Web and Tauri implementations
4. **Modular Design**: Dependencies are well-organized in dedicated modules

### Critical Issues

#### 1. **Massive Code Duplication**
- **Problem**: 40+ lines of nearly identical code between setup files
- **Impact**: Maintenance burden, inconsistent behavior, high chance of bugs
- **Evidence**: Both files manually instantiate dependencies with minor variations

#### 2. **Tight Coupling & Hard Dependencies**
- **Problem**: Direct instantiation creates hidden dependencies
- **Impact**: Difficult to test, violates Dependency Inversion Principle
- **Example**:
  ```javascript
  // Current approach - tightly coupled
  const httpClient = createRouteVnHttpClient({ baseUrl: "http://localhost:8788" });
  const repositoryFactory = createRepositoryFactory(initialData, keyValueStore);
  ```

#### 3. **Inconsistent Factory Patterns**
- **Problem**: Web and Tauri factories have different APIs
- **Impact**: Cognitive overhead, platform-specific bugs
- **Evidence**: `getByProject(_projectId)` vs `getByProject(projectId)`

#### 4. **Manual Dependency Management**
- **Problem**: No dependency container, manual wiring
- **Impact**: Error-prone, difficult to extend, testing challenges
- **Current State**: 201 lines of manual dependency injection in Tauri setup

#### 5. **Platform-Specific Architecture Drift**
- **Problem**: Web and Tauri have fundamentally different capabilities
- **Impact**: Inconsistent user experience, code duplication
- **Examples**:
  - Web: Single project only
  - Tauri: Multi-project support with ProjectsService

#### 6. **Configuration Hardcoding**
- **Problem**: Configuration values scattered throughout setup files
- **Impact**: Difficult to configure for different environments
- **Evidence**: Hardcoded URLs, paths, and settings

## Proposed Architecture Design

### Core Principles

A simple, functional approach that avoids classes and DI containers:

1. **Composition over Inheritance**: Simple functions that compose together
2. **Explicit Dependencies**: Clear function signatures, no hidden magic
3. **Single Source of Truth**: One place to configure everything
4. **Platform Abstraction**: Simple platform detection and adaptation
5. **Configuration-Driven**: External configuration, not hardcoded values

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Single Setup File                         │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │   Configuration │    │ Platform Detect │                 │
│  └─────────────────┘    └─────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Simple Dependency Object                     │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │   Core Services │    │  Factories      │                 │
│  └─────────────────┘    └─────────────────┘                 │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │   Managers      │    │  Adapters       │                 │
│  └─────────────────┘    └─────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Application Components                       │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │     Pages       │    │   Components    │                 │
│  └─────────────────┘    └─────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

### Proposed Directory Structure

```
src/
├── config/
│   ├── app.config.js             # Application configuration
│   ├── platform.config.js        # Platform-specific settings
│   └── environment.config.js     # Environment variables
├── setup/
│   ├── platform.js               # Platform detection utilities
│   ├── coreServices.js           # Core service creation
│   ├── platformServices.js       # Platform-specific services
│   ├── factories.js              # Factory functions
│   └── index.js                  # Main setup entry point
├── services/                     # Core services (replaces deps/)
│   ├── storage/                  # Storage functions
│   │   ├── indexedDbStorage.js
│   │   └── fileSystemStorage.js
│   ├── http/                     # HTTP client
│   │   └── createHttpClient.js
│   ├── audio/                    # Audio management
│   │   └── audioManager.js
│   ├── fonts/                    # Font management
│   │   └── fontManager.js
│   └── repositories/             # Data access
│       └── createRepository.js
├── adapters/                     # Platform adapters
│   ├── web/
│   │   ├── webServices.js
│   │   └── webAdapters.js
│   └── tauri/
│       ├── tauriServices.js
│       └── tauriAdapters.js
├── setup.js                      # Single unified setup file
└── app.js                        # Application entry point
```

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

### Benefits of New Architecture

#### 1. **Simplicity & Maintainability**
- **Single Setup File**: One place to see all dependencies
- **Plain Functions**: Easy to understand and test
- **Explicit Dependencies**: Clear what each function needs
- **No Magic**: Everything is visible in the code

#### 2. **Flexibility**
- **Easy to Modify**: Change configuration in one place
- **Platform Detection**: Simple if/else logic, no complex abstractions
- **Easy to Extend**: Add new services by adding new functions
- **Minimal Overhead**: No complex container or class hierarchy

#### 3. **Developer Experience**
- **Easy to Debug**: Just follow the function calls
- **Easy to Test**: Mock individual functions easily
- **Clear Structure**: Simple directory organization
- **No Hidden Dependencies**: Everything is explicit

#### 4. **Performance**
- **No Overhead**: No complex container or reflection
- **Faster Startup**: Simple function calls
- **Smaller Bundle Size**: No unused abstraction code
- **Easy to Optimize**: Clear where performance bottlenecks are

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