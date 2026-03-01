import { COMMAND_TYPES } from "./constants.js";
import { DomainPreconditionError } from "./errors.js";

const assert = (condition, message, details = {}) => {
  if (!condition) {
    throw new DomainPreconditionError(message, details);
  }
};

export const assertCommandPreconditions = (state, command) => {
  const p = command.payload;

  if (state?.project?.id) {
    assert(state.project.id === command.projectId, "projectId mismatch", {
      expected: state.project.id,
      got: command.projectId,
    });
  }

  switch (command.type) {
    case COMMAND_TYPES.PROJECT_CREATED:
      return;
    case COMMAND_TYPES.PROJECT_UPDATE:
      return;

    case COMMAND_TYPES.SCENE_CREATE:
      assert(!state.scenes[p.sceneId], "scene already exists", {
        sceneId: p.sceneId,
      });
      return;
    case COMMAND_TYPES.SCENE_UPDATE:
    case COMMAND_TYPES.SCENE_RENAME:
    case COMMAND_TYPES.SCENE_DELETE:
    case COMMAND_TYPES.SCENE_SET_INITIAL:
    case COMMAND_TYPES.SCENE_REORDER:
      assert(!!state.scenes[p.sceneId], "scene not found", {
        sceneId: p.sceneId,
      });
      return;

    case COMMAND_TYPES.SECTION_CREATE:
      assert(!!state.scenes[p.sceneId], "parent scene not found", {
        sceneId: p.sceneId,
      });
      assert(!state.sections[p.sectionId], "section already exists", {
        sectionId: p.sectionId,
      });
      return;
    case COMMAND_TYPES.SECTION_RENAME:
    case COMMAND_TYPES.SECTION_DELETE:
    case COMMAND_TYPES.SECTION_REORDER:
      assert(!!state.sections[p.sectionId], "section not found", {
        sectionId: p.sectionId,
      });
      return;

    case COMMAND_TYPES.LINE_INSERT_AFTER:
      assert(!!state.sections[p.sectionId], "section not found", {
        sectionId: p.sectionId,
      });
      assert(!state.lines[p.lineId], "line already exists", {
        lineId: p.lineId,
      });
      if (p.afterLineId !== undefined && p.afterLineId !== null) {
        assert(!!state.lines[p.afterLineId], "afterLineId not found", {
          afterLineId: p.afterLineId,
        });
        assert(
          state.lines[p.afterLineId].sectionId === p.sectionId,
          "afterLineId must belong to target section",
          {
            afterLineId: p.afterLineId,
            sectionId: p.sectionId,
            actualSectionId: state.lines[p.afterLineId].sectionId,
          },
        );
      }
      return;
    case COMMAND_TYPES.LINE_UPDATE_ACTIONS:
    case COMMAND_TYPES.LINE_DELETE:
      assert(!!state.lines[p.lineId], "line not found", { lineId: p.lineId });
      return;
    case COMMAND_TYPES.LINE_MOVE:
      assert(!!state.lines[p.lineId], "line not found", { lineId: p.lineId });
      assert(!!state.sections[p.toSectionId], "target section not found", {
        toSectionId: p.toSectionId,
      });
      return;

    case COMMAND_TYPES.RESOURCE_CREATE:
      assert(
        !state.resources?.[p.resourceType]?.items?.[p.resourceId],
        "resource already exists",
        { resourceType: p.resourceType, resourceId: p.resourceId },
      );
      return;
    case COMMAND_TYPES.RESOURCE_RENAME:
    case COMMAND_TYPES.RESOURCE_UPDATE:
    case COMMAND_TYPES.RESOURCE_MOVE:
    case COMMAND_TYPES.RESOURCE_DELETE:
      assert(
        !!state.resources?.[p.resourceType]?.items?.[p.resourceId],
        "resource not found",
        { resourceType: p.resourceType, resourceId: p.resourceId },
      );
      return;
    case COMMAND_TYPES.RESOURCE_DUPLICATE:
      assert(
        !!state.resources?.[p.resourceType]?.items?.[p.sourceId],
        "source resource not found",
        { resourceType: p.resourceType, sourceId: p.sourceId },
      );
      assert(
        !state.resources?.[p.resourceType]?.items?.[p.newId],
        "duplicate target id exists",
        { resourceType: p.resourceType, newId: p.newId },
      );
      return;

    case COMMAND_TYPES.LAYOUT_CREATE:
      assert(!state.layouts[p.layoutId], "layout already exists", {
        layoutId: p.layoutId,
      });
      return;
    case COMMAND_TYPES.LAYOUT_RENAME:
    case COMMAND_TYPES.LAYOUT_DELETE:
      assert(!!state.layouts[p.layoutId], "layout not found", {
        layoutId: p.layoutId,
      });
      return;
    case COMMAND_TYPES.LAYOUT_REORDER:
      assert(!!state.layouts[p.layoutId], "layout not found", {
        layoutId: p.layoutId,
      });
      if (p.parentId !== undefined && p.parentId !== null) {
        assert(p.parentId !== p.layoutId, "layout cannot parent itself", {
          layoutId: p.layoutId,
          parentId: p.parentId,
        });
        assert(!!state.layouts[p.parentId], "layout parent not found", {
          layoutId: p.layoutId,
          parentId: p.parentId,
        });
        assert(
          state.layouts[p.parentId].type === "folder",
          "layout parent must be folder",
          {
            layoutId: p.layoutId,
            parentId: p.parentId,
            parentType: state.layouts[p.parentId].type,
          },
        );
      }
      return;
    case COMMAND_TYPES.LAYOUT_ELEMENT_CREATE:
      assert(!!state.layouts[p.layoutId], "layout not found", {
        layoutId: p.layoutId,
      });
      assert(
        !state.layouts[p.layoutId].elements[p.elementId],
        "layout element already exists",
        { layoutId: p.layoutId, elementId: p.elementId },
      );
      return;
    case COMMAND_TYPES.LAYOUT_ELEMENT_UPDATE:
    case COMMAND_TYPES.LAYOUT_ELEMENT_MOVE:
    case COMMAND_TYPES.LAYOUT_ELEMENT_DELETE:
      assert(!!state.layouts[p.layoutId], "layout not found", {
        layoutId: p.layoutId,
      });
      assert(
        !!state.layouts[p.layoutId].elements[p.elementId],
        "layout element not found",
        { layoutId: p.layoutId, elementId: p.elementId },
      );
      return;

    case COMMAND_TYPES.VARIABLE_CREATE:
      assert(
        !state.variables?.items?.[p.variableId],
        "variable already exists",
        {
          variableId: p.variableId,
        },
      );
      if (p.parentId !== undefined && p.parentId !== null) {
        assert(p.parentId !== p.variableId, "variable cannot parent itself", {
          variableId: p.variableId,
          parentId: p.parentId,
        });
        assert(
          !!state.variables?.items?.[p.parentId],
          "variable parent not found",
          {
            variableId: p.variableId,
            parentId: p.parentId,
          },
        );
      }
      return;
    case COMMAND_TYPES.VARIABLE_UPDATE:
    case COMMAND_TYPES.VARIABLE_DELETE:
      assert(!!state.variables?.items?.[p.variableId], "variable not found", {
        variableId: p.variableId,
      });
      if (command.type === COMMAND_TYPES.VARIABLE_UPDATE && p.patch) {
        const currentVariable = state.variables?.items?.[p.variableId];
        const currentType =
          currentVariable?.type ?? currentVariable?.variableType ?? null;
        if (Object.prototype.hasOwnProperty.call(p.patch, "type")) {
          assert(p.patch.type === currentType, "variable type is immutable", {
            variableId: p.variableId,
            currentType,
            nextType: p.patch.type,
          });
        }
        if (Object.prototype.hasOwnProperty.call(p.patch, "variableType")) {
          assert(
            p.patch.variableType === currentType,
            "variable type is immutable",
            {
              variableId: p.variableId,
              currentType,
              nextType: p.patch.variableType,
            },
          );
        }
        if (Object.prototype.hasOwnProperty.call(p.patch, "parentId")) {
          const parentId = p.patch.parentId;
          if (parentId !== undefined && parentId !== null) {
            assert(parentId !== p.variableId, "variable cannot parent itself", {
              variableId: p.variableId,
              parentId,
            });
            assert(
              !!state.variables?.items?.[parentId],
              "variable parent not found",
              {
                variableId: p.variableId,
                parentId,
              },
            );
          }
        }
      }
      return;

    default:
      return;
  }
};
