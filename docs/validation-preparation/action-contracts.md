# Strict authored action contracts

Status: Phase 1 specification, September 13, 2026. This document specifies the
first strict model version `M`; it does not implement a validator or change any
stored project. It supplements the [versioned-command specification](../command-schema-validation-spec.md).

September 18 refresh: the implementation baseline is client main `4d1fe31f`,
creator-model `1.15.0` / schema `15`, and route-engine-js `1.46.1`. The original
source fingerprints below remain historical evidence. The refresh adds avatar
preview data and the default-avatar-transform command. September 21 scope
correction: object assignments keep existing runtime interpolation; no new
operation marker or engine release is required. See the [refresh fixtures](./fixtures/scenarios/september-18-contract-refresh.json).

The original source baseline is the client-pinned `route-engine-js@1.46.1` and the
reviewed sibling engine source at `7c8eb55d19b511de5f07dbd95af24fd991d5d892`
(`1.46.3`). The newer checkout is supporting contract evidence, not permission
to expose capabilities absent from the client's current emitters and template.
The following SHA-256 fingerprints identify the exact client inputs reviewed:

| Source                                                                                | SHA-256                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Action chooser](../../src/components/commandLineActions/commandLineActions.store.js) | `8708eac649b4237e96f5868af9b305519aec21131f0faaac9bd0a55268ae496b` |
| [Runtime action registry](../../src/internal/runtimeActions.js)                       | `575993217a1bed4de4c06fb574b7b78ae87e83c19d0d0ffd43cb964b5642ca80` |
| [Shader adjustment generator](../../src/internal/commandLineShaderAdjustments.js)     | `d43519a2cb6d4c7464913f3e9bd31c4c6f219d9886b19abfff605e1654a8bf4d` |
| [Default repository](../../static/templates/default/repository.json)                  | `125ec6e10d0a987f0ac0bfa72587d8cbb0dfb9c9e7dab4bad4fff1646fc16e47` |

## Contract conventions

Every object below is **closed**: only the listed keys are accepted. `!` means
required, `?` means optional. Optional means absent, not `undefined` or `null`.
An explicit `null` is valid only where stated. No unknown field is stripped to
make strict input pass. Property names are case-sensitive. All numeric values
must be finite JSON numbers; integers must be safe integers. All arrays have
actual entries: holes, `undefined`, and non-JSON values are invalid.

Use the concrete limits in [limits and inputs](./limits-and-inputs.md).
`NEW_ACTION_DEPTH` counts every nested authored action-map edge, including
conditional, choice, form, and confirmation callbacks. JSON depth, byte,
expression, and work limits also apply. Domain arrays narrow the global limits:
choice items and form fields at most 1,024, conditional branches at most 1,024,
character/visual/sound/channel entries at most 4,096 each, and shader filters at
most seven. Empty arrays are allowed only as specified below. Dictionary keys
are bounded by `NEW_KEY_BYTES`; string values by `NEW_STRING_BYTES`.

Shared scalar types:

| Name          | Exact contract                                                                                                                                                                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Id`          | Nonempty string after a trim check; retain the original string, do not trim/coerce it. At most `NEW_KEY_BYTES` UTF-8 bytes. Reject `__proto__`, `prototype`, and `constructor` when the value becomes a dictionary key or traversed path segment. Existing IDs need not match the new-ID generator's alphabet. |
| `Text`        | Bounded string, including the empty string. The text-template rules below apply only to explicitly template-bearing fields.                                                                                                                                                                                    |
| `Number`      | Finite number with absolute value at most `Number.MAX_SAFE_INTEGER`; fractional values are permitted unless a field says integer.                                                                                                                                                                              |
| `Nonnegative` | `Number >= 0`.                                                                                                                                                                                                                                                                                                 |
| `Positive`    | `Number > 0`.                                                                                                                                                                                                                                                                                                  |
| `Unit`        | Number in `[0, 1]`.                                                                                                                                                                                                                                                                                            |
| `Percent`     | Number in `[0, 100]`.                                                                                                                                                                                                                                                                                          |
| `Pan`         | Number in `[-1, 1]`.                                                                                                                                                                                                                                                                                           |
| `Bool`        | JSON boolean only.                                                                                                                                                                                                                                                                                             |
| `Empty`       | Exactly `{}`.                                                                                                                                                                                                                                                                                                  |
| `Ref(kind)`   | `Id` resolving to a current non-folder resource of the named kind, using the complete authoritative repository or an equivalent complete index.                                                                                                                                                                |
| `LiteralJSON` | Bounded JSON primitive/array/plain-object data. No functions, accessors, prototypes other than ordinary/null prototypes, symbols, cycles, nonfinite values, or traversal of inherited properties. Its keys are data, not action names; do not execute or recursively template-render the contents.             |

No schema validation evaluates authored actions, conditions, shaders, or
templates. Parse syntax and inspect declared types/references. Values supplied
later by the runtime must also pass their resolved value contracts before
execution; model acceptance cannot guarantee future player values or save-slot
availability.

## Closed registry and contexts

The complete initial registry has **41 names**. The following two rows enumerate
all of them; any name not in these rows is rejected in strict authored data.

| Set                   | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Presentation `P` (11) | `screen`, `background`, `dialogue`, `character`, `visual`, `choice`, `form`, `sfx`, `bgm`, `voice`, `control`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| System `S` (30)       | `nextLine`, `setNextLineConfig`, `toggleAutoMode`, `startSkipMode`, `stopSkipMode`, `toggleSkipMode`, `toggleDialogueUI`, `pushOverlay`, `popOverlay`, `rollbackByOffset`, `sectionTransition`, `resetStoryAtSection`, `saveSlot`, `loadSlot`, `updateVariable`, `conditional`, `showConfirmDialog`, `hideConfirmDialog`, `setDialogueTextSpeed`, `setAutoForwardDelay`, `setSkipUnseenText`, `setSkipTransitionsAndAnimations`, `setSoundVolume`, `setMusicVolume`, `setMuteAll`, `setSaveLoadPagination`, `incrementSaveLoadPagination`, `decrementSaveLoadPagination`, `setMenuPage`, `setMenuEntryPoint` |

Registry evidence: [action chooser](../../src/components/commandLineActions/commandLineActions.store.js),
[runtime setting actions](../../src/internal/runtimeActions.js), and the
[default project](../../static/templates/default/repository.json). The UI calls
the input editor `input`; its persisted action name is **`form`**. There is no
strict `input` action alias. `dialogue.gui` is a nested compatibility field, not
a top-level `gui` action.

| Context                                              | Allowed action maps and binding environment                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `line.actions`                                       | Any subset of `P ∪ S`; `{}` is a valid empty line. Current scene/section/line identity is known. No `_event` or repeating-layout item binding.  |
| Layout/control interaction `payload.actions`         | Subset of `S`. A declared element/control event supplies only its documented event fields. Presentation actions are rejected here.              |
| `conditional.branches[].actions`                     | Subset of `S`, recursively. Inherits the immediate execution context, including an available immediate event context.                           |
| `choice.items[].events.click.actions`                | Subset of `S`; choice-click context, with no arbitrary caller-defined event fields.                                                             |
| `form.submitActions` / `form.cancelActions`          | Subset of `S`; deferred form completion context, not the event that originally showed the form.                                                 |
| `showConfirmDialog.confirmActions` / `cancelActions` | Subset of `S`; deferred confirmation-click context. Captured automatic slot context is permitted only under the slot rules below.               |
| Layout/control preview data                          | The separate closed preview schema below. Preview objects are not general action maps. Every callback they contain still uses the `S` registry. |

The API may author these registered system actions in system callback contexts
even when a particular picker hides some of them. For example, the conditional
picker currently lists only navigation and variable updates. That is a UI
restriction; the explicitly chosen model contract is recursive `S` with the
combination rules below. It does not allow runtime-only action names.

All other engine actions are deliberately excluded from `M`, including these
public engine capabilities that the current Creator does not author:

- `cleanAll`, `layout`, `random`, `startAutoMode`, `stopAutoMode`,
  `showDialogueUI`, `hideDialogueUI`, `setAutoForwardSpeed`,
  `updateLocalizationPackage`, `jumpToLine`, `replaceLastOverlay`,
  `clearOverlays`, and `rollbackToLine`.
- `completeAchievement`, `setAchievementProgress`, `showImageGalleryVariant`,
  `moveToPreviousImageGalleryVariant`, `moveToNextImageGalleryVariant`,
  `clearImageGallerySelection`, `moveToImageGalleryPage`,
  `moveToNextImageGalleryPage`, and `moveToPreviousImageGalleryPage`.
- `playMusicRoomTrack`, `playMusicRoom`, `pauseMusicRoom`, `stopMusicRoom`,
  `seekMusicRoom`, `playPreviousMusicRoomTrack`, `playNextMusicRoomTrack`,
  `clearMusicRoomSelection`, `moveToMusicRoomPage`, `moveToNextMusicRoomPage`,
  and `moveToPreviousMusicRoomPage`.
- `startSceneReplay`, `finishSceneReplay`, `exitSceneReplay`,
  `moveToSceneReplayPage`, `moveToNextSceneReplayPage`, and
  `moveToPreviousSceneReplayPage`.
- `updateFormField`, `submitForm`, and `cancelForm`. The runtime generates
  these handlers for input elements; that does not make their payloads a
  persisted Creator command input surface.
- All runtime internals, including `updateProjectData`, `clearPendingEffects`,
  `addViewedLine`, `addViewedResource`, `markLineCompleted`,
  `nextLineFromSystem`, effect appenders, rollback bookkeeping, random
  bookkeeping, music-room sound callbacks, and dialogue-history recording.
- Historical free-form names such as `say`. Existing unversioned history
  retains its existing interpretation; copying it into new authored content
  does not grant a strict-schema exception.

The complete exclusion follows the engine's
[public system schema](../../../route-engine/src/schemas/systemActions.yaml),
[presentation schema](../../../route-engine/src/schemas/presentationActions.yaml),
and [execution inventory](../../../route-engine/src/actionExecutionOrder.js).
Adding an excluded name requires a later explicit model contract and fixtures.

## Shared presentation structures

### Transforms, animations, and blur

`TransformFields` is the following closed field set, reusable inline where
listed: `x?`, `y?`, `anchorX?`, `anchorY?`, `scaleX?`, `scaleY?`, `rotation?`,
`originX?`, `originY?`, all `Number`; and `flipX?`, `flipY?`, both `Bool`.
Negative scale and positions are supported. Zero scale is permitted. Anchors
and origins are not artificially limited to `[0,1]` because off-object pivots
and positioning are authored features. A transform reference is
`transformId?: Ref(transforms)`.

`AnimationSelection` is `{resourceId!: Ref(animations), playback?:
AnimationPlayback}`. `AnimationPlayback` is `{continuity?: "render" |
"persistent", speed?: Positive, loop?: Bool}`. Omitted fields retain the
runtime defaults: `continuity = "render"`, `speed = 1`, `loop = false`; do not
write defaults back into historical payloads. Validate the referenced
animation's supported `update`/`transition` category and target compatibility.
`loop: true` is supported for update animation playback; reject it for
transition-only selections. Screen transitions and navigation `screen`
selections require transition animations. Other presentation selections may
use the applicable update or transition resource. The existing animation
resource validators remain authoritative for tracks, masks, and keyframes;
an action cannot embed an animation resource in place of a selection.

`Blur` is either explicit `null` (remove the active blur) or
`{x!: Nonnegative, y!: Nonnegative, quality?: Positive, kernelSize?:
5|7|9|11|13|15, repeatEdgePixels?: Bool}`. `quality` remains numeric because the
engine contract is numeric; `kernelSize` must be one of the integer choices.
Do not round a new malformed kernel to the nearest supported value.

`OpacityFields` means `alpha?: Unit` or `opacity?: Unit`, never both. Preserve
the shipped `opacity` spelling as an explicitly supported alias. An empty
screen/action object does not mean `null`; clearing its authored presence uses
the command replacement/removal semantics below.

Sources: [engine shared structures](../../../route-engine/src/schemas/presentationActions.yaml),
[item effects](../../src/internal/commandLineItemEffects.js),
[animation playback](../../src/internal/animationPlayback.js), and
[screen emitter](../../src/components/commandLineScreen/commandLineScreen.handlers.js).

### Shader adjustments: exact supported source, not an open shader payload

`Filters` is an array of at most seven `BuiltinFilter` records. The empty array
clears authored filters. IDs must be unique, in the order in the table below.
Each filter is exactly:

```text
{
  id!: one listed filter ID,
  type!: "shader",
  parameters!: { the corresponding single parameter!: Number in its range },
  source!: {
    webgl!: {fragment!: exact approved UTF-8 source},
    webgpu!: {source!: exact approved UTF-8 source}
  }
}
```

Source strings are the exact output of the reviewed
[built-in generator](../../src/internal/commandLineShaderAdjustments.js),
with hashes below. Hashes are SHA-256 of each individual source string's UTF-8
bytes, including its whitespace and newlines. They do not include JSON quotes
or the parameter value. The implementation must package/freeze those approved
source strings in the owning model contract and compare exact source; hashes
provide the reviewable fixture identity, not permission to execute an arbitrary
program or import client code into the model.

| Filter ID / parameter                 | Range        | WebGL fragment SHA-256                                             | WebGPU source SHA-256                                              |
| ------------------------------------- | ------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `backgroundBrightness` / `brightness` | `[-1,1]`     | `bde7dffc9dac6aac42a3e468348e8c46c5d2b0f25ddf3fb2dd6bda383dd628c9` | `3bb4f4d4768ab0fca1cb5049bc17da1e5e91b936e03f5e5a521e05bf1b28176b` |
| `backgroundContrast` / `contrast`     | `[-1,1]`     | `08e44a31b4d99122a32f29046517dc67a908df16162a804990c6d4d9f36a340f` | `9a059096eadcbce06e243324ea9bb26c33f90d535e30012903a4c429f4652568` |
| `backgroundSaturation` / `saturation` | `[-1,1]`     | `d99358bee76ea1ea081819cafa57189459b0c18e0ac679f03386cb3413fb889a` | `24344f0b2534567d9014db3ece350b83826a444fbe6fdc42ab862fc09f8ca4b7` |
| `backgroundHue` / `hue`               | `[-180,180]` | `f7c3c397f535403955b30a9457b0e238cd0fd7a506b99438687765ce117462dc` | `67a15d44ac10c8cd49b1efff02ab45775830611a7bd11e5389a8b2a6c418bc83` |
| `backgroundGrayscale` / `grayscale`   | `[0,1]`      | `aa21d618494a389055a1798c43eedf9467c585e1476137d713f98191b1066a39` | `57012e98cb150b69861248ff136ffc18b10dbeacaaef64ba879deafc205c8862` |
| `backgroundSepia` / `sepia`           | `[0,1]`      | `a44835c860964a03cb21a16f0480567df627eb772cf47509b4fd2b39c8e03772` | `6d61a3af83159b7f9e121777dc63f52ac681709f5a2041d74822007978a4463c` |
| `backgroundInvert` / `invert`         | `[0,1]`      | `8c10bad690368b06edeacf7f780f4d8183d0c875d693a991195e54dc333740e2` | `c3a73682f9e48a4d191330a0690c51198b5361429bdf74b6a33c46af1a3808ff` |

Custom IDs, another parameter, other source fields, additional uniforms,
arbitrary GLSL/WGSL, and renderer-specific filter types are unsupported in
strict actions. Existing untouched legacy filters stay historical. Editing an
action that retains an unsupported filter requires an explicit supported
replacement, never silent stripping. This preserves all seven shipped visual
adjustments without importing the engine schema's `additionalProperties: true`.

### Rich text and dialogue sprites

`RichContent` is either a `TextTemplate` string or an array of `RichSegment`. Both
representations are explicitly supported because the client reads legacy
strings and authors segment arrays; they are not an arbitrary union. `[]` and
`""` are valid empty content. The reducer preserves the supplied form unless
its recorded model version explicitly defines a representation conversion.

`RichSegment` has exactly one of `text!: TextTemplate` or
`reference!: {resourceId!: Ref(variables)}`, plus `textStyleId?:
Ref(textStyles)`, `textStyle?: InlineTextStyle`, `furigana?:
{text!: nonempty Text, textStyleId?: Ref(textStyles)}`. Furigana text cannot
contain CR or LF. A reference names a declared variable, including a computed
readable variable; it is not an arbitrary object/property expression.

`InlineTextStyle` is `{fontWeight?: "bold", fontStyle?: "italic",
textDecoration?: "underline", fill?: ColorLiteral}`. An empty style object is
valid. `ColorLiteral` is a CSS hex color with exactly 3, 4, 6, or 8 hex digits,
`transparent`, `black`, `white`, or an `rgb(...)` / `rgba(...)` literal with
three numeric channels in `[0,255]` and optional alpha in `[0,1]`; reject CSS
functions, `url(...)`, variables, and declarations. This preserves the styles
emitted by the editor without a free-form style object.

The editor's non-enumerable `reference.__displayText` is local display metadata,
not persisted domain data. Trusted editor-to-command composition must construct
the documented domain object before submission. An external enumerable
`label`, `__displayText`, or alternative `mention` field is not accepted or
silently removed. Existing history remains governed by its original contract.

`SpriteSelection` is `{id!: Id, resourceId!: character-sprite reference,
animationName?: Id, animationSpeed?: Positive, loop?: Bool}`. Selection IDs are
unique within their array; they identify the sprite group/slot, not an action
name. A referenced sprite is an image or spritesheet, never a folder. If a
character owner is known, the sprite must belong to that character. Without an
explicit owner, the repository-wide sprite lookup must resolve uniquely; reject
ambiguous IDs rather than infer an arbitrary owner. `animationName` must name a
clip on a spritesheet; animation speed/loop require spritesheet playback.

`DialogueSprite` is `{transformId?: Ref(transforms), items?:
SpriteSelection[], animations?: AnimationSelection}`. Items may be empty to
clear the selected sprites. Nonempty items require a transform; animation-only
updates may omit items. A dialogue's speaker and displayed sprite owner need
not be the same: the current UI lets the author choose them independently.

Sources: [rich-text serializer](../../src/primitives/lexicalRichTextShared.js),
[content representation](../../src/internal/ui/sceneEditorLexical/contentModel.js),
[dialogue emitter](../../src/components/commandLineDialogueBox/commandLineDialogueBox.handlers.js),
and [existing representation normalization](../../src/internal/project/engineActions.js).

## Presentation action catalog

Each table row lists the entire allowed action field set. Shared structures
expand to the closed field sets above.

| Action       | Exact fields                                                                                                                                                                                                                                                                                                                                              | Result, clear, and reference rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `screen`     | `alpha?` or `opacity?`; `blur?: Blur`; `animations?: AnimationSelection`                                                                                                                                                                                                                                                                                  | `{}` is valid and authors no overrides. `blur:null` explicitly removes blur. Whole-screen animations use transition resources.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `background` | `resourceId?: Id`, `resourceType?: "image" \| "video" \| "spritesheet" \| "layout"`, `animationName?: Id`, `animationSpeed?: Positive`, `loop?: Bool`, `colorId?: Ref(colors)`, `transformId?: Ref(transforms)`, `TransformFields`, `OpacityFields`, `blur?: Blur`, `filters?: Filters`, `animations?: AnimationSelection`                                | `{}` is the supported no-background selection. A resource resolves uniquely among images/videos/spritesheets/layouts; supplied resourceType must match. Color may coexist with a resource as backing color. Resource type alone is invalid without resourceId. Animation clip fields require spritesheet; loop applies to video/spritesheet playback. transformId excludes inline numeric transform fields, but flipX/flipY remain permitted. Effect/transform fields require a resource or color target.                                                                                                                |
| `dialogue`   | `ui?: DialogueUI`, `gui?: DialogueUI`, `mode?: "adv" \| "nvl"`, `content?: RichContent`, `textSpeed?: Nonnegative`, `append?: Bool`, `characterId?: Ref(characters)`, `characterName?: TextTemplate`, `persistCharacter?: Bool`, `persistSprite?: Bool`, `character?: {name?: TextTemplate, sprite?: DialogueSprite}`, `clear?: Bool`, `clearPage?: Bool` | UI is `{resourceId!: Ref(layouts), animations?: AnimationSelection}`. `ui` and `gui` are mutually exclusive; gui is the shipped alias. Layout must have dialogue-adv/dialogue-nvl type; when mode is supplied it must agree. Content is optional: a presentation-only dialogue update is valid. Explicit clear true may coexist only with content (matching the supported clear form); clearPage true requires NVL mode or an NVL layout; append true requires ADV. Empty character names explicitly select an unnamed speaker. persistSprite false may remove retained speaker sprites without embedding a replacement. |
| `character`  | `items?: CharacterItem[]`                                                                                                                                                                                                                                                                                                                                 | `CharacterItem` is defined below. `{}` and `items:[]` are valid empty character selections. Item IDs are unique within the array.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `visual`     | `items?: VisualItem[]`                                                                                                                                                                                                                                                                                                                                    | `VisualItem` is defined below. `{}` and `items:[]` are valid empty visual selections. Item IDs are unique within the array.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `choice`     | `resourceId?: Ref(layouts)`, `items?: ChoiceItem[]`, `animations?: AnimationSelection`                                                                                                                                                                                                                                                                    | Layout must be choice type. `ChoiceItem = {id?: Id, content!: TextTemplate, events?: {click?: {actions!: SystemMap}}}`. IDs, when present, are unique; current UI and shipped previews legitimately omit IDs. Nonempty items require a choice layout. `items:[]` clears choices; `{}` is valid. No arbitrary event names or bare string action maps.                                                                                                                                                                                                                                                                     |
| `form`       | `id?: Id`, `resourceId!: Ref(layouts)`, `fields!: {fieldName: FormField}`, `submitActions?: SystemMap`, `cancelActions?: SystemMap`, `animations?: AnimationSelection`                                                                                                                                                                                    | Layout type must be input. Fields contain 1–1,024 entries. Each key names an actual input field in the referenced layout/its fragments; map every active input field exactly once. Generated form id is preferred; omission is the explicitly supported resourceId fallback. Empty form object/null are invalid; remove the authored action to remove the form.                                                                                                                                                                                                                                                          |
| `sfx`        | `items?: AudioSound[]`, `channels?: SfxChannel[]`                                                                                                                                                                                                                                                                                                         | Exactly one representation when nonempty fields are supplied; items and channels cannot coexist. `{}`, `items:[]`, and `channels:[]` are supported clears. `items` is the explicit default-channel shorthand. References resolve in sounds.                                                                                                                                                                                                                                                                                                                                                                              |
| `bgm`        | `sounds?: AudioSound[]`, `resourceId?: Ref(sounds)`, `loop?: Bool`, `interruption?: "immediate" \| "loopEnd"`, `volume?: Percent`, `muted?: Bool`, `pan?: Pan`, `startDelayMs?: Nonnegative`, `audioEffects?: AudioEffectSelection`                                                                                                                       | sounds and resourceId are mutually exclusive. startDelayMs belongs only to legacy single-resource representation; audioEffects requires sounds. `{}` and sounds:[] are supported empty BGM selections. In canonical sounds form, channel volume layers with sound volume; in the resourceId shorthand it keeps existing single-sound meaning.                                                                                                                                                                                                                                                                            |
| `voice`      | `sounds?: AudioSound[]`, `resourceId?: Id`, `volume?: Percent`, `muted?: Bool`, `pan?: Pan`, `loop?: Bool`, `interruption?: "immediate" \| "loopEnd"`, `startDelayMs?: Nonnegative`                                                                                                                                                                       | Exactly one of sounds/resourceId is required. sounds:[] is a valid clear, `{}` is invalid. Voice refs must resolve in the owning scene's voice collection; moving a voiced line across scenes requires checking that relationship. startDelayMs is permitted only in resourceId representation.                                                                                                                                                                                                                                                                                                                          |
| `control`    | `resourceId!: Ref(controls)`, `resourceType?: "control"`                                                                                                                                                                                                                                                                                                  | Activate an actual control resource. resourceType is a supported shipped Creator discriminator. `{}` and null are invalid.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

`SystemMap` in this document is a closed action map over registry `S`, not an
unconstrained object. `FormField` is exactly `{variableId!: Ref(variables),
required?: Bool, trim?: Bool, placeholder?: TextTemplate, multiline?: Bool,
maxLength?: nonnegative integer}`. The variable must be a writable,
non-computed string variable in a supported scope. maxLength cannot exceed
`NEW_STRING_BYTES` (the renderer counts characters; this is a conservative
numeric ceiling, with the separate UTF-8 byte limit still enforced). required
and trim default false. A form does not accept caller-provided field error
objects, runtime form keys, DOM events, or arbitrary input options.

`CharacterItem` has `{id!: Ref(characters), transformId?: Ref(transforms),
sprites?: SpriteSelection[], spriteName?: Text, TransformFields,
OpacityFields, blur?: Blur, filters?: Filters, animations?: AnimationSelection}`.
`spriteName` is the existing Creator display field, not an executable path.
When sprites are supplied, require transformId as the engine does; numeric
inline fields can override a referenced character transform. Sprite IDs resolve
under that character, and duplicate sprite slot IDs are rejected. No recursive
items or arbitrary resource object is allowed.

`VisualItem` has `{id!: Id, resourceId!: Id, resourceType?:
"image"|"video"|"spritesheet"|"layout", animationName?: Id,
animationSpeed?: Positive, transformId?: Ref(transforms), TransformFields,
layer?: 10|30|50|70|90, OpacityFields, blur?: Blur, filters?: Filters,
animations?: AnimationSelection}`. A typed or unique reference resolves to
the allowed resource collection. The default layer is 50; same-layer array order
is significant. Inline values may override a transform reference. The engine's
inline `text`, inline `layout`, and nested `transform` object forms are excluded
from `M`: the current Creator authors these as resource references and top-level
transform fields. Do not accept arbitrary render nodes as an alternative.

`AudioEffectSelection` is `{resourceId!: Ref(audioEffects), playback?:
{speed?: Positive}}`. `AudioSound` is exactly `{id!: Id, resourceId!: Id,
loop?: Bool, volume?: Percent, muted?: Bool, pan?: Pan, startDelayMs?:
Nonnegative, playbackRate?: Nonnegative, startAt?: Nonnegative,
endAt?: Nonnegative|null, beginEffect?: AudioEffectSelection,
endEffect?: AudioEffectSelection}`. Audio position fields use the existing
runtime's units; startDelayMs is milliseconds. endAt null means no authored
end; if numeric it must be at least effective startAt (default zero). Do not
require endAt to fit incomplete/unavailable duration metadata. Resource source
type is sounds for BGM/SFX and voices in the current scene for voice. Folder,
image, and another scene's voice references fail. IDs are unique per channel;
multiple scheduled copies of the same resource are allowed with distinct IDs.
playbackRate zero is retained because the supported engine contract permits it.

`SfxChannel` is `{id!: Id, sounds!: AudioSound[], volume?: Percent,
muted?: Bool, pan?: Pan, loop?: Bool, interruption?: "immediate"|"loopEnd",
applyMode?: "singleLine"|"persistent"}`. Channel IDs are unique within sfx;
sounds may be empty to stop that channel. Omitted applyMode is singleLine.
Persistent sound identities must remain stable across replay and exact retry;
strict validation does not regenerate them. The existing authoring composition
may construct documented IDs before the gate, but history readers must retain
the accepted bytes and version.

Sources: [background emitter](../../src/components/commandLineBackground/commandLineBackground.handlers.js),
[characters emitter](../../src/components/commandLineCharacters/commandLineCharacters.handlers.js),
[visual emitter](../../src/components/commandLineVisual/commandLineVisual.handlers.js),
[choice builder](../../src/components/commandLineChoices/commandLineChoices.store.js),
[form builder](../../src/components/commandLineInput/commandLineInput.store.js),
[BGM state](../../src/components/commandLineBgm/commandLineBgm.store.js),
[voice state](../../src/components/commandLineVoice/commandLineVoice.store.js),
[SFX state](../../src/components/commandLineSoundEffects/commandLineSoundEffects.store.js),
and [audio rendering](../../../route-engine/src/stores/constructRenderState.js).

## System action catalog

| Action(s)                                                                                                                                                                                | Entire allowed payload                                                                                                                                                                      | Preconditions and semantics                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nextLine`                                                                                                                                                                               | `{bypassChoice?: Bool}`                                                                                                                                                                     | Advance/complete current line. Availability at the moment of player execution is a runtime condition, not project-authoring state.                                                                                                                                            |
| `setNextLineConfig`                                                                                                                                                                      | `{manual?: {enabled?: Bool, requireLineCompleted?: Bool}, auto?: {enabled?: Bool, trigger?: "fromStart" \| "fromComplete", delay?: Nonnegative}, applyMode?: "singleLine" \| "persistent"}` | delay is milliseconds, fractional numbers supported. `{}` is valid and uses runtime defaults: manual enabled, manual completion requirement false; auto disabled, trigger fromComplete, delay 1000; applyMode persistent.                                                     |
| `toggleAutoMode`, `startSkipMode`, `stopSkipMode`, `toggleSkipMode`, `toggleDialogueUI`, `popOverlay`, `hideConfirmDialog`, `incrementSaveLoadPagination`, `decrementSaveLoadPagination` | `Empty`                                                                                                                                                                                     | No payload options, event objects, or arbitrary metadata.                                                                                                                                                                                                                     |
| `pushOverlay`                                                                                                                                                                            | `{resourceId!: Ref(layouts)}`                                                                                                                                                               | Any supported non-folder layout type is permitted, matching the current chooser. The target must be a layout resource. Nested layout references follow the existing layout graph rules; specialized layouts still require their normal runtime context to render useful data. |
| `sectionTransition`, `resetStoryAtSection`                                                                                                                                               | `{sectionId!: Id, sceneId?: Id, screen?: ScreenAction}`                                                                                                                                     | Section must exist. Optional sceneId is the shipped Creator qualifier and must match the actual owner. ScreenAction is the complete closed screen schema, with transition animation category. reset clears story-local runtime context; it is not project-history migration.  |
| `rollbackByOffset`                                                                                                                                                                       | `{offset?: negative integer}`                                                                                                                                                               | Omission means -1. Accept only -1 down to -Number.MAX_SAFE_INTEGER, never zero/positive/fraction/string. Player checkpoint availability is checked at execution.                                                                                                              |
| `saveSlot`, `loadSlot`                                                                                                                                                                   | `{slotId?: SlotSelector}`                                                                                                                                                                   | slotId may be omitted only under the explicit automatic slot context below. No new authored `slot`, `slotKey`, thumbnailImage, savedAt, or arbitrary save-state payload. Runtime thumbnail/timestamp injection is separate.                                                   |
| `setDialogueTextSpeed`                                                                                                                                                                   | `{value!: Nonnegative or permitted typed binding}`                                                                                                                                          | Same bound/type after binding resolution.                                                                                                                                                                                                                                     |
| `setAutoForwardDelay`                                                                                                                                                                    | `{value!: Nonnegative or permitted typed binding}`                                                                                                                                          | Milliseconds; same bound/type after binding resolution.                                                                                                                                                                                                                       |
| `setSoundVolume`, `setMusicVolume`                                                                                                                                                       | `{value!: Percent or permitted typed binding}`                                                                                                                                              | No coercion/clamping to rescue an invalid strict input.                                                                                                                                                                                                                       |
| `setSkipUnseenText`, `setSkipTransitionsAndAnimations`, `setMuteAll`                                                                                                                     | `{value!: Bool or permitted typed binding}`                                                                                                                                                 | String "true"/"false" is not a boolean. A numeric slider cannot provide a Bool binding without a declared typed conversion; no such conversion is part of `M`.                                                                                                                |
| `setSaveLoadPagination`                                                                                                                                                                  | `{value!: positive integer or permitted typed binding}`                                                                                                                                     | Same integer/minimum constraint at runtime.                                                                                                                                                                                                                                   |
| `setMenuPage`, `setMenuEntryPoint`                                                                                                                                                       | `{value!: TextTemplate or permitted typed binding}`                                                                                                                                         | Empty string is a supported clear; arbitrary JS expressions are not. Page names are project-defined values, not an invented hard-coded enum.                                                                                                                                  |
| `updateVariable`                                                                                                                                                                         | `{id!: alphanumeric Id matching /^[A-Za-z0-9]+$/, operations!: VariableOperation[]}`                                                                                                        | 1–4,096 operations, evaluated in authored order. Repeated targets are allowed because sequential arithmetic can be intentional. The action id is required and retained during replay.                                                                                         |
| `conditional`                                                                                                                                                                            | `{branches!: ConditionalBranch[]}`                                                                                                                                                          | 1–1,024 ordered branches. First matching branch executes; a branch without when is the optional final else. At most one else, and no branch after it. All branches validate even if currently unreachable.                                                                    |
| `showConfirmDialog`                                                                                                                                                                      | `{resourceId!: Ref(layouts), confirmActions!: nonempty SystemMap, cancelActions?: SystemMap}`                                                                                               | Layout must have confirmDialog type. cancelActions may be {}. Validate callbacks recursively in the deferred context; reject unknown actions even if no player ever confirms.                                                                                                 |

`VariableOperation` is exactly `{variableId!: Ref(variables), op!:
"set"|"increment"|"decrement"|"multiply"|"divide"|"toggle", value?:
typed operand, roundTo?: integer 0..12}`. The variable must be non-computed and
writable; scope is context/device/account as supported by the model/export
contract. A runtime field ID is not a writable variable.

| Variable type | Allowed operations and exact value rules                                                                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| number        | set/multiply/divide require Number (or an explicitly permitted numeric binding). increment/decrement may omit value, meaning 1, or provide Number/binding. divide rejects literal 0 and runtime-resolved 0. roundTo is allowed only for divide, default 2. |
| boolean       | set requires Bool/binding; toggle omits value and roundTo.                                                                                                                                                                                                 |
| string        | set requires TextTemplate/binding, including the empty string; all arithmetic/toggle and roundTo are invalid. If enumValues is declared, static value must be one of them; a dynamic value must satisfy the enum at execution.                             |
| object        | set requires a bounded object/array or a complete binding to an object variable. Nested strings retain supported template/event binding behavior. Root null, arithmetic, toggle and roundTo are invalid.                                                   |

### Object assignments and existing runtime behavior

Strict `M` validates the existing object-assignment format. It adds no operation
marker and requires no engine upgrade. `valueMode` is an unknown operation field.
The editor must not rewrite an existing object assignment when saving it.

Object and array values retain the interpolation performed by route-engine-js
`1.46.1`: `${variables.source}` resolves the declared variable, and `_event.value`
requires an enclosing event context. Nested strings follow the same binding
rules. A complete `${variables.objectSource}` binding may supply the whole value
when that variable has object type. Validate these references without evaluating
or rewriting stored strings; track nested references for deletion checks.

Keys such as `actions` and `confirmActions` remain ordinary data, not executable
action holders. Apply bounded JSON checks and preserve own data keys. A string
inside that data is still subject to the existing runtime interpolation rules;
it is not a new literal-string escape mechanism.

Tests must demonstrate unchanged editor re-save, versioned persistence and
runtime results with the existing published engine. The proposed literal-object
feature is deferred and is not a dependency of strict validation.

No operation changes the project's variable definition/default during authoring;
these are player instructions. Static validation checks permissions, declared
types, enum membership, and arithmetic operands, without inventing the player's
future state. Dynamic overflow, division-by-zero, and runtime permission checks
remain execution responsibilities. Invalid values never become `undefined`
through filtering or normalization to pass a required-field check.

`ConditionalBranch` is `{when?: Condition, actions!: SystemMap}`. Branch IDs
are UI-local and are not an allowed persisted field. The JSON condition grammar
is defined below. Empty actions is permitted (a branch can intentionally do
nothing before the engine's documented continuation).

Sources: [system runtime contract](../../../route-engine/src/schemas/systemActions.yaml),
[variable operation checks](../../../route-engine/src/util.js),
[variable emitter](../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.handlers.js),
[conditional emitter](../../src/components/commandLineConditional/commandLineConditional.handlers.js),
[navigation emitter](../../src/components/commandLineSectionTransition/commandLineSectionTransition.handlers.js),
[confirmation editor](../../src/components/commandLineShowConfirmDialog/commandLineShowConfirmDialog.store.js).

## Expressions, bindings, and action combinations

### Semantic conditions

A `Condition` is a boolean literal, a typed boolean reference, or one closed
operator object. Root strings, root arrays, numbers/null as stand-in booleans,
functions, `call`, unknown operators, and multi-operator objects are rejected.
The accepted grammar is a conservative explicit subset of the engine/Jempl
semantic conditions and the existing model's computed-condition grammar:

| Form                                                      | Exact meaning/type                                                                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{var: Path}`                                             | Read a declared variables or runtime path; typed as the referenced value. Paths are defined below. A condition root must resolve to boolean.                          |
| `{literal: LiteralJSON}`                                  | Literal operand data, including arrays for membership. Never interpret operator-like keys inside literal. As a condition root, only a boolean literal value is valid. |
| `{eq: [Operand, Operand]}`, `{neq: [...]}`                | Exactly two operands, strict non-coercive equality/inequality. Statically known primitive types must agree; no loose equality.                                        |
| `{gt: [Operand, Operand]}`, `gte`, `lt`, `lte`            | Exactly two operands; both numbers or both strings, with the same known type.                                                                                         |
| `{in: [Operand, Operand]}`                                | Exactly two operands; second is a literal or declared array/string. For arrays, primitive members must match the searched value's declared type.                      |
| `{all: [Condition, ...]}`, `{any: [Condition, ...]}`      | At least one boolean condition, subject to expression node/depth budgets.                                                                                             |
| `{not: Condition}`                                        | One nested condition object/value directly, not an operand array.                                                                                                     |
| `{add: [NumericOperand, NumericOperand]}`, `{sub: [...]}` | Exactly two finite numeric operands; usable inside comparisons, not as truthy root conditions.                                                                        |

An `Operand` is a bounded primitive literal, one of those expression objects,
or a LiteralJSON wrapped with `literal`. Arrays cannot masquerade as operand
lists except in the specific operator position. Known variable enum values must
agree with the declaration. Static type uncertainty from a declared object
path is represented as unknown and rechecked at runtime; it does not authorize
function calls, undeclared root names, or malformed operators.

`Path` starts with `variables` followed by a concrete declared variable ID, or
`runtime` followed by one of the fields in the preview runtime table below.
After an object variable ID, allow constant own-property names and nonnegative
integer array indexes, bounded by expression depth. Accept dot notation for
JavaScript identifier tokens and bracket notation with JSON double-quoted
string tokens or numeric indexes. No computed keys, wildcards, prototype
segments, method calls, optional chaining, assignments, or global roots.
Validate paths with a parser, not `eval` or `Function`.

### Text and value binding grammar

`TextTemplate` is text containing zero or more `${Path}` placeholders, where
Path is the closed read grammar above. Placeholders must resolve to a primitive
string/number/boolean; object/array substitution is rejected at execution.
Plain text that contains no `${` stays literal, including braces that are not
template delimiters. Malformed template delimiters fail explicitly; no code,
calls, ternaries, arithmetic, or Jempl object directives are accepted inside
strict action text. Rich text variable references remain the preferred UI
representation. LiteralJSON fields do not inherit this interpolation rule.

A typed binding is either a complete `${Path}` placeholder of the destination's
declared type or one allowed direct event selector below. Surrounding text is
allowed only for a TextTemplate destination. Template strings cannot select an
action name, replace an entire payload/action map, or generate resource IDs.
All resource/scene/section/line references in `M` are static. A future dynamic
resource feature needs a separate explicit contract.

| Selector/context                                                        | Allowed destinations                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_event.value` from slider `change`                                     | Number-valued runtime setters and number variable operation values. The slider's declared min/max/step must fit a required bounded/integer destination, otherwise require a supported explicit fixed value. |
| `_event.value` from input `change` or `submit`                          | String-valued runtime setters and string variable set values. No implicit numeric/boolean coercion.                                                                                                         |
| `_event.slotId` from a save/load-slot element or descendant interaction | saveSlot/loadSlot.slotId only. The node must actually inherit a repeating save/load slot context.                                                                                                           |
| `${variables...}` / `${runtime...}`                                     | Typed value/text destinations listed above, subject to declared types. No event context required.                                                                                                           |

Do not admit `_event` itself, `_event.constructor`, an arbitrary nested event
path, `${item...}`, `${slot...}`, or arbitrary extra event fields from a request.
The current save/load editor hint mentioning `${slot.slotId}` does not establish
a runtime `slot` scope: [runtime context](../../../route-engine/src/RouteEngine.js)
supplies variables/runtime/\_event, and [layout conversion](../../src/internal/project/layout.js)
uses its own `${item.slotId}` while generating event data. New authoring should
use `_event.slotId`; the hint must be corrected in the implementation phase.
Historical payloads retain existing behavior without claiming that an unresolved
binding was valid. Generated runtime templates are outside persisted input.

`SlotSelector` is a nonnegative safe integer, a nonempty bounded string literal
slot name (including numeric strings), a complete Path binding declared as a
string or number satisfying those same constraints, or the contextual
`_event.slotId`. Boolean, object, and array bindings are invalid. Reject reserved
dictionary names.
Omitting slotId is allowed only on save/load-slot interactions or a
showConfirmDialog callback captured from such an interaction: the current
[runtime preprocessor](../../src/internal/runtime/graphicsEngineRuntime.js)
fills that slot before execution. This covers the shipped `{saveSlot:{}}` and
`{loadSlot:{}}` forms. A line action with no slot context must provide slotId.
The current preprocessor does not recursively fill conditional branches; do
not allow an omitted slot selector there. An explicit immediate `_event.slotId`
can be used in a branch that inherits a known slot event.

Deferred confirmation/form callbacks must not accidentally retain an originating
slider's `_event.value`. Confirmed automatic slot capture is a specific
preprocessor behavior, not a general closure over external request data. The
validator carries these context facts explicitly while traversing callbacks.

### Batch combinations and execution

JSON object key order is not execution order. Retain the engine's published
[execution phases](../../../route-engine/src/actionExecutionOrder.js): variable
state changes, decisions, presentation, runtime settings/overlays, save, then
navigation. Validation must not reorder the stored map.

Each immediate action map may contain at most one of `loadSlot`,
`rollbackByOffset`, `resetStoryAtSection`, `sectionTransition`, and `nextLine`.
When validating a strict merge, include recognized retained siblings in this
check. Do not reject an unrelated unknown historical sibling solely because
it exists.

`choice` and `form` are mutually exclusive within an immediate line map.
`startSkipMode`, `stopSkipMode`, and `toggleSkipMode` are mutually exclusive
within one map. `showConfirmDialog` and `hideConfirmDialog` cannot coexist in one
map. These avoid contradictory instructions without changing engine ordering.

Conditional navigation is path-sensitive: each branch individually follows the
same direct-navigation rule. A containing map with a conditional whose any
branch can navigate must not also contain a direct navigation action. Independent
deferred choices/form/confirmation callbacks are not counted as simultaneous
navigation with the action that displays them. Their own maps validate when
authored. Navigation in an unreachable branch still counts, since runtime
variables may change.

No new rule forbids a normal presentation action and a direct section transition
merely because they coexist; the runtime has defined navigation precedence.
Do not evaluate conditions during authoring to skip branch validation.

## Layout/control interaction and preview contracts

### Interaction wrappers

An authored `Interaction` is exactly `{inheritToChildren?: Bool, payload?:
InteractionPayload}`. `InteractionPayload` is exactly `{actions?: SystemMap}`.
The following all have supported distinct shapes: `{}`, `{inheritToChildren:
true}`, `{payload:{}}`, and `{payload:{actions:{}}}`. All are explicit no-action
or inheritance configuration; `null`, payload42, a string action map, and
unknown wrapper keys are invalid. There is no authored `payload._event`, DOM
event object, `_formKey`, `_interactionSource`, or bypass flag. Those are
generated runtime context, not a public authoring escape hatch.

Apply the same contract at every supported model interaction property:
`hover`, `click`, `rightClick`, `scrollUp`, `scrollDown`, `change`, `submit`,
`focusEvent`, `blurEvent`, `selectionChange`, `compositionStart`,
`compositionUpdate`, and `compositionEnd`. Keep the existing model's element
type constraints; change is a value-bearing input/slider event, and input-only
events need an input element. `scroll` is a boolean display property, not an
action holder. `inheritToChildren` preserves existing interaction inheritance,
but cannot invent an event value/type absent from the actual event.

Control `keyboard` and `keyup` are closed dictionaries with optional keys
`enter`, `space`, `esc`, `ctrl`, `left`, `right`, `up`, `down`, each holding
Interaction. No arbitrary key name, numeric value, direct `.actions`, or opaque
payload is accepted. Keyboard/keyup events have no declared `_event.value`.
Runtime keyboard aliases generated by layout conversion are not new stored
spellings.

Recursively inspect all element collections on layout/control create, update,
element create/update, duplicate/copy, and whole-project create. Referenced
fragments use the existing closed layout-element schema and graph ownership
rules. A fragment copy validates its newly copied interactions. A resource
reference alone is not a copy: only dependency effects and existing invariants
are checked unless that referenced structure is also being authored.

Conditional layout override `set` objects cannot introduce interactions: preserve
their existing model allowlist. Their `when` object remains the existing closed
`{target,op,value}` rule, with variable/runtime reference and type checking;
it is not interchangeable with an arbitrary action callback.

Sources: [interaction accessors](../../src/internal/project/interactionPayload.js),
[layout conversion](../../src/internal/project/layout.js), and
[model element validation](../../../routevn-creator-model/src/model.js).

### Preview is closed example data

Layout/control `preview` is exactly `{backgroundImageId?: Ref(images),
variables?: PreviewVariables, runtime?: PreviewRuntime, dialogue?:
PreviewDialogue, dialogueLines?: PreviewDialogueLine[], historyDialogue?:
PreviewHistoryLine[], choice?: PreviewChoice, confirmDialog?:
PreviewConfirmDialog, saveSlots?: PreviewSlot[], form?: {values!:
{fieldName: Text}}}`. `{}` is valid. No other root keys, free-form actions,
engine snapshot, state version, or arbitrary runtime state is permitted.

| Preview structure    | Exact closed fields and rules                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PreviewVariables     | Dictionary keyed by declared variable IDs. Values are LiteralJSON of each variable's declared type and enum. These are examples, never writes to player state. Computed variable preview values must come from the documented computed preview behavior rather than becoming writable definitions.                                                                                                                          |
| PreviewRuntime       | Optional numeric `dialogueTextSpeed:Nonnegative`, `autoForwardDelay:Nonnegative`, `soundVolume:Percent`, `musicVolume:Percent`, `saveLoadPagination:positive integer`; boolean `skipUnseenText`, `skipTransitionsAndAnimations`, `muteAll`, `autoMode`, `skipMode`, `dialogueUIHidden`, `isLineCompleted`; text `menuPage`, `menuEntryPoint`. No other runtime field is included in the current Creator preview vocabulary. |
| PreviewDialogueLine  | `{characterId?: Ref(characters) or "", characterName?: Text, character?: {name?: Text, sprite?: PreviewDialogueSprite}, content!: RichContent}`. Empty characterId is the explicit preview-only no-speaker sentinel.                                                                                                                                                                                                        |
| PreviewDialogue      | PreviewDialogueLine fields plus `lines?: PreviewDialogueLine[]`. Top-level content may be omitted when only lines are supplied; at least content or lines is required. It is preview text, not the dialogue action schema.                                                                                                                                                                                                  |
| PreviewHistoryLine   | `{characterName?: Text, text!: Text}`. No saved engine state or callbacks.                                                                                                                                                                                                                                                                                                                                                  |
| PreviewChoice        | `{items!: {content!: Text, events?: {click?: {actions!: SystemMap}}}[]}`. IDs/layout refs are absent in the shipped preview form. Every supplied callback still validates; a preview label does not grant an execution-schema bypass.                                                                                                                                                                                       |
| PreviewConfirmDialog | `{resourceId?: Ref(layouts) or "", confirmActions?: SystemMap, cancelActions?: SystemMap}`. Empty resourceId and empty callbacks are the shipped mock-dialog placeholders; nonempty resourceId must be confirmDialog layout type.                                                                                                                                                                                           |
| PreviewSlot          | `{slotId!: positive integer, image?: Ref(images), savedAt?: nonnegative integer, isAvailable?: Bool}`. No `state`, raw save history, URL injection, or extra transport metadata. Timestamp examples are metadata; do not impose clock-dependent validation.                                                                                                                                                                 |
| Preview form values  | Every key names an input field found in the owner layout/its fragments. Values are bounded strings; no event handlers or DOM objects.                                                                                                                                                                                                                                                                                       |

`PreviewDialogueSprite` is exactly `{transformId?: Ref(transforms), items?:
SpriteSelection[]}`. It is supported inside both `preview.dialogue.character`
and the shared preview-line character shape. Sprite selections resolve uniquely
across character owners; the displayed avatar need not belong to the speaker.
No inline render tree or unknown sprite field is accepted. An empty item array
clears the sample avatar. A missing transform is permitted in this preview-only
configuration because the current picker can store an avatar before its
transform is chosen; if supplied, the transform must resolve. This does not
relax the ordinary `DialogueSprite` requirement for a nonempty authored action.
Trusted preview composition omits undefined optionals before strict submission.
Save/reopen must retain the sprite resource, slot ID, and selected transform.

All preview arrays have at most 1,024 entries. If both `dialogue.lines` and
`dialogueLines` are present they must agree; no destructive normalization on
read. The shipped default template's empty character IDs and confirmation
resource IDs are permitted only in preview, never as ordinary authored refs.
PreviewSlot.state is rejected in strict authoring: the current preview builder
copies it if supplied but the actual editor creates only sample slot metadata;
a general snapshot field is not needed for rendering that sample. Trusted
builders must omit `undefined` optionals before the authoring gate.

Existing animation/audio-effect/transform preview schemas are already closed in
the model and remain governed by those resource contracts. Do not use this
layout preview union to loosen them. In particular animation preview slots are
background/outgoing/incoming/target objects with their documented image and
transform refs, not arbitrary presentation actions.

Sources: [preview builder](../../src/components/layoutEditorPreview/support/layoutEditorPreviewData.js),
[dialogue samples](../../src/components/layoutEditorPreview/support/layoutEditorPreviewDialogue.js),
[choice samples](../../src/components/layoutEditorPreview/support/layoutEditorPreviewChoice.js),
[confirmation samples](../../src/components/layoutEditorPreview/support/layoutEditorPreviewConfirmDialog.js),
[slot samples](../../src/components/layoutEditorPreview/support/layoutEditorPreviewSaveLoad.js),
[runtime fields](../../src/internal/runtimeFields.js), and
[shipped preview data](../../static/templates/default/repository.json).

## Character spritesheet prerequisite

The current client adapter owns a character-spritesheet extension that the
model's character sprite validator rejects. It strips spritesheets before model
validation, reduces related commands itself, and restores extensions afterward.
Strict action validation needs those resources for valid sprite references.
Model support for the following exact extension is therefore a prerequisite,
not an optional client-side validator.

Character sprite create data for `type:"spritesheet"` has exactly:
`{type!: "spritesheet", name!: nonempty Text, description?: Text,
tagIds?: Id[], thumbnailFileId?: Ref(files:image), fileId!: Ref(files:image),
sheetWidth?: Positive, sheetHeight?: Positive, frameCount?: positive integer,
width?: Positive, height?: Positive, jsonData!: Atlas, animations!:
{clipName: Clip}}`. Stored items add only `id!: Id`; update data permits the
same fields except id/type. Optional tagIds are
unique and refer to the character's sprite-tag scope. Empty tagIds uses the
existing command's remove-tags behavior. The main file must be an image file.

Creation and duplication validate the complete new sprite. Updating only
name, description, or tags validates those affected values without retroactively
validating an untouched historical Atlas or clip map. An Atlas, clip, main-file,
or dimension update validates the complete affected Atlas/clip/file/dimension
relationship after merging, because those values jointly determine frame
validity. A newly strict action referencing an existing legacy sprite checks
its identity, owner, resource type, and any selected clip; it does not convert
that reference lookup into a full strict rewrite/validation of unrelated
historical sprite metadata. In particular, an existing meta-only legacy Atlas
may survive a rename; a new sprite with that same incomplete Atlas is rejected.

`Clip` is `{frames!: nonempty nonnegative-integer[], fps?: Positive,
animationSpeed?: Positive, loop?: Bool}`. Clip names are bounded nonempty safe
dictionary keys. Each frame index must exist in `Object.keys(atlas.frames)`
order. Duplicate frame indexes are allowed for repeated animation timing.
fps and animationSpeed may coexist only when fps equals animationSpeed\*60;
otherwise reject ambiguous playback. Omission retains current default 24fps.
The current UI writes fps; earlier animationSpeed is an explicitly supported
representation. At least one clip is required for a newly authored spritesheet.

`Atlas` is exactly `{frames!: {frameName: AtlasFrame}, animations?:
{clipName: nonempty frameName[]}, meta?: AtlasMeta}`. At least one frame is
required; use NEW_OBJECT_KEYS/NEW_ARRAY_ITEMS limits for frame/clip counts.
Atlas animation names must resolve to declared frame names. Atlas and resource
clip maps can coexist; resource clips use indexed references as above.

`AtlasFrame` is `{frame!: Rect, rotated?: Bool, trimmed?: Bool,
spriteSourceSize?: Rect, sourceSize?: Size, anchor?: {x!: Number,y!: Number},
borders?: {left?: Nonnegative,right?: Nonnegative,top?: Nonnegative,bottom?:
Nonnegative}}`. `Rect = {x!:Nonnegative,y!:Nonnegative,w!:Positive,h!:Positive}`;
`Size = {w!:Positive,h!:Positive}`. Texture rectangles must fit known sheet
dimensions; trimmed rectangles must fit sourceSize when supplied. Numeric
dimensions/coordinates may be fractional where supported by the asset format;
frameCount is an integer and, when supplied, equals the number of frames.

`AtlasMeta` has optional `app:Text`, `version:Text`, `image:Text`, `format:Text`,
`scale: decimal-string`, `size:Size`, `frameTags:FrameTag[]`, `layers:
LiteralJSON[]`, `slices:LiteralJSON[]`, and `related_multi_packs:Text[]`.
The scale string must match `^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$` and denote
a Positive value; exponent notation, signs, whitespace, and leading zeroes are
not accepted. Parsing checks the value without changing its authored bytes.
`FrameTag` is `{name!:Id,from!:
nonnegative integer,to!:nonnegative integer,direction?:
"forward"|"reverse"|"backward"|"pingpong"|"pingpong_reverse",repeat?:
nonnegative integer|string-of-decimal-digits,color?:Text}`. Require from<=to
and to<frame count. layers/slices are explicitly retained bounded vendor
metadata; they do not execute and are not action schemas. Unknown AtlasMeta
keys are rejected on new authoring. Transport importer normalization of an
external atlas is a documented format conversion before constructing this
strict domain representation, not blanket API field stripping.

This exact Atlas/Clip contract also applies to new top-level spritesheet
resources used by background/visual actions. Existing fixture-only empty atlas
objects remain legacy; they do not justify unusable new resources. The current
atlas importer sometimes retains arbitrary metadata, so its output must satisfy
this concrete schema before a strict command is accepted.

Sources: [adapter extension fields and reduction](../../src/internal/creatorModelAdapter.js),
[atlas importer](../../src/internal/spritesheetAtlas.js),
[clip behavior](../../src/internal/spritesheets.js),
[model character sprite contract](../../../routevn-creator-model/src/model.js).

## Project default dialogue avatar transform

Schema 15 already supports `project.defaultDialogueAvatarTransformId?:
Ref(transforms)` and `project.set_default_dialogue_avatar_transform` with the
exact payload `{transformId!: Ref(transforms) | null}`. Strict `M` retains this
contract: omitted/empty/stringified-null values, folders, missing transforms,
and extra payload fields fail. Explicit null clears the preference by removing
the state property. A strict new full state may omit the property but cannot
store null there. This command uses the main partition/settings scope and must
pass the same version stamping, state validation, persistence, and replay gates
as other commands.

The preference seeds a future avatar selection; changing it does not rewrite
existing dialogue or preview selections. Preserve the model's existing explicit
transform-deletion rule: deleting the selected transform, including through
recursive folder deletion, clears this preference. This is a documented reducer
rule, not an exception allowing newly dangling authored action/preview refs.
Those other references still receive the strict before/after impact checks.
Name-only transform edits retain the preference. Setting/clearing it must not
strictly revalidate unrelated legacy actions. Add set/replace/clear/delete,
invalid-target, full-state, and mixed-version round-trip cases alongside
`tests/puty/14-default-dialogue-avatar-storage.spec.yaml`.

## Command mutation and compatibility rules

The action schema is selected by the recorded model version. Do not tag the
entire project with the latest command version. These mutation scopes apply to
strict commands in both new and old projects:

| Command operation                                        | Strict scope and exact rule                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| project.create / new full-state template                 | Complete supplied state including every line action, interaction, preview callback, and sprite extension. Validate original authored domain input before normalization; no free-form template exception.                                                                                                                                                                 |
| line.create                                              | Every supplied new line's complete actions map; omitted actions constructs the supported empty map. Creating copies of legacy content is new authoring.                                                                                                                                                                                                                  |
| line.update_actions default merge                        | Action-name-level shallow replacement. Each supplied action is a complete replacement for that named action, except an explicit preserve path; no automatic deep merge. Validate each supplied/effective action, and combinations with relevant retained known siblings.                                                                                                 |
| preserve:["dialogue.content"]                            | Allowed only when replace is not true and data.dialogue is an object. If data.dialogue has its own content, it wins. Otherwise inherit current content when present. Validate the inherited content as part of the effective edited dialogue. Missing content can remain missing because presentation-only dialogue is supported. Unknown/duplicate preserve paths fail. |
| replace:true                                             | The entire replacement action map is newly authored and strictly validates, including retained content the caller copied into it. Omitted keys are removed. preserve is forbidden with replace:true.                                                                                                                                                                     |
| Deleting an action                                       | Existing API represents this by replacement of the remaining map; the removed action itself need not validate. Remaining replacement actions are strict. Removing an entire line/section does not require repair of the removed actions. No separate action-delete command is introduced by this preparation.                                                            |
| Rename/reorder                                           | Do not retroactively validate unrelated legacy action fields. Existing payload/placement/state invariants still apply.                                                                                                                                                                                                                                                   |
| Same-identity section/line move                          | Use existing model move semantics, preserving the same section/line objects. Do not implement an unchanged move as delete+strict recreate of legacy actions. Recheck ownership-sensitive voice/section references and inbound supported references that the move could newly invalidate.                                                                                 |
| Copy/duplicate/restore content as an edit                | New content validates completely. Stable old names/IDs are not evidence that the copy is historical replay.                                                                                                                                                                                                                                                              |
| Edit/delete a referenced resource or variable definition | Compare relevant recognized dependencies before/after. Reject newly dangling/wrong-kind/permission-invalid supported references, including inbound refs outside the edited partition. Existing unrelated invalid legacy refs are not a reason to reject. No implicit historical ref rewriting.                                                                           |
| Layout/control/element updates                           | Validate the complete effective interaction or preview field being authored; recursively validate newly created/copied element subtrees. A name-only update does not validate every old callback.                                                                                                                                                                        |
| Command batch / replay                                   | Validate each command's payload and affected result in sequence. An invalid intermediate strict action cannot be hidden by a later deletion. Validate versioned intermediate steps during replay as well as online acceptance.                                                                                                                                           |

The catalog does not authorize automatic sanitation, replacement bootstrap,
history migration, SQL changes, or new history generations. Raw envelope1 rows
are left unchanged. A strict edit rejected because it preserves invalid legacy
content reports the path; the author can explicitly replace that action.

Input checks must happen before a trusted adapter erases information. In
particular, new strict input cannot benefit from legacy gui coercion, blur
kernel rounding, source field stripping, empty number-variable default repair,
filter regeneration, or omitted-version fallback. Explicitly supported aliases
above are validated as aliases; they are not unbounded fallback shapes. Trusted
UI composition may convert its documented local state to domain fields before
the gate, including dropping UI-only non-enumerable display metadata and
omitting optional undefined values. Public API input cannot request that path.

## Concrete fixture obligations

The following cases are executable-test inputs for the later model test runner,
not claims that strict validation already exists. Each payload is used with its
row's action name in a strict line actions map unless the Context column says
otherwise. Validation receives explicit `modelSchemaVersion:M`.

The fixture repository contains: general layout `layout-menu`; input layout
`layout-input` with exactly one input field `name`; confirmDialog layout
`layout-confirm`; controls resource `control-one`; scene `scene-one` containing
nonempty section `section-one`; writable context string variable `var-name`;
number variable `var-score`; and the usual compatible empty collections. These
are test IDs, not reserved real resource IDs. Every valid reference example
requires these actual resources in fixture state; payload-only tests also run
without state to distinguish schema and precondition failures.

`extra` below means the exact same valid payload with an additional own key
`unexpected: true`, not a separate allowed placeholder. This one shared negative
must run for every row as well as the individual negative shown.

| Action                          | Minimal valid payload                                                         | Explicit invalid payload                                                             | Context                                      |
| ------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| screen                          | `{}`                                                                          | `{"opacity":2}`                                                                      | line                                         |
| background                      | `{}`                                                                          | `{"resourceType":"unknown"}`                                                         | line                                         |
| dialogue                        | `{}`                                                                          | `{"content":42}`                                                                     | line                                         |
| character                       | `{}`                                                                          | `{"items":[{"id":"missing-character"}]}`                                             | line; precondition failure                   |
| visual                          | `{}`                                                                          | `{"items":[{"id":"visual-one"}]}`                                                    | line; missing resourceId                     |
| choice                          | `{}`                                                                          | `{"items":[{"content":"One","events":{"click":{"actions":{"unknown":{}}}}}]}`        | line                                         |
| form                            | `{"resourceId":"layout-input","fields":{"name":{"variableId":"var-name"}}}`   | `{"resourceId":"layout-input","fields":{"name":{"variableId":"var-score"}}}`         | line; wrong variable type                    |
| sfx                             | `{}`                                                                          | `{"items":[],"channels":[]}`                                                         | line                                         |
| bgm                             | `{}`                                                                          | `{"volume":101}`                                                                     | line                                         |
| voice                           | `{"sounds":[]}`                                                               | `{}`                                                                                 | line                                         |
| control                         | `{"resourceId":"control-one"}`                                                | `{"resourceId":"layout-menu"}`                                                       | line; wrong resource kind                    |
| nextLine                        | `{}`                                                                          | `{"bypassChoice":"true"}`                                                            | line or system callback                      |
| setNextLineConfig               | `{}`                                                                          | `{"auto":{"delay":-1}}`                                                              | line or system callback                      |
| toggleAutoMode                  | `{}`                                                                          | `{"enabled":true}`                                                                   | line or system callback                      |
| startSkipMode                   | `{}`                                                                          | `{"mode":"fast"}`                                                                    | line or system callback                      |
| stopSkipMode                    | `{}`                                                                          | `{"enabled":false}`                                                                  | line or system callback                      |
| toggleSkipMode                  | `{}`                                                                          | `{"value":true}`                                                                     | line or system callback                      |
| toggleDialogueUI                | `{}`                                                                          | `{"visible":false}`                                                                  | line or system callback                      |
| pushOverlay                     | `{"resourceId":"layout-menu"}`                                                | `{"resourceId":"control-one"}`                                                       | line or system callback; wrong kind          |
| popOverlay                      | `{}`                                                                          | `{"count":1}`                                                                        | line or system callback                      |
| rollbackByOffset                | `{}`                                                                          | `{"offset":0}`                                                                       | line or system callback                      |
| sectionTransition               | `{"sectionId":"section-one"}`                                                 | `{"sectionId":"section-one","sceneId":"wrong-owner"}`                                | line or system callback; ownership failure   |
| resetStoryAtSection             | `{"sectionId":"section-one"}`                                                 | `{"sectionId":null}`                                                                 | line or system callback                      |
| saveSlot                        | `{"slotId":1}`                                                                | `{}`                                                                                 | line without automatic slot context          |
| loadSlot                        | `{"slotId":"slot-one"}`                                                       | `{"slotId":-1}`                                                                      | line without automatic slot context          |
| updateVariable                  | `{"id":"update1","operations":[{"variableId":"var-score","op":"increment"}]}` | `{"id":"update1","operations":[{"variableId":"var-score","op":"divide","value":0}]}` | line or system callback                      |
| conditional                     | `{"branches":[{"actions":{}}]}`                                               | `{"branches":[{"actions":{}},{"when":true,"actions":{}}]}`                           | line or system callback; else not last       |
| showConfirmDialog               | `{"resourceId":"layout-confirm","confirmActions":{"nextLine":{}}}`            | `{"resourceId":"layout-confirm","confirmActions":{}}`                                | line or system callback                      |
| hideConfirmDialog               | `{}`                                                                          | `{"resourceId":"layout-confirm"}`                                                    | line or system callback                      |
| setDialogueTextSpeed            | `{"value":0}`                                                                 | `{"value":-1}`                                                                       | line or system callback                      |
| setAutoForwardDelay             | `{"value":0}`                                                                 | `{"value":"1000"}`                                                                   | line or system callback; no numeric coercion |
| setSkipUnseenText               | `{"value":false}`                                                             | `{"value":"false"}`                                                                  | line or system callback                      |
| setSkipTransitionsAndAnimations | `{"value":false}`                                                             | `{"value":0}`                                                                        | line or system callback                      |
| setSoundVolume                  | `{"value":0}`                                                                 | `{"value":101}`                                                                      | line or system callback                      |
| setMusicVolume                  | `{"value":0}`                                                                 | `{"value":-1}`                                                                       | line or system callback                      |
| setMuteAll                      | `{"value":false}`                                                             | `{"value":null}`                                                                     | line or system callback                      |
| setSaveLoadPagination           | `{"value":1}`                                                                 | `{"value":1.5}`                                                                      | line or system callback                      |
| incrementSaveLoadPagination     | `{}`                                                                          | `{"value":1}`                                                                        | line or system callback                      |
| decrementSaveLoadPagination     | `{}`                                                                          | `{"value":-1}`                                                                       | line or system callback                      |
| setMenuPage                     | `{"value":""}`                                                                | `{"value":1}`                                                                        | line or system callback                      |
| setMenuEntryPoint               | `{"value":""}`                                                                | `{"value":{}}`                                                                       | line or system callback                      |

Add these context pairs to the same exact cases: saveSlot/loadSlot `{}` passes
under a real repeating save/load-slot interaction and fails in a plain keyboard
interaction; `setMusicVolume:{value:"_event.value"}` passes under slider-change
whose range is 0..100 and fails as a line action; a presentation `screen:{}`
passes as line content and fails inside a SystemMap. These cases test dispatch
and scope rather than merely duplicating a primitive validator.

Each registry name needs positive minimum/full cases and negative unknown-field,
wrong-type, wrong-context, null, and reference cases using the exact contracts
above. The fixture matrix must also include all these cross-cutting cases:

- One supported example per shared structure and every enum choice; zero,
  negative, boundary, fractional, nonfinite, empty, omitted, and null cases
  distinguish actual domain behavior rather than testing only object shapes.
- Dialogue content as string and segments; text/reference exclusivity,
  inline styles, furigana, gui/ui exclusivity, optional content, NVL clearPage,
  ADV append, persisted speaker/sprite changes, and invalid inherited content.
- Character image and spritesheet selections, independent dialogue speaker
  and sprite owner, missing/wrong-owner/ambiguous sprite, nonexistent clip,
  invalid frame bounds, and client-adapter bypass prevention.
- Background color+resource, unique untyped reference, explicit mismatched
  resourceType, transform reference conflict, visual layer ordering, and
  rejecting inline engine-only visual render trees.
- Each of seven exact shader sources and parameter boundaries; source changed
  by one byte, missing backend, extra uniform, extra field, unknown filter,
  duplicate filter, and deliberately unsupported arbitrary shader.
- BGM/voice single-resource and schedule forms, SFX shorthand/channel forms,
  empty stops, duplicate sound/channel IDs, same resource scheduled twice,
  persistent identity retention, null endAt, reversed ranges, and wrong-scene
  voice ownership.
- Choice/form/confirm nested invalid action, exact event wrapper shape,
  empty valid inheritance configurations, illegal direct actions alias,
  keyboard and keyup dictionaries, input-field mappings, and forbidden
  runtime-generated request metadata.
- Object/array assignments and whole-object bindings preserve existing
  interpolation through re-save and versioned persistence. Reject unknown
  operation fields, incompatible variable types, missing nested references and
  unavailable event contexts. Test against the existing published engine.
- Avatar preview save/reopen with a different speaker and sprite owner, optional
  transform, invalid sprite/transform refs, and unknown nested fields; project
  default-avatar-transform set/replace/clear and deletion cleanup.
- Static number/boolean/string/object variable writes, enum writes, computed
  read-only rejection, repeat-target sequential operations, divide0,
  optional increment/decrement value, and literal object keys that resemble
  actions/operators but remain data.
- Semantic condition operator arities and types, else placement, empty branch
  actions, nested callbacks at depth16 and17, forbidden call, dangerous path
  segments, and action-looking literal values that are never executed.
- Known `_event.value` context versus line/keyboard/deferred callback absence,
  slot `{}` under the shipped repeating slot element versus an ordinary line,
  confirmation slot capture, explicit branch slot selector, malformed
  interpolation, and unsupported `${slot.slotId}` hint syntax.
- All shipped default-template action/preview representations are accepted by
  their closed strict contracts, including no-ID preview choices and preview
  empty speaker/confirmation IDs. Unexpected extras in formExtras, PreviewSlot
  state, or copied atlas metadata fail before write.
- Old lineA with unsupported content plus strict lineB edit; same-identity
  section move preserves old line objects; move breaking a supported
  scene/section pair or scene-local voice rejects; unchanged rename succeeds;
  strict copy of the same unsupported content fails.
- Full-state strict validation, per-command strict transitions, and sequential
  replay agree on newly authored fields. Version metadata is actually passed
  into the model test harness; an archive directory number is not a substitute.

The precise fixture recording/identity and entry-point requirements live beside
this catalog in the Phase1 preparation documents. No renderer/source schema
with `additionalProperties:true`, an opaque condition object, or a missing
catalog branch is an acceptable implementation shortcut.
