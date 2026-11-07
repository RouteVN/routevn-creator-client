package vn.routevn.androidplayer;

/**
 * Strict RFC 8259 syntax check. Android's bundled SQLite has no json_valid()
 * before API 34, so the runtime database validates values here instead of in
 * a CHECK constraint.
 */
final class JsonSyntax {
    private static final int MAX_DEPTH = 512;

    private final String text;
    private int position;

    private JsonSyntax(String text) {
        this.text = text;
    }

    static boolean isValid(String text) {
        if (text == null) return false;
        JsonSyntax parser = new JsonSyntax(text);
        parser.skipWhitespace();
        if (!parser.value(0)) return false;
        parser.skipWhitespace();
        return parser.position == text.length();
    }

    private boolean value(int depth) {
        if (position >= text.length() || depth > MAX_DEPTH) return false;
        char c = text.charAt(position);
        switch (c) {
            case '{': return object(depth + 1);
            case '[': return array(depth + 1);
            case '"': return string();
            case 't': return literal("true");
            case 'f': return literal("false");
            case 'n': return literal("null");
            default: return c == '-' || (c >= '0' && c <= '9') ? number() : false;
        }
    }

    private boolean object(int depth) {
        position++;
        skipWhitespace();
        if (peek('}')) {
            position++;
            return true;
        }
        while (true) {
            skipWhitespace();
            if (!peek('"') || !string()) return false;
            skipWhitespace();
            if (!peek(':')) return false;
            position++;
            skipWhitespace();
            if (!value(depth)) return false;
            skipWhitespace();
            if (peek('}')) {
                position++;
                return true;
            }
            if (!peek(',')) return false;
            position++;
        }
    }

    private boolean array(int depth) {
        position++;
        skipWhitespace();
        if (peek(']')) {
            position++;
            return true;
        }
        while (true) {
            skipWhitespace();
            if (!value(depth)) return false;
            skipWhitespace();
            if (peek(']')) {
                position++;
                return true;
            }
            if (!peek(',')) return false;
            position++;
        }
    }

    private boolean string() {
        position++;
        while (position < text.length()) {
            char c = text.charAt(position++);
            if (c == '"') return true;
            if (c < 0x20) return false;
            if (c == '\\') {
                if (position >= text.length()) return false;
                char escape = text.charAt(position++);
                if (escape == 'u') {
                    for (int index = 0; index < 4; index++) {
                        if (position >= text.length() || Character.digit(text.charAt(position++), 16) < 0) {
                            return false;
                        }
                    }
                } else if ("\"\\/bfnrt".indexOf(escape) < 0) {
                    return false;
                }
            }
        }
        return false;
    }

    private boolean number() {
        if (peek('-')) position++;
        if (peek('0')) {
            position++;
        } else if (!digits()) {
            return false;
        }
        if (peek('.')) {
            position++;
            if (!digits()) return false;
        }
        if (peek('e') || peek('E')) {
            position++;
            if (peek('+') || peek('-')) position++;
            if (!digits()) return false;
        }
        return true;
    }

    private boolean digits() {
        int start = position;
        while (position < text.length() && text.charAt(position) >= '0' && text.charAt(position) <= '9') {
            position++;
        }
        return position > start;
    }

    private boolean literal(String expected) {
        if (!text.startsWith(expected, position)) return false;
        position += expected.length();
        return true;
    }

    private boolean peek(char expected) {
        return position < text.length() && text.charAt(position) == expected;
    }

    private void skipWhitespace() {
        while (position < text.length()) {
            char c = text.charAt(position);
            if (c != ' ' && c != '\t' && c != '\n' && c != '\r') return;
            position++;
        }
    }
}
