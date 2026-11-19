# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ------------------------------------------------------------------
# Capacitor / Capacitor-community plugins (Android conversion).
# Keep the plugin classes and their JavaScript interface so the WebView
# can call into native code after R8 shrinking/obfuscation.
# ------------------------------------------------------------------
-keep class com.getcapacitor.** { *; }
-keep class com.getcapacitor.community.sqlite.** { *; }
-keep interface com.getcapacitor.** { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    public *;
}
-keep class com.capawesome.capacitor.filepicker.** { *; }

# Keep WebView-related classes used by Capacitor.
-keep class android.webkit.** { *; }

# Keep the MainActivity entry point.
-keep class com.mohit.finance.MainActivity { *; }
