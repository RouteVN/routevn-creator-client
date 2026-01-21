---
title: Bug Report
status: todo
priority: high
assignee: anyone
---

# Description

# Feedback & Issues Report

## General UI / UX Issues

- [ ] [Low] The input to enter the width and height for the layout container are still annoying, and the popups are still not repoisitioning correctly when first click
- [ ] [Low] The animation editor is confusing(it combine both left/right click to activate poup, it is better to be consistence with this)
- [x] [High] @Nghia Somehow animation preview is not working
- [x] [High] @Nghia Don't know if this is my computer problem, but whenever I click to other tabs for a while and return back to the client, it freeze for a solid 20 seconds or so. (Can't reproduce this error)
- [ ] [Low] On the left layout, whenever there is no folder or file, it has "No items, Click to create a folder" text appears, it might be beeter to include a button here or highlight the text more to make people less confuse on how to create a folder
- [ ] [Low] Having to go to another meny to change the character position on the screen is really anoying
- [ ] [Low] Should add prevent default as it still functions like a browser

---

## Layout Editor Issues & Suggestions

- [ ] [Low] In the layout editor, adding an option to stretch and shrink the element with your mouse without clicking the menu on the left would be nice
- [ ] [Low] In the layouts editor, we can't click and drag them directly, we must click on the left menu to interact with them
- [ ] [High] @Nghia After sometime of not focusing on the client and return back to the client, I got the this._cancelResize error. And the layouts don't show me anything

---

## Scene Editor Issues

- [x] [Critical] @Nghia Scene Editor, when first create a new scene, it give me a black screen with only a plus symbol on the left, I can't click on the tabs at the top, because there were none, so I click on the plus symbol and it create another tab
- [ ] [Medium] In the scene editor, if a line has too many text, it push the preview to the right.
- [x] [High] @nellow Scene editor take a huge amount of ram on my laptop, and it is really slow (Need to double check, if less than 100 then good) (Can't reproduce the error)
- [x] [High] @nellow Scene editor, choice is not forcing people to choose. You can click on the textbox to ignore the choice completely
- [ ] [High] @nellow Scene editor, when there's a line with content and we press enter and not let go, it will copy that content on each preceding new line.
- [ ] [Low] Scene editor, can't choose which section to start the preview from
- [x] [High] @Nghia Choice is still not working
- [x] [High] @Nghia The vn-preview is not covering the whole screen.
- [ ] [Low] @Nghia In scene editor the "Add Scene" button at the bottom center doesn't turn on the popup immediately, but it need to be pressed on the editor zomming map to turn on the popup. Need to turn on the popup immediately (Luciano need to think more about UX)
- [ ] [Low] In scene editor, the arrow only correct between scenes whenever there is an arrow from one scene to another

---

## Bugs

- [x] [High] @nellow when adding character on scene it's buggy and when deleting the character it's not properly deleting (or showing delete option where the character is not there) and not showing the option where the character is there
Steps to reproduce

https://github.com/user-attachments/assets/2d8a30e4-8ffb-4123-8f18-4969150d3569

- [x] [High] @nellow Character immediately not updated on the scene page when i add on the same line with existing character
Steps to reproduce

https://github.com/user-attachments/assets/d8c114a2-ae29-47db-902e-bdaa6acaa6bb


- [x] [High] @Nghia When removing items it's not immediately updated on state page properly and sometimes evn on the section page (duplicated)

- [x] [High] @nellow Unresponsive Scene layout, it's very buggy as shown in the below video
Steps to reproduce

https://github.com/user-attachments/assets/85eacfb9-a18f-4e11-86f0-57c992acc591

- [x] [High] @Nghia If audio resource is removed from asset and if it's present on that line then it will not trigger that line and show blank
error -> `Uncaught TypeError: s is not iterable`

- [ ] [Medium] Add arrow for the choices as well

- [x] [High] When in the transform we set a custom scaleX and scaleY. we apply the transform in the scene editor for characters. it does not work. the with and height is still the same. expected: width and height of character sprite should be updated based on the scaleX and scaleY

- [x] @nellow [High] When we copy some rich text. And then try to paste it into the scene editor text. The text input gets messed up. Correct behavior:
  - We should remove all text styling before pasting. The text input should not be styled by anything
  - Should think of how it handles new lines. 

- [ ] [Medium] For the Scene Map. Arrows are automatically added when scenes have transitions. However it is not added for choices with transitions. It should apply for choices with transitions as well.

- [ ] [High] add adding animation to background, with tween fade in. and then you navigate around different lines, or preview it. the animation runs everytime you click. expected: it should run only once for that line

- [x] [High] @nellow: bug with dialogue and fade: https://discord.com/channels/1233660682419834920/1461203575123480707/1461203575123480707

---

## UX Problems

- [ ] [Low] On character we need to be able to layer pictures like expressions or other things which is not supported in the client
- [ ] [Low] On the sounds page, when playing audio, can make the slider more visible so it's intent is clear
- [ ] [Low] User can benefit from keyboard actions, like delete to delete, f2 to rename, and other stuff which is not here in the creator
- [ ] [High] Scene editor, on the right of the preview button. There should be an icon to mute/unmute. mute/unmute should apply to: bgm, sfx. propose how to implmement mute (set volume to 0, remove bgm/sfx actions or what)

---

## Confused / Suggestions

- Adding multiple character on the same line causes to hide the previous character (if the character is same) need info on this, not sure if a bug or intended


