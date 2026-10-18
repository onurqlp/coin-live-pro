package com.uzayx.terminal;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    // One stable address: web deployments update the app without shipping another APK.
    private static final String HOME = "https://onurqlp.github.io/coin-live-pro/uzayx/";
    private static final String ALLOWED_HOST = "onurqlp.github.io";
    private static final String ALLOWED_PATH = "/coin-live-pro/";

    private WebView webView;
    private FrameLayout offline;
    private ProgressBar progress;
    private android.webkit.ValueCallback<Uri[]> uploadCallback;
    private static final int FILE_PICKER_REQUEST = 503;
    private boolean pageHasError = false;
    private long backgroundAt = 0L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(8, 15, 28));
        getWindow().setNavigationBarColor(Color.rgb(8, 15, 28));

        FrameLayout screen = new FrameLayout(this);
        screen.setBackgroundColor(Color.rgb(8, 15, 28));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(8, 15, 28));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); // Required for charts and live dashboard.
        settings.setDomStorageEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(true);
        settings.setMediaPlaybackRequiresUserGesture(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                pageHasError = false;
                progress.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                if (!pageHasError) offline.setVisibility(View.GONE);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isInsideApp(uri)) return false;
                if (request.isForMainFrame()) launchExternal(uri);
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showOffline();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                if (newProgress == 100) progress.setVisibility(View.GONE);
            }
            @Override public boolean onShowFileChooser(WebView view,
                    android.webkit.ValueCallback<Uri[]> callback, FileChooserParams parameters) {
                if (uploadCallback != null) uploadCallback.onReceiveValue(null);
                uploadCallback = callback;
                try {
                    Intent picker = parameters.createIntent();
                    startActivityForResult(picker, FILE_PICKER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException error) {
                    uploadCallback = null;
                    callback.onReceiveValue(null);
                    return true;
                }
            }
            @Override public boolean onCreateWindow(WebView view, boolean isDialog,
                    boolean isUserGesture, Message resultMsg) {
                if (!isUserGesture) return false;
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView popupView,
                            WebResourceRequest request) {
                        launchExternal(request.getUrl());
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                launchExternal(Uri.parse(url)));

        screen.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        offline = buildOffline();
        offline.setVisibility(View.GONE);
        screen.addView(offline, new FrameLayout.LayoutParams(-1, -1));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setIndeterminate(false);
        progress.getProgressDrawable().setColorFilter(0xFF0BA4AF,
                android.graphics.PorterDuff.Mode.SRC_IN);
        FrameLayout.LayoutParams barParams = new FrameLayout.LayoutParams(
                -1, Math.max(2, (int) (getResources().getDisplayMetrics().density * 3)), Gravity.TOP);
        screen.addView(progress, barParams);

        setContentView(screen);
        webView.loadUrl(HOME);
    }

    private boolean isInsideApp(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme())
                && ALLOWED_HOST.equalsIgnoreCase(uri.getHost())
                && uri.getPath() != null
                && uri.getPath().startsWith(ALLOWED_PATH);
    }

    private void launchExternal(Uri uri) {
        if (uri == null || uri.getScheme() == null) return;
        String scheme = uri.getScheme().toLowerCase(java.util.Locale.ROOT);
        if (!("https".equals(scheme) || "http".equals(scheme)
                || "mailto".equals(scheme) || "tel".equals(scheme))) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, "Bağlantı açılamadı", Toast.LENGTH_SHORT).show();
        }
    }

    private FrameLayout buildOffline() {
        FrameLayout holder = new FrameLayout(this);
        holder.setBackgroundColor(0xFF080F1C);
        LinearLayout message = new LinearLayout(this);
        message.setOrientation(LinearLayout.VERTICAL);
        message.setGravity(Gravity.CENTER);
        int pad = (int) (getResources().getDisplayMetrics().density * 24);
        message.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText(R.string.offline_title);
        title.setTextColor(Color.WHITE);
        title.setTextSize(23);
        title.setGravity(Gravity.CENTER);
        message.addView(title);

        TextView detail = new TextView(this);
        detail.setText(R.string.offline_description);
        detail.setTextColor(0xFFAAC0D0);
        detail.setTextSize(14);
        detail.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(-1, -2);
        textParams.topMargin = pad / 2;
        message.addView(detail, textParams);

        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setOnClickListener(v -> {
            offline.setVisibility(View.GONE);
            webView.loadUrl(HOME);
        });
        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(-2, -2);
        btnParams.topMargin = pad;
        message.addView(retry, btnParams);

        holder.addView(message, new FrameLayout.LayoutParams(-1, -1));
        return holder;
    }

    private void showOffline() {
        pageHasError = true;
        progress.setVisibility(View.GONE);
        offline.setVisibility(View.VISIBLE);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_PICKER_REQUEST && uploadCallback != null) {
            uploadCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            uploadCallback = null;
        }
    }

    @Override protected void onPause() {
        backgroundAt = SystemClock.elapsedRealtime();
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        // On return from a long background session, reload server-hosted HTML/data.
        if (backgroundAt > 0L && SystemClock.elapsedRealtime() - backgroundAt > 180_000L
                && webView != null) webView.reload();
        backgroundAt = 0L;
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (uploadCallback != null) {
            uploadCallback.onReceiveValue(null);
            uploadCallback = null;
        }
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
