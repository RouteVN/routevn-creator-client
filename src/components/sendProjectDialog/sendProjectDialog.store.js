import { DEBUG_CODE_INPUT_PATTERN } from "../../internal/supportUpload.js";

// A code as support writes it, shown as the field's example.
const CODE_EXAMPLE = "K7QM4X";

export const createInitialState = () => ({});

// The dialog says what is shared and for how long, then asks for the code
// and the project. It is mounted when it opens, so the form starts empty
// with `projectId` chosen.
export const selectViewData = ({ props = {}, i18n }) => {
  const copy = i18n.sendProjectDialog;
  const untitled = i18n.projectsPage.untitledProject;
  const projects = props.projects ?? [];
  return {
    open: true,
    form: {
      title: copy.title,
      description: copy.description,
      fields: [
        {
          name: "code",
          type: "input-text",
          label: copy.codeLabel,
          placeholder: CODE_EXAMPLE,
          maxLength: 16,
          required: { message: copy.codeRequired },
          rules: [
            {
              rule: "pattern",
              value: DEBUG_CODE_INPUT_PATTERN,
              message: copy.codeInvalid,
            },
          ],
        },
        {
          name: "projectId",
          type: "select",
          label: copy.projectLabel,
          required: { message: copy.projectRequired },
          noClear: true,
          options: projects.map((project) => ({
            label: project.name || untitled,
            value: project.id,
          })),
        },
      ],
      actions: {
        buttons: [
          {
            id: "send",
            variant: "pr",
            validate: true,
            label: copy.sendButton,
          },
        ],
      },
    },
    defaultValues: {
      code: "",
      projectId: props.projectId ?? projects[0]?.id,
    },
  };
};
