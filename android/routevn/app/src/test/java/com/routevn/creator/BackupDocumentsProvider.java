package com.routevn.creator;

import android.database.Cursor;
import android.database.MatrixCursor;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract.Document;
import android.provider.DocumentsProvider;
import java.io.File;
import java.io.FileNotFoundException;

/** File-backed SAF fixture. Failures are injected at real provider boundaries. */
public class BackupDocumentsProvider extends DocumentsProvider {
    static final String AUTHORITY = "com.android.externalstorage.documents";
    File root;
    String failRename;
    String failDelete;
    public boolean onCreate() { return true; }
    private File file(String id) { return id.equals("primary:Documents") ? root : new File(root, id.substring("primary:Documents/".length())); }
    private String id(File file) { return "primary:Documents" + file.getAbsolutePath().substring(root.getAbsolutePath().length()); }
    private MatrixCursor cursor(String[] projection) {
        return new MatrixCursor(projection == null ? new String[] {Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE, Document.COLUMN_SIZE, Document.COLUMN_FLAGS} : projection);
    }
    private void row(MatrixCursor cursor, File file) {
        MatrixCursor.RowBuilder row = cursor.newRow();
        for (String column : cursor.getColumnNames()) {
            switch (column) {
                case Document.COLUMN_DOCUMENT_ID: row.add(id(file)); break;
                case Document.COLUMN_DISPLAY_NAME: row.add(file.getName()); break;
                case Document.COLUMN_MIME_TYPE: row.add(file.isDirectory() ? Document.MIME_TYPE_DIR : "application/octet-stream"); break;
                case Document.COLUMN_SIZE: row.add(file.length()); break;
                case Document.COLUMN_LAST_MODIFIED: row.add(file.lastModified()); break;
                case Document.COLUMN_FLAGS: row.add(Document.FLAG_SUPPORTS_WRITE | Document.FLAG_SUPPORTS_RENAME | Document.FLAG_SUPPORTS_DELETE | Document.FLAG_DIR_SUPPORTS_CREATE); break;
                default: row.add(null);
            }
        }
    }
    public Cursor queryRoots(String[] projection) { return new MatrixCursor(new String[] {}); }
    public Cursor queryDocument(String id, String[] projection) throws FileNotFoundException {
        File file = file(id); if (!file.exists()) throw new FileNotFoundException(id);
        MatrixCursor cursor = cursor(projection); row(cursor, file); return cursor;
    }
    public Cursor queryChildDocuments(String id, String[] projection, String sortOrder) throws FileNotFoundException {
        File[] files = file(id).listFiles(); if (files == null) throw new FileNotFoundException(id);
        MatrixCursor cursor = cursor(projection); for (File file : files) row(cursor, file); return cursor;
    }
    public ParcelFileDescriptor openDocument(String id, String mode, CancellationSignal signal) throws FileNotFoundException {
        return ParcelFileDescriptor.open(file(id), ParcelFileDescriptor.parseMode(mode));
    }
    public String createDocument(String parent, String mime, String name) throws FileNotFoundException {
        File file = new File(file(parent), name);
        try {
            boolean created = Document.MIME_TYPE_DIR.equals(mime) ? file.mkdir() : file.createNewFile();
            if (!created) throw new FileNotFoundException(name);
            return id(file);
        } catch (java.io.IOException error) { throw new FileNotFoundException(error.toString()); }
    }
    public String renameDocument(String id, String name) throws FileNotFoundException {
        if (name.equals(failRename)) throw new FileNotFoundException("Injected rename interruption");
        File source = file(id); File target = new File(source.getParentFile(), name);
        if (target.exists() || !source.renameTo(target)) throw new FileNotFoundException(name);
        return id(target);
    }
    public void deleteDocument(String id) throws FileNotFoundException {
        if (file(id).getName().equals(failDelete)) throw new FileNotFoundException("Injected delete interruption");
        if (!file(id).delete()) throw new FileNotFoundException(id);
    }
    public boolean isChildDocument(String parent, String child) { return child.startsWith(parent + "/"); }
}
