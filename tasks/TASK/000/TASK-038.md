---
title: Bug Report
status: todo
priority: high
assignee: anyone
---

# Description

# Feedback & Issues Report

## General UI / UX Issues

- The input to enter the width and height for the layout container are still annoying, and the popups are still not repoisitioning correctly when first click
- The animation editor is confusing(it combine both left/right click to activate poup, it is better to be consistence with this)
- Somehow animation preview is not working
- Don't know if this is my computer problem, but whenever I click to other tabs for a while and return back to the client, it freeze for a solid 20 seconds or so.
- To delete something you need to click right click on it for a popup then choose delete, it might be better for the ux to also include an 'x' or a trashcan icon as well as right clicking to delete something
- On the left layout, whenever there is no folder or file, it has "No items, Click to create a folder" text appears, it might be beeter to include a button here or highlight the text more to make people less confuse on how to create a folder
- Having to go to another meny to change the character position on the screen is really anoying
- Should add prevent default as it still functions like a browser

---

## Layout Editor Issues & Suggestions

- In the layout editor, adding an option to stretch and shrink the element with your mouse without clicking the menu on the left would be nice
- In the layouts editor, we can't click and drag them directly, we must click on the left menu to interact with them
- After sometime of not focusing on the client and return back to the client, I got the this._cancelResize error. And the layouts don't show me anything

---

## Scene Editor Issues

- Scene Editor, when first create a new scene, it give me a black screen with only a plus symbol on the left, I can't click on the tabs at the top, because there were none, so I click on the plus symbol and it create another tab
- In the scene editor, if a line has too many text, it push the preview to the right.
- Scene editor take a huge amount of ram on my laptop, and it is really slow
- Scene editor, choice is not forcing people to choose. You can click on the textbox to ignore the choice completely
- Scene editor, can't choose which section to start the preview from
- Choice is still not working
- In scene editor the "Add Scene" button at the bottom center doesn't turn on the popup immediately, but it need to be pressed on the editor zomming map to turn on the popup. Need to turn on the popup immediately
- In scene editor, the arrow only correct between scenes whenever there is an arrow from one scene to another

---

## Bugs

1) when adding character on scene it's buggy and when deleting the character it's not properly deleting (or showing delete option where the character is not there) and not showing the option where the character is there  
Steps to reproduce

https://github.com/user-attachments/assets/2d8a30e4-8ffb-4123-8f18-4969150d3569

2) Character immediately not updated on the scene page when i add on the same line with existing character  
Steps to reproduce

https://github.com/user-attachments/assets/d8c114a2-ae29-47db-902e-bdaa6acaa6bb


3) When removing items it's not immediately updated on state page properly and sometimes evn on the section page

4) Unresponsive Scene layout, it's very buggy as shown in the below video  
Steps to reproduce

https://github.com/user-attachments/assets/85eacfb9-a18f-4e11-86f0-57c992acc591

5) If audio resource is removed from asset and if it's present on that line then it will not trigger that line and show blank  
error -> `Uncaught TypeError: s is not iterable`

---

## UX Problems

1) On character we need to be able to layer pictures like expressions or other things which is not supported in the client  
2) On the sounds page, when playing audio, can make the slider more visible so it's intent is clear  
3) User can benefit from keyboard actions, like delete to delete, f2 to rename, and other stuff which is not here in the creator

---

## Confused / Suggestions

- Adding multiple character on the same line causes to hide the previous character (if the character is same) need info on this, not sure if a bug or intended


