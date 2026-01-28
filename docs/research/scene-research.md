---
Title : Scene Editor Discoverability
---

###  Current Situation & How It Works

The whiteboard displays each scene from the project's scenes data as a rectangular node, The initial scene in the story data is visually distinguished with a "Start" circle and an arrow

#### How we can interact with it right now

- Aside from the circle, when we select a scene, it will be selected with a border color
- When we double click the scene it opens the selected scene in the Scene Editor.
- When we right click it opens a context menu with options like "Set as Initial Scene" or "Delete"
- When we drag the scene when it's selected it moves the scene node around the canvas.

The current scene editor's issue is a lack of discoverability for the primary navigation action (opening the editor), users mostly try to click on the start option which is not where they should be clicking at

#### Issues

- The user doesn't know the action is possible at the start
- The cursor changes to a "move" cursor which might tell that the primary action is dragging, not entering or editing. This actively misleads the user.
-  The "Start" circle looks like a button or an interactive element. Users instinctively try to click it, expecting it to either start a preview or allow them to change the start scene. Since it does nothing, it creates confusion and erodes user trust in the interface.

## How other applications solve this issue?

1) [Twine](https://twinery.org)

    - Though on the web version i couldn't find anything special it shows a icon on the start
    - when clicked, tool bar is triggered with actions (we don't have that so maybe we can add a floating bar that will present with options such as "Open" and preview "Preview")
    - On each scene it adds a little description that then when double clicked open up the editor for writing the story for that scene

2) Unity (visual scripting)

    <img src="/docs/images/research/unity.png"></img>

    - On unity, nodes represent code or logic when we hover over the node it get's selected with a white outline and when we select it, it turns it color into blue and it shows the information of the node on the inspector.

3) [Draw.io](https://app.diagrams.net/)

    - It also uses similar pattern, when hovered, it selectes an element. Though this is more general purpose tool, selecting the element will change the details on the detail panel, double clicking on the element will trigger a text mode where you can write inside of that element

4) [Obsidian (Graph View)](https://obsidian.md/#:~:text=Seamless%20editing)

    - Havent tried this as it required installation but it seems like hovering over a node (which represents a note) shows a preview of its content in a pop-up window
    - A single click on a node opens the corresponding note in a new editor pane.

## What might suit RouteVn?

Since every app has different behaviour, and by looking at the behaviour of these platforms we can do this


- When a user hovers over scene nodes, we can highlight it
-  When a user hovers over a scene node, a small edit button with pencil icon appears on the node. Clicking this button navigates to the scene editor. We also keep the double click functionality, this way the user might know what the action is intended for
- For the start circle, i think it's better if we remove it, and instead on the initial scene, we add a visual indicator like "Start" on top of the scene like

<img src="/docs/images/research/start.png"></img>

