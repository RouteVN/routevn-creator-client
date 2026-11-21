package vn.routevn.androidplayer;

import java.io.IOException;

final class NativePackage {
    static {
        System.loadLibrary("routevn_player");
    }

    static native long open(String path, long offset, long length) throws IOException;
    static native long plaintextLength(long handle);
    static native int read(long handle, long position, byte[] buffer, int bufferOffset, int length)
            throws IOException;
    static native void close(long handle);

    private NativePackage() {}
}
