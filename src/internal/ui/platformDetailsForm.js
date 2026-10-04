export const PLATFORM_APPLICATION_ICON_OUTPUT_SIZE = 256;

export const PLATFORM_APPLICATION_ICON_VALIDATIONS = [
  {
    type: "image-min-size",
    minWidth: 64,
    minHeight: 64,
  },
];

const getPlatformEditTitle = (platform, copy) => {
  if (platform === "windows") {
    return copy.editWindowsPlatformDetailsTitle;
  }
  if (platform === "macos") {
    return copy.editMacosPlatformDetailsTitle;
  }
  return copy.editWebPlatformDetailsTitle;
};

const getPlatformCreateTitle = (platform, copy) => {
  if (platform === "windows") {
    return copy.createWindowsPlatformDetailsTitle;
  }
  if (platform === "macos") {
    return copy.createMacosPlatformDetailsTitle;
  }
  return copy.createWebPlatformDetailsTitle;
};

export const createPlatformEditForm = (platform, mode, copy) => {
  const fields = [
    {
      name: "applicationName",
      type: "input-text",
      label: copy.applicationNameLabel,
      description: copy[`${platform}ApplicationNameDescription`],
      required: true,
    },
  ];

  if (platform !== "web") {
    fields.push({
      type: "slot",
      slot: "platform-application-icon-edit",
      label: copy.iconLabel,
      description: copy[`${platform}IconDescription`],
    });
  }

  fields.push({
    name: "applicationIdentifier",
    type: "input-text",
    label:
      platform === "macos"
        ? copy.macosApplicationIdentifierLabel
        : copy.applicationIdentifierLabel,
    description: copy[`${platform}ApplicationIdentifierDescription`],
    required: true,
  });

  // TODO: Restore optional Windows release metadata in the edit form.
  // if (platform === "windows") {
  //   fields.push(
  //     {
  //       name: "publisher",
  //       type: "input-text",
  //       label: copy.windowsPublisherLabel,
  //       description: copy[`${platform}PublisherDescription`],
  //       required: false,
  //     },
  //     {
  //       name: "description",
  //       type: "input-textarea",
  //       label: copy.descriptionLabel,
  //       description: copy[`${platform}DescriptionDescription`],
  //       required: false,
  //     },
  //     {
  //       name: "copyright",
  //       type: "input-text",
  //       label: copy.copyrightLabel,
  //       description: copy[`${platform}CopyrightDescription`],
  //       required: false,
  //     },
  //   );
  // }

  return {
    title:
      mode === "create"
        ? getPlatformCreateTitle(platform, copy)
        : getPlatformEditTitle(platform, copy),
    fields,
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          validate: true,
          label:
            mode === "create"
              ? copy.createPlatformButtonLabel
              : copy.saveChangesButton,
        },
      ],
    },
  };
};

export const createPlatformDetailsPatch = ({
  platform,
  values,
  iconFileId,
}) => {
  const patch = {
    applicationName: values.applicationName.trim(),
  };

  if (platform !== "web") {
    patch.iconFileId = iconFileId;
  }

  patch.applicationIdentifier = values.applicationIdentifier.trim();

  // TODO: Restore optional Windows release metadata when these fields return
  // to the Platform Details UI. Omitting them from the patch preserves any
  // existing stored values while the fields are hidden.
  // if (platform === "windows") {
  //   patch.publisher = values.publisher.trim();
  //   patch.description = values.description.trim();
  //   patch.copyright = values.copyright.trim();
  // }

  return patch;
};

export const getPlatformDetailsValidationMessage = (copy, code) => {
  if (code === "application-name-required") {
    return copy.applicationNameRequired;
  }
  if (code === "windows-icon-required") {
    return copy.windowsIconRequired;
  }
  if (code === "macos-icon-required") {
    return copy.macosIconRequired;
  }
  if (code === "web-identifier-required") {
    return copy.webApplicationIdentifierRequired;
  }
  if (code === "web-identifier-invalid") {
    return copy.webApplicationIdentifierInvalid;
  }
  if (code === "windows-identifier-required") {
    return copy.windowsApplicationIdentifierRequired;
  }
  if (code === "windows-identifier-invalid") {
    return copy.windowsApplicationIdentifierInvalid;
  }
  if (code === "macos-identifier-required") {
    return copy.macosApplicationIdentifierRequired;
  }
  if (code === "macos-identifier-invalid") {
    return copy.macosApplicationIdentifierInvalid;
  }
  return copy.failedSavePlatformMessage;
};
