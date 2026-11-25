# Sending a project to support

Help → Send Project to Support sends one project to RouteVN support, so
support can open it and reproduce a problem. The user needs no account: support
gives them a six-character code, and the code is the only grant. The desktop
app offers it; other platforms leave it out of the help menu, because sending
needs the project folder packed natively.

## Flow

1. The dialog says what is shared, the project and facts about this computer,
   and that support's copy is deleted within 30 days. It asks for the code and
   the project, with the open project chosen; every project in the list can be
   picked. With no projects, the help menu says to create or open one first.
2. The app packs the project (see [Packing](#packing)) and reads its size and
   SHA-256.
3. It calls `creator.prepareDebugUpload` with the code, the size, the SHA-256
   and the [device facts](#device-facts). The answer is a signed link, the
   headers to send with it, and when the upload must be completed.
4. It uploads the zip with one `PUT` to the link, with exactly those headers
   and its `Content-Length`. A `412` answer means storage already holds the
   file from an earlier try that stopped before completing; the send goes on.
5. It calls `creator.completeDebugUpload` with the code and the SHA-256. The
   answer, `deleteAfter`, is the day shown to the user: support's copy is
   deleted then, or sooner when support is done with it.
6. The packed zip is deleted, however the send ends.

A progress dialog shows packing, then the bytes uploaded. Its Cancel button
stops packing or the upload and closes without a message. Once the upload has
finished the button is disabled, because the project is already with support.
One project is sent at a time.

## Codes

A code is six characters of `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`: no `0`, `1`,
`I` or `O`. The field accepts either case, with spaces or hyphens anywhere;
the app uppercases the code and drops those before sending it.

## Packing

The zip holds one top-level `project/` folder, the layout
[Project Import](project-import.md) reads, so support opens it with the zip
import:

| Entry                          | Content                                                                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project/project.db`           | A consistent copy of the database, made with `VACUUM INTO`. It includes writes still only in the write-ahead log and leaves the database unchanged, so the project can stay open while it is sent. Compressed. |
| `project/files/<name>`         | Each regular file directly inside `files/`, stored as it is.                                                                                                                                                   |
| `project/file-metadata/<name>` | Each regular file directly inside `file-metadata/`. Compressed.                                                                                                                                                |

Dot-files, links, subfolders and anything else in the folder are left out.
Entries are in name order with fixed times, so packing the same project again
gives the same bytes and the same SHA-256, and a retry with the same code
reuses the file already uploaded. The zip is written to a new temporary folder
and read back for its SHA-256; nothing is held in memory whole. A zip over
2 GiB is refused before any request.

## Requests

The client calls two JSON-RPC methods at `https://api1.routevn.com/creator/rpc`,
with the `X-RouteVN-RPC: 1` header and no credentials:

| Method                        | Params                                      | Result                                                                     |
| ----------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| `creator.prepareDebugUpload`  | `{code, data: {sizeBytes, sha256}, device}` | `{uploadUrl, requiredHeaders: [{name, value}], expiresAt, completeBefore}` |
| `creator.completeDebugUpload` | `{code, sha256}`                            | `{deleteAfter}`                                                            |

The upload goes to `uploadUrl` from the desktop app itself, not the web view.
It accepts HTTPS, or HTTP to a loopback host, and follows no redirects. It
fails when no bytes go out for 60 seconds, or when no answer comes 120 seconds
after the last byte.

## Device facts

`device` carries the facts the asset store reads (see
[Import Packages](import-packages.md)), with these beside them:

| Field                         | Value                                                                      |
| ----------------------------- | -------------------------------------------------------------------------- |
| `osVersion`, `model`          | The system's version and the computer's model, as update checks read them. |
| `arch`                        | `x86_64`, `i686`, `aarch64` or `armv7`.                                    |
| `webViewVersion`              | The web view's version.                                                    |
| `memoryBytes`                 | Total memory.                                                              |
| `freeDiskBytes`               | Free space on the drive that holds the project.                            |
| `gpu`                         | WebGL's renderer name, such as `ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)`.  |
| `maxTextureSize`              | WebGL's largest texture size. Images larger than it can't be drawn.        |
| `screenWidth`, `screenHeight` | The screen in CSS pixels.                                                  |
| `pixelRatio`                  | The device pixel ratio.                                                    |

The computer's name, user names and serial numbers are never read. A fact that
can't be read, or is out of range, is left out; when no facts can be read, the
project is sent without `device`.

## Outcomes

| Outcome                                                      | The user is told                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| Sent                                                         | When support's copy is deleted.                            |
| `DEBUG_CODE_UNUSABLE` `UNKNOWN`                              | No code matches; check it and try again.                   |
| `DEBUG_CODE_UNUSABLE` `EXPIRED` or `USED`                    | Ask support for a new code.                                |
| `UPLOAD_LIMIT_REACHED`                                       | The code was tried too many times; ask for a new one.      |
| `DEBUG_CODE_RATE_LIMITED`, HTTP 429                          | Too many tries from this network; wait, then try again.    |
| `VALIDATION_FAILED` `TOO_LARGE`, or a zip over 2 GiB         | The project is too large to send this way.                 |
| `DEBUG_UPLOADS_UNAVAILABLE`, no connection or a server error | RouteVN could not be reached.                              |
| Anything else                                                | The project could not be sent, with the technical details. |

## Testing against a local API

Development builds call `http://127.0.0.1:3100/creator/rpc` instead. Set
`VITE_ROUTEVN_CREATOR_RPC_URL` when starting the watch server to use another
local API. A local API that serves the creator methods, has a code to send
with, and signs loopback upload links lets the whole flow run on one machine.
