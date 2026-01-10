Scene Editor consist of the Lines Editor on the left and the Preview as well as the Presentation State on the right

![alt text](./images/Scene-editor.png)

## Lines Editor

This is where you input text for dialog.
The Icons on the right of the Lines Editor are to show the changes in the scene.

For example:

If we were to add a character on line 1, and then delete the character on line 5. Than the Line Editor will show a character sprite on line 1. It should not show any sprite of the character on line 2-4. It will show the sprite of the character with a cross icon for line 5.


The Icon changes based on what happend to the asset

Overall, the changes is calculated as below:
changes = f( prevLinePresentationState, currentLineActions )

- If the changes is `add` then it should show the sprite of the newly added asset 
    - Except for music and sound, then it just gonna show the icon
- If the changes is `udpate` then it should show the sprite of the newly updated asset
    - Except for music and sound, then it just gonna show the icon
- If the changes is `delete` then it should show the sprite of the deleted asset with a cross icon
    - In case of deletion within the original line that the asset was added in, then the asset will be deleted.

## Presentation State

The Presentation State contains all the information that is rendered in the Preview.

There should be one asset type representing each assets that is being shown in the Preview.
It is created by combining all the actions in the Line Editor into the current presenentation of the current line being selected.

For example:

If we were to add a character on line 1, and then delete the character on line 5. Than the Presentation State will show a character asset type from line 1 to line 4. And it will not show for line 5.

Right-clicking on one of the asset type will open up the popup menu, in this popup menu you can delete the asset type from that line and every line after it.

### Command Line

Inside the Presentation State, you can press on the button with the plus icon at the bottom or any of the asset type to open up the command line:

![alt text](./images/Scene-editor/Command%20Line.png.png)

The command line is a form that you can use to update the state of the asset of the line. It shows the final state of the asset type(Presentation State).

When it is opened by pressing the button with the plus icon it shows all of the possible asset type to edit/add

When it is opened by pressing one of the asset type in the Presentation State, it shows the State of the asset type for that line.