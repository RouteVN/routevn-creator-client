import {
  normalizeAndroidBackgroundColor,
  isValidAndroidBackgroundColor,
} from "../androidExport.js";
import { IOS_APPLICATION_ICON_OUTPUT_SIZE } from "../iosExport.js";

const PLATFORM_APPLICATION_ICON_OUTPUT_SIZE = 256;

// The size the crop dialog makes an icon for each platform.
export const getPlatformIconOutputSize = (platform, target) => {
  if (target === "splash") return 768;
  if (platform === "android") return 512;
  if (platform === "ios") return IOS_APPLICATION_ICON_OUTPUT_SIZE;
  return PLATFORM_APPLICATION_ICON_OUTPUT_SIZE;
};

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
  if (platform === "android") return copy.editAndroidPlatformDetailsTitle;
  if (platform === "ios") return copy.editIosPlatformDetailsTitle;
  return copy.editWebPlatformDetailsTitle;
};

const getPlatformCreateTitle = (platform, copy) => {
  if (platform === "windows") {
    return copy.createWindowsPlatformDetailsTitle;
  }
  if (platform === "macos") {
    return copy.createMacosPlatformDetailsTitle;
  }
  if (platform === "android") return copy.createAndroidPlatformDetailsTitle;
  if (platform === "ios") return copy.createIosPlatformDetailsTitle;
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

  if (platform === "android") {
    fields.push(
      {
        type: "slot",
        slot: "platform-android-adaptive-icon-edit",
        label: copy.androidAdaptiveIconLabel,
        description: copy.androidAdaptiveIconDescription,
      },
      {
        type: "slot",
        slot: "platform-android-splash-icon-edit",
        label: copy.androidSplashIconLabel,
        description: copy.androidSplashIconDescription,
      },
    );
  }

  fields.push({
    name: "applicationIdentifier",
    type: "input-text",
    label:
      platform === "macos" || platform === "ios"
        ? copy.macosApplicationIdentifierLabel
        : copy.applicationIdentifierLabel,
    description: copy[`${platform}ApplicationIdentifierDescription`],
    required: true,
  });

  if (platform === "android") {
    fields.push(
      {
        name: "iconBackgroundColor",
        type: "color-picker",
        label: copy.androidIconBackgroundColorLabel,
        required: true,
      },
      {
        name: "splashBackgroundColor",
        type: "color-picker",
        label: copy.androidSplashBackgroundColorLabel,
        required: true,
      },
    );
  }

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
  adaptiveIconFileId,
  splashIconFileId,
}) => {
  const patch = {
    applicationName: values.applicationName.trim(),
  };

  if (platform !== "web") {
    patch.iconFileId = iconFileId;
  }

  patch.applicationIdentifier = values.applicationIdentifier.trim();
  if (platform === "android") {
    patch.adaptiveIconFileId = adaptiveIconFileId;
    patch.splashIconFileId = splashIconFileId;
    for (const name of ["iconBackgroundColor", "splashBackgroundColor"]) {
      patch[name] = isValidAndroidBackgroundColor(values[name])
        ? normalizeAndroidBackgroundColor(values[name])
        : values[name];
    }
  }

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
  if (code === "android-icon-required") return copy.androidIconRequired;
  if (code === "android-identifier-required")
    return copy.androidApplicationIdentifierRequired;
  if (code === "android-identifier-invalid")
    return copy.androidApplicationIdentifierInvalid;
  if (code === "android-color-invalid") return copy.androidColorInvalid;
  if (code === "ios-icon-required") return copy.iosIconRequired;
  if (code === "ios-identifier-required")
    return copy.iosApplicationIdentifierRequired;
  if (code === "ios-identifier-invalid")
    return copy.macosApplicationIdentifierInvalid;
  return copy.failedSavePlatformMessage;
};
