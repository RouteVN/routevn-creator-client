---
title: usability feedback
status: done
priority: high
---

# Description
watching the usability test now here's some things i think would make the user experience better and some bugs i found which wasnt mentioned on the tasks

bugs : 

- [ ] [low] seems like you can drag the icon from the line editor and it will give a url (6:31 - 6:33)
- [x] [low] can select a character without any sprite (dont know if is intended) but should have validation (7:45)
- [ ] [low] Should make the choices layout required (20:15)
- [ ] [low] add transform, should make the transform name required (34:32)


While making usability test, please mention the client version, i noticed that there there was no validation on color creation form but on latest one there is validation for that

Bugs outside of the video

- [ ] [medium] @nellow when the element is selected, the hover effect wont get triggered? (dont know if intended)
- [ ] [critical] @han4wluc layout editor is broken, `Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'handleActions')` and will not show any thing on the file explorer
- [x] [medium] add label on character selection on scene editor
- [x] [high] user can preview from a selected line or section they're at


# UX

- need to think about selecting the character name, user has to click too many times to change character name on dialogue. 
- for the required items, it's better to put a aestrik * on the field so they know that it's required 
  - reason: User tried to create a project without description but failed because they didnt know it was requirement
- User was confused, so they added the character without sprites, thinking it would show the person's name but had to let them know that it should be done by dialogue. Maybe a tooltip would help?  (7:57)
- User might have expected the transform to work as the slider changed (33:40)