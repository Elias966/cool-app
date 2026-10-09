# Methods the web page calls through addJavascriptInterface.
-keepclassmembers class com.theking.prism.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
