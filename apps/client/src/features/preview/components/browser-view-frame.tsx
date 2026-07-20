import { Platform, View } from "react-native";
import WebView from "react-native-webview";

export function BrowserViewFrame({ url }: { readonly url: string }) {
  if (Platform.OS === "web") {
    return (
      <View className="flex-1 bg-black">
        <iframe
          allow="clipboard-read; clipboard-write"
          src={url}
          style={{ border: 0, height: "100%", width: "100%" }}
          title="VibePad Browser"
        />
      </View>
    );
  }

  return (
    <WebView
      allowsInlineMediaPlayback
      cacheEnabled
      domStorageEnabled
      incognito={false}
      javaScriptEnabled
      originWhitelist={["http://*", "https://*"]}
      setSupportMultipleWindows={false}
      sharedCookiesEnabled
      source={{ uri: url }}
      style={{ flex: 1 }}
      thirdPartyCookiesEnabled
    />
  );
}
