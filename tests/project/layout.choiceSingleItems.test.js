import { describe, expect, it } from "vitest";
import { parseAndRender } from "jempl";
import { buildLayoutElements } from "../../src/internal/project/layout.js";

const emptyCollection = { items: {}, tree: [] };

const buildChoiceLayoutElements = (layout) => {
  return buildLayoutElements(
    layout,
    {},
    emptyCollection,
    emptyCollection,
    emptyCollection,
    {
      layoutId: "choice-layout",
      layoutType: "choice",
    },
  ).elements;
};

describe("buildLayoutElements choice single item containers", () => {
  it("projects a choice single item container to a normal container bound to one choice", () => {
    const elements = buildChoiceLayoutElements([
      {
        id: "choice-single-item",
        type: "container-ref-choice-single-item",
        direction: "absolute",
        choiceItemIndex: 1,
        $when: "variables.showChoices",
        click: {
          inheritToChildren: true,
        },
        children: [
          {
            id: "choice-label",
            type: "text-ref-choice-item-content",
            x: 0,
            y: 0,
            text: "Choice",
          },
        ],
      },
    ]);

    expect(elements[0]).toMatchObject({
      id: "choice-single-item",
      type: "container",
      direction: "absolute",
      $when: {
        all: [{ var: "variables.showChoices" }, { var: "choice.items[1]" }],
      },
      click: {
        inheritToChildren: true,
        payload: {
          actions: "${choice.items[1].events.click.actions}",
        },
      },
      children: [
        {
          id: "choice-label",
          type: "text",
          content: "${choice.items[1].content}",
        },
      ],
    });
  });

  it("requires the assigned choice even when an override reveals it", () => {
    const elements = buildChoiceLayoutElements([
      {
        id: "choice-one",
        type: "container-ref-choice-single-item",
        choiceItemIndex: 1,
        $when: 'variables.mood != "Calm && Quiet"',
        conditionalOverrides: [
          {
            when: { target: "variables.reveal", op: "eq", value: true },
            set: { visible: true },
          },
        ],
      },
    ]);
    const render = (mood, reveal, items) =>
      parseAndRender(elements, {
        variables: { mood, reveal },
        choice: { items },
      });
    const choices = [{}, {}];
    expect(render("Calm && Quiet", false, choices)).toHaveLength(0);
    expect(render("Other", false, choices)).toHaveLength(1);
    expect(render("Calm && Quiet", true, choices)).toHaveLength(1);
    expect(render("Calm && Quiet", true, [{}])).toHaveLength(0);
  });

  it("renders only when the assigned choice exists", () => {
    const elements = buildChoiceLayoutElements([
      {
        id: "choice-single-item",
        type: "container-ref-choice-single-item",
        choiceItemIndex: 1,
        children: [
          {
            id: "choice-label",
            type: "text-ref-choice-item-content",
          },
        ],
      },
    ]);

    const rendered = parseAndRender(
      { elements },
      {
        choice: {
          items: [
            {
              content: "First",
              events: {
                click: {
                  actions: {
                    nextLine: {},
                  },
                },
              },
            },
            {
              content: "Second",
              events: {
                click: {
                  actions: {
                    sectionTransition: {
                      sceneId: "scene-2",
                      sectionId: "section-2",
                    },
                  },
                },
              },
            },
          ],
        },
      },
    );

    expect(rendered.elements[0].children[0].content).toBe("Second");
    expect(rendered.elements[0].click.payload.actions).toEqual({
      sectionTransition: {
        sceneId: "scene-2",
        sectionId: "section-2",
      },
    });

    const missingChoiceRender = parseAndRender(
      { elements },
      {
        choice: {
          items: [
            {
              content: "First",
              events: {
                click: {
                  actions: {},
                },
              },
            },
          ],
        },
      },
    );

    expect(missingChoiceRender.elements).toEqual([]);
  });
});
