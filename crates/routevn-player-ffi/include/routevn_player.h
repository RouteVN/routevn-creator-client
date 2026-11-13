#ifndef ROUTEVN_PLAYER_H
#define ROUTEVN_PLAYER_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// The encrypted game package of an exported iOS player. One package may be
// read from several threads; reads are serialized.
typedef struct RouteVNPackage RouteVNPackage;

// Opens the package file at `path`. Returns NULL when the file is missing or
// is not a valid package.
RouteVNPackage *routevn_package_open(const char *path);

// The decrypted length of the package in bytes.
uint64_t routevn_package_length(const RouteVNPackage *package);

// Decrypts up to `length` bytes starting at `position` into `buffer`.
// Returns the number of bytes copied, 0 at the end of the package, or -1 on
// failure.
int64_t routevn_package_read(const RouteVNPackage *package, uint64_t position,
                             uint8_t *buffer, size_t length);

// Closes a package returned by routevn_package_open. NULL is ignored.
void routevn_package_close(RouteVNPackage *package);

#ifdef __cplusplus
}
#endif

#endif
