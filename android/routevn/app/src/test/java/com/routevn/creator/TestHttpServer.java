package com.routevn.creator;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Minimal JDK-only HTTP/1.1 server for download tests. Android unit tests
 * compile against the mockable android jar, which excludes
 * com.sun.net.httpserver, so this speaks just enough HTTP over a raw
 * ServerSocket: one request per connection, then the socket closes.
 */
final class TestHttpServer implements AutoCloseable {
    static final class Response {
        final int status;
        final byte[] body;
        final Map<String, String> headers = new LinkedHashMap<>();
        long delayMs;

        static Response ok(byte[] body) {
            return status(200, body);
        }

        static Response status(int statusCode, byte[] body) {
            Response response = new Response(statusCode, body);
            return response;
        }

        static Response redirect(String location) {
            Response response = new Response(302, new byte[0]);
            response.headers.put("Location", location);
            return response;
        }

        Response delayed(long millis) {
            delayMs = millis;
            return this;
        }

        private Response(int statusCode, byte[] responseBody) {
            status = statusCode;
            body = responseBody == null ? new byte[0] : responseBody;
        }
    }

    interface Handler {
        Response respond(String requestLine);
    }

    private final ServerSocket serverSocket;
    private final AtomicReference<Handler> handler = new AtomicReference<>();
    private volatile boolean closed;

    TestHttpServer() throws IOException {
        serverSocket = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        Thread acceptThread = new Thread(this::acceptLoop);
        acceptThread.setDaemon(true);
        acceptThread.start();
    }

    void setHandler(Handler requestHandler) {
        handler.set(requestHandler);
    }

    int port() {
        return serverSocket.getLocalPort();
    }

    String url(String path) {
        return "http://127.0.0.1:" + port() + path;
    }

    private void acceptLoop() {
        while (!closed) {
            try (Socket socket = serverSocket.accept()) {
                handleConnection(socket);
            } catch (IOException error) {
                if (closed) {
                    return;
                }
            }
        }
    }

    private void handleConnection(Socket socket) throws IOException {
        socket.setSoTimeout(5000);
        String requestLine = readRequestLine(socket.getInputStream());
        Handler requestHandler = handler.get();
        Response response = requestHandler == null
            ? Response.status(500, new byte[0])
            : requestHandler.respond(requestLine);
        if (response.delayMs > 0) {
            try {
                Thread.sleep(response.delayMs);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
        }
        writeResponse(socket.getOutputStream(), response);
    }

    private static String readRequestLine(InputStream input) throws IOException {
        ByteArrayOutputStream head = new ByteArrayOutputStream();
        byte[] buffer = new byte[1024];
        while (head.size() < 64 * 1024) {
            int read = input.read(buffer);
            if (read < 0) {
                break;
            }
            head.write(buffer, 0, read);
            String text = new String(head.toByteArray(), StandardCharsets.ISO_8859_1);
            if (text.contains("\r\n\r\n")) {
                return text.substring(0, text.indexOf('\r'));
            }
        }
        return new String(head.toByteArray(), StandardCharsets.ISO_8859_1);
    }

    private static void writeResponse(OutputStream output, Response response)
        throws IOException {
        ByteArrayOutputStream raw = new ByteArrayOutputStream();
        raw.write(
            ("HTTP/1.1 " + response.status + " X\r\nContent-Length: " +
            response.body.length + "\r\nConnection: close\r\n")
                .getBytes(StandardCharsets.ISO_8859_1)
        );
        for (Map.Entry<String, String> header : response.headers.entrySet()) {
            raw.write(
                (header.getKey() + ": " + header.getValue() + "\r\n")
                    .getBytes(StandardCharsets.ISO_8859_1)
            );
        }
        raw.write("\r\n".getBytes(StandardCharsets.ISO_8859_1));
        raw.write(response.body);
        output.write(raw.toByteArray());
        output.flush();
    }

    @Override
    public void close() {
        closed = true;
        try {
            serverSocket.close();
        } catch (IOException ignored) {
            // Closing the socket is enough to stop the accept loop.
        }
    }
}
