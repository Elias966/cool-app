package com.theking.prism;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Base64;
import android.util.Log;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.SystemBarStyle;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Prism for Android: the desktop app's web UI (src/, copied into assets/www by
 * scripts/android.js) in a full-screen WebView.
 *
 * Pages are served from https://appassets.androidplatform.net/ (a secure
 * origin, so Cache Storage, workers and the clipboard work) with cross-origin
 * isolation headers, which let the local AI use several CPU threads.
 */
public class MainActivity extends ComponentActivity {
    private static final String TAG = "Prism";
    static final String HOST = "appassets.androidplatform.net";
    static final String HOME = "https://" + HOST + "/index.html";

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("webp", "image/webp");
        MIME.put("gif", "image/gif");
        MIME.put("woff2", "font/woff2");
        MIME.put("woff", "font/woff");
        MIME.put("ttf", "font/ttf");
        MIME.put("wasm", "application/wasm");
        MIME.put("wav", "audio/wav");
        MIME.put("mp3", "audio/mpeg");
        MIME.put("ogg", "audio/ogg");
        MIME.put("glb", "model/gltf-binary");
        MIME.put("txt", "text/plain");
    }

    private FrameLayout root;
    private WebView web;
    /** System bar sizes in CSS pixels: top, right, bottom, left. */
    private final int[] safe = new int[4];

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Draw under the status and navigation bars (the 3D background fills
        // the whole screen); the page keeps its controls clear of them.
        EdgeToEdge.enable(this, SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT));
        super.onCreate(savedInstanceState);

        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF05060A);
        setContentView(root);
        createWebView();

        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            // The keyboard shrinks the WebView, so the focused field scrolls into
            // view; the bars stay under the page and are reported as safe areas.
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) web.getLayoutParams();
            if (lp.bottomMargin != ime.bottom) {
                lp.bottomMargin = ime.bottom;
                web.setLayoutParams(lp);
            }
            float d = getResources().getDisplayMetrics().density;
            safe[0] = Math.round(bars.top / d);
            safe[1] = Math.round(bars.right / d);
            safe[2] = ime.bottom > 0 ? 0 : Math.round(bars.bottom / d);
            safe[3] = Math.round(bars.left / d);
            pushInsets();
            return WindowInsetsCompat.CONSUMED;
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // The page decides first: close a panel, or go back to the home screen.
                web.evaluateJavascript("window.prismBack ? window.prismBack() : false", result -> {
                    if (!"true".equals(result)) {
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                });
            }
        });

        String url = savedInstanceState != null ? savedInstanceState.getString("url") : null;
        web.loadUrl(url != null && url.startsWith("https://" + HOST + "/") ? url : HOME);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView() {
        web = new WebView(this);
        web.setBackgroundColor(0xFF05060A);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setHapticFeedbackEnabled(true);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // Sound effects play with the intros, before the first tap.
        s.setMediaPlaybackRequiresUserGesture(false);
        // The layout is designed in CSS pixels; the system font size would break it.
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " Prism/" + BuildConfig.VERSION_NAME);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                if (m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    Log.e(TAG, m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                }
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!HOST.equals(uri.getHost())) return null; // Hugging Face downloads go to the network
                return serveAsset(uri.getPath());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;
                openExternal(uri.toString()); // links open in the browser, not inside the app
                return true;
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // The page's process died (usually out of memory, e.g. the AI on
                // a small phone): start a fresh WebView instead of crashing.
                Log.w(TAG, "WebView renderer gone, crashed=" + detail.didCrash());
                root.removeView(web);
                web.destroy();
                createWebView();
                ViewCompat.requestApplyInsets(root);
                web.loadUrl(HOME);
                Toast.makeText(MainActivity.this, "Prism ran low on memory and restarted the page", Toast.LENGTH_LONG).show();
                return true;
            }
        });
    }

    /** Files from assets/www, with the headers that make the page cross-origin isolated. */
    private WebResourceResponse serveAsset(String path) {
        if (path == null || path.equals("/")) path = "/index.html";
        if (path.contains("..")) return error(403, "Forbidden");
        String name = path.substring(1);
        String ext = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        try {
            InputStream in = getAssets().open("www/" + name);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cross-Origin-Opener-Policy", "same-origin");
            headers.put("Cross-Origin-Embedder-Policy", "require-corp");
            headers.put("Cross-Origin-Resource-Policy", "same-origin");
            headers.put("Cache-Control", "no-cache");
            boolean text = mime.startsWith("text/") || mime.equals("application/json") || mime.equals("image/svg+xml");
            return new WebResourceResponse(mime, text ? "utf-8" : null, 200, "OK", headers, in);
        } catch (IOException e) {
            return error(404, "Not Found");
        }
    }

    private static WebResourceResponse error(int code, String reason) {
        return new WebResourceResponse("text/plain", "utf-8", code, reason, new HashMap<>(), null);
    }

    private void pushInsets() {
        if (web == null) return;
        web.evaluateJavascript(String.format(Locale.ROOT, "window.prismInsets && prismInsets(%d,%d,%d,%d)", safe[0], safe[1], safe[2], safe[3]), null);
    }

    private void openExternal(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            if (url.startsWith("market://")) {
                openExternal("https://play.google.com/store/apps/" + url.substring("market://".length()));
            } else {
                Toast.makeText(this, R.string.no_app, Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null && web.getUrl() != null) outState.putString("url", web.getUrl());
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** What the page can ask of Android (window.AndroidBridge; see web/bridge.js). */
    final class Bridge {
        @JavascriptInterface
        public String insets() {
            return String.format(Locale.ROOT, "{\"top\":%d,\"right\":%d,\"bottom\":%d,\"left\":%d}", safe[0], safe[1], safe[2], safe[3]);
        }

        @JavascriptInterface
        public String appVersion() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public boolean copyText(String text) {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("Prism", text));
                return true;
            } catch (RuntimeException e) {
                Log.w(TAG, "copy failed", e);
                return false;
            }
        }

        /** Writes the file to the app cache and opens the share sheet for it. */
        @JavascriptInterface
        public boolean shareFile(String name, String mime, String base64, String title) {
            try {
                String safeName = name.replaceAll("[^\\w.\\-]+", "_");
                if (safeName.isEmpty() || safeName.startsWith(".")) safeName = "prism-file" + safeName;
                File dir = new File(getCacheDir(), "shared");
                if (!dir.isDirectory() && !dir.mkdirs()) return false;
                File file = new File(dir, safeName);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(Base64.decode(base64, Base64.DEFAULT));
                }
                Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", file);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime);
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.setClipData(ClipData.newRawUri(safeName, uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, title == null || title.isEmpty() ? getString(R.string.share_title) : title);
                runOnUiThread(() -> startActivity(chooser));
                return true;
            } catch (IOException | IllegalArgumentException e) {
                Log.w(TAG, "share failed", e);
                return false;
            }
        }

        @JavascriptInterface
        public void openUrl(String url) {
            runOnUiThread(() -> openExternal(url));
        }

        /** Short buzzes through the system haptics (they follow the phone's touch-feedback setting). */
        @JavascriptInterface
        public void haptic(String kind) {
            runOnUiThread(() -> {
                if (web == null) return;
                int effect;
                switch (kind) {
                    case "error":
                        if (Build.VERSION.SDK_INT >= 30) effect = HapticFeedbackConstants.REJECT;
                        else {
                            pattern(new long[] {0, 18, 60, 18});
                            return;
                        }
                        break;
                    case "success":
                        effect = Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.VIRTUAL_KEY;
                        break;
                    case "heavy":
                        effect = HapticFeedbackConstants.LONG_PRESS;
                        break;
                    case "press":
                        effect = HapticFeedbackConstants.VIRTUAL_KEY;
                        break;
                    default:
                        effect = Build.VERSION.SDK_INT >= 27 ? HapticFeedbackConstants.KEYBOARD_PRESS : HapticFeedbackConstants.KEYBOARD_TAP;
                }
                web.performHapticFeedback(effect);
            });
        }

        private void pattern(long[] timings) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(timings, -1));
            else v.vibrate(timings, -1);
        }
    }
}
