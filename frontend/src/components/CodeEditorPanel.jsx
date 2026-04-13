import Editor from "@monaco-editor/react";
import { Loader2Icon, PlayIcon } from "lucide-react";
import { LANGUAGE_CONFIG } from "../data/problems";
import { useEffect, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";

// Helper to generate consistent colors based on string (e.g. user ID)
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return "#" + "00000".substring(0, 6 - c.length) + c;
}

function CodeEditorPanel({
  sessionId,
  selectedLanguage,
  code,
  isRunning,
  onLanguageChange,
  onCodeChange,
  onRunCode,
}) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [editor, setEditor] = useState(null);

  const providerRef = useRef(null);
  const bindingRef = useRef(null);
  const docRef = useRef(null);

  const handleEditorMount = (editor) => {
    setEditor(editor);
  };

  useEffect(() => {
    if (!editor || !sessionId) return;

    let isMounted = true;
    docRef.current = new Y.Doc();

    const connectYjs = async () => {
      try {
        const token = await getToken();
        if (!isMounted) return;

        const apiUrl = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.host}`;
        const wsUrl = apiUrl.replace(/^http/, "ws");

        providerRef.current = new WebsocketProvider(
          `${wsUrl}/api/collaboration`,
          sessionId,
          docRef.current,
          { params: { token } }
        );

        // SYNC FIX (Interview Detail):
        // By creating a specific Yjs text type for each language, we ensure that if a user switches 
        // to Python, they don't overwrite the shared Javascript buffer. Each language maintains its own state.
        const type = docRef.current.getText(selectedLanguage);

        bindingRef.current = new MonacoBinding(
          type,
          editor.getModel(),
          new Set([editor]),
          providerRef.current.awareness
        );

        providerRef.current.awareness.setLocalStateField("user", {
          name: user?.fullName || user?.firstName || "Guest",
          color: stringToColor(user?.id || "default"),
        });
      } catch (error) {
        console.error("Yjs Connection Error:", error);
      }
    };

    connectYjs();

    return () => {
      isMounted = false;
      if (bindingRef.current) bindingRef.current.destroy();
      if (providerRef.current) providerRef.current.disconnect();
      if (docRef.current) docRef.current.destroy();
    };
  }, [editor, sessionId, selectedLanguage, getToken, user]);

  return (
    <div className="h-full bg-base-300 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-base-100 border-t border-base-300">
        <div className="flex items-center gap-3">
          <img
            src={LANGUAGE_CONFIG[selectedLanguage]?.icon}
            alt={LANGUAGE_CONFIG[selectedLanguage]?.name}
            className="size-6"
          />
          <select className="select select-sm" value={selectedLanguage} onChange={onLanguageChange}>
            {Object.entries(LANGUAGE_CONFIG).map(([key, lang]) => (
              <option key={key} value={key}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        <button className="btn btn-primary btn-sm gap-2" disabled={isRunning} onClick={onRunCode}>
          {isRunning ? (
            <>
              <Loader2Icon className="size-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <PlayIcon className="size-4" />
              Run Code
            </>
          )}
        </button>
      </div>

      <div className="flex-1">
        <Editor
          height={"100%"}
          language={LANGUAGE_CONFIG[selectedLanguage]?.monacoLang}
          value={code}
          onChange={onCodeChange}
          onMount={handleEditorMount}
          theme="vs-dark"
          options={{
            fontSize: 16,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            minimap: { enabled: false },
          }}
        />
      </div>
    </div>
  );
}

export default CodeEditorPanel;
