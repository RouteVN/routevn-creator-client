package com.routevn.creator;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * Minimal JDK-only HTTP/1.1 server for download tests. Android unit tests
 * compile against the mockable android jar, which excludes
 * com.sun.net.httpserver, so this answers one request per connection over a
 * raw ServerSocket.
 */
final class TestHttpServer implements AutoCloseable {
    static final class Response {
        final int status;
        final byte[] body;
        /** Extra header lines such as "Location: /next". */
        final String[] headers;

        Response(int status, byte[] body, String... headers) {
            this.status = status;
            this.body = body;
            this.headers = headers;
        }

        static Response ok(byte[] body) {
            return new Response(200, body);
        }

        static Response redirect(String location) {
            return new Response(302, new byte[0], "Location: " + location);
        }
    }

    interface Handler {
        Response respond(String requestLine);
    }

    private final ServerSocket serverSocket;
    private volatile Handler handler = requestLine -> new Response(500, new byte[0]);

    TestHttpServer() throws IOException {
        serverSocket = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        Thread acceptThread = new Thread(this::acceptLoop);
        acceptThread.setDaemon(true);
        acceptThread.start();
    }

    void setHandler(Handler requestHandler) {
        handler = requestHandler;
    }

    int port() {
        return serverSocket.getLocalPort();
    }

    String url(String path) {
        return "http://127.0.0.1:" + port() + path;
    }

    private void acceptLoop() {
        while (!serverSocket.isClosed()) {
            try (Socket socket = serverSocket.accept()) {
                socket.setSoTimeout(5000);
                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(socket.getInputStream(), StandardCharsets.ISO_8859_1)
                );
                String requestLine = reader.readLine();
                // Read the rest of the request head so closing the socket does not reset it.
                String line = requestLine;
                while (line != null && !line.isEmpty()) {
                    line = reader.readLine();
                }
                Response response = handler.respond(requestLine);
                StringBuilder head = new StringBuilder("HTTP/1.1 " + response.status + " X\r\n")
                    .append("Content-Length: " + response.body.length + "\r\nConnection: close\r\n");
                for (String header : response.headers) {
                    head.append(header).append("\r\n");
                }
                OutputStream output = socket.getOutputStream();
                output.write(head.append("\r\n").toString().getBytes(StandardCharsets.ISO_8859_1));
                output.write(response.body);
                output.flush();
            } catch (IOException | RuntimeException error) {
                // close() ends the loop; a failed connection only fails its own test.
            }
        }
    }

    @Override
    public void close() {
        try {
            serverSocket.close();
        } catch (IOException ignored) {
            // Closing the socket is enough to stop the accept loop.
        }
    }
}
