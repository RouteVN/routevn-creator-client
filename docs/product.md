# Product

## Purpose

RouteVN Creator exists to let non-technical users create visual novels without writing code.

The product must keep the experience easy, clear, and delightful while still giving users powerful functionality.

## Core Tension

Easy-to-use tools often become limited tools.

RouteVN should not solve that by becoming technical, script-heavy, or intimidating.
It should solve it by keeping the default experience simple while allowing users to go deeper when they need more control.

## Product Principles

### 1. No-Code Authoring

- Users must be able to build and edit visual novels without writing code.
- Core workflows must be represented through clear UI actions, forms, selectors, and structured editors.
- If a feature depends on technical knowledge to be usable, the product design is wrong.

### 2. Consistency

- Consistency is critical.
- Users should learn an interaction once and reuse it across the product.
- Similar concepts must use similar controls, terminology, feedback, and navigation patterns.
- Avoid surprising exceptions unless there is a strong product reason.

### 3. Start Simple, Go Advanced

- The default UI should show the plain minimum necessary to complete the task.
- Advanced options should be available without making the basic path feel heavy or cluttered.
- Progressive disclosure is preferred over putting every option on screen at once.
- Beginner users should feel safe starting.
- Advanced users should not feel blocked once they want more control.

### 4. Keyboard Support

- The product should support complete keyboard-based operation for core workflows.
- Advanced users who spend long periods in the editor must be able to work efficiently without relying on the mouse.
- Mouse interactions must still be available and first-class.
- Keyboard support is not an enhancement layer. It is part of the product contract.

### 5. Speed Is A Feature

- Users should not wait for routine actions.
- Core editing flows should feel immediate.
- Loading, blocking transitions, and visible waiting should be treated as product failures unless there is no practical alternative.
- The product should optimize for perceived instant response, especially in workflows that users repeat many times.

### 6. Reliability And Longevity

- Reliability is a high-priority product feature.
- During early development there may be churn, but the long-term standard is stability.
- Once features and formats are established, they should keep working for many years.
- Data formats, project behavior, and core workflows should not break casually.
- User trust depends on the product being dependable over time, not only pleasant in the moment.

### 7. Documentation Over UI Clutter

- The product should not overload the interface with tutorials, onboarding flows, coach marks, or persistent guidance noise.
- Inline help should be used only where users need frequent reference while doing the work.
- When users need deeper explanation, the default solution should usually be a clear link to documentation.
- The UI should stay focused on creation work, not on constantly teaching itself.

### 8. Familiarity

- The product should feel familiar to users.
- We should learn from other strong products instead of inventing unnecessary new interaction patterns.
- When a common pattern already exists and works well, prefer using it.
- Familiarity reduces learning cost and helps users build confidence quickly.

## Examples

### 1. No-Code Authoring

- RouteVN should not expose a scripting-language escape hatch for core visual novel functionality.
- Branching, variables, scene flow, actions, and presentation behavior should be expressed through structured product features, not custom user code.
- Code is not only harder to write. It is also harder to maintain and increases the surface area for breakage over time.

### 2. Consistency

- Resource pages should follow the same layout pattern.
- File explorer on the left.
- List in the middle.
- Detail panel on the right.
- Once a user learns one resource page, they should already understand the others.
- This also simplifies the codebase because common behavior and structure can be implemented once and reused.

## Pages Overview

### Projects

- Shows the user's projects.
- Users can create a project from here.

### Project Page

- Shows the basic information about the current project.

### Resource Pages

- These pages manage reusable project resources.
- There is one page for each resource type.

Assets:

- images
- sounds
- videos
- characters
- character sprites
- transforms
- tweens

UI:

- colors
- fonts
- typography
- layouts
- layout editor: a full design tool for building UI layouts.

Systems:

- variables

### Scene Map

- A visual place to organize and explore scenes.

### Scene Editor

- The main place to write visual novels.
- It combines text editing, sections, preview, and actions.

### Release Page

- Used to prepare project release output.

### Settings / About

- Used for settings, application information, and product information.
