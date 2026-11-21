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
 * The same for the Android App Bundle template.
 */
char *routevn_android_bundle_export_capabilities(const char *template_path,
                                                 const char *descriptor_path);

/*
 * Runs an Android APK export. `request_json` uses the AndroidExportRequest
 * fields in camelCase, with an optional `signingKey` (a signing key as the
 * project stores it) that signs the APK. Returns JSON
 * `{"ok":true,"result":{...}}` or
 * `{"ok":false,"error":{"code":string,"message":string}}`.
 * Free the result with routevn_string_free. Blocks until the export ends.
 */
char *routevn_android_export_apk(const char *request_json,
                                 routevn_progress_callback on_progress,
                                 void *context);

/*
 * Runs an Android App Bundle export. The request is the APK export's, with
 * `signingKey` required. Returns the same JSON shape.
 */
char *routevn_android_export_bundle(const char *request_json,
                                    routevn_progress_callback on_progress,
                                    void *context);

/*
 * Signing keys. Each takes a JSON request and returns the same JSON shape as
 * an export; free the result with routevn_string_free.
 *
 * create:  {"applicationName","applicationId"} -> a new signing key
 * read:    {"keystore" (PKCS #12, base64),"password","alias"?} -> its key
 * encode:  {"key","password","alias"} -> {"keystore" (PKCS #12, base64)}
 */
char *routevn_android_create_signing_key(const char *request_json);
char *routevn_android_read_keystore(const char *request_json);
char *routevn_android_encode_keystore(const char *request_json);

void routevn_string_free(char *value);

#ifdef __cplusplus
}
#endif

#endif
