#ifndef ROUTEVN_EXPORTER_FFI_H
#define ROUTEVN_EXPORTER_FFI_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Progress callback. `phase` is valid only during the call. The exporter may
 * call it from several threads, so `context` must be safe to use from any
 * thread.
 */
typedef void (*routevn_progress_callback)(void *context, const char *phase,
                                          uint64_t current, uint64_t total);

/*
 * Returns JSON `{"available":bool,"reason"?:string}`. Free the result with
 * routevn_string_free.
 */
char *routevn_android_export_capabilities(const char *template_path,
                                          const char *descriptor_path);

/*
 * Runs an Android APK export. `request_json` uses the AndroidExportRequest
 * fields in camelCase. Returns JSON
 * `{"ok":true,"result":{...}}` or
 * `{"ok":false,"error":{"code":string,"message":string}}`.
 * Free the result with routevn_string_free. Blocks until the export ends.
 */
char *routevn_android_export_apk(const char *request_json,
                                 routevn_progress_callback on_progress,
                                 void *context);

void routevn_string_free(char *value);

#ifdef __cplusplus
}
#endif

#endif
