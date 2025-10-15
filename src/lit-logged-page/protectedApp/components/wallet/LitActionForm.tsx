/**
 * LitActionForm Component
 *
 * Form for executing Lit Actions with custom JavaScript code
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Editor from "@monaco-editor/react";
import { useLitAuth } from "../../../../lit-login-modal/LitAuthProvider";
import { UIPKP } from "../../types";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { triggerLedgerRefresh } from "../../utils/ledgerRefresh";
import {
  getDefaultLitActionExample,
  getLitActionExample,
  litActionExamples,
} from "../../../../lit-action-examples";
import litActionsDefinitions from "../../../../lit-actions.d.ts?raw";

// UI constants
const EDITOR_FONT_SIZE_COMPACT = 10;
const EDITOR_FONT_SIZE_FULLSCREEN = 14;
const EDITOR_LINE_HEIGHT = 20;
const FULLSCREEN_Z_INDEX = 9999;

const formatJsParams = (value?: Record<string, unknown>) => {
  if (!value || Object.keys(value).length === 0) {
    return "{}";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
};

const DEFAULT_EXAMPLE = getDefaultLitActionExample();
const DEFAULT_EXAMPLE_ID = DEFAULT_EXAMPLE?.id ?? null;
const DEFAULT_EXAMPLE_CODE = DEFAULT_EXAMPLE?.code ?? "";
const DEFAULT_JS_PARAMS_INPUT = formatJsParams(DEFAULT_EXAMPLE?.jsParams);
const CUSTOM_SHARE_EXAMPLE_ID = "custom-share";
const CUSTOM_LOCAL_PREFIX = "custom-local";
const LOCAL_STORAGE_KEY = "litExplorer.customExamples.v1";
const BLANK_EXAMPLE_ID = "blank";

const LIT_ACTION_TYPES_URI = "ts:lit-actions.d.ts";

const encodeForShare = (value: string) => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return encodeURIComponent(btoa(binary));
};

const decodeFromShare = (value: string) => {
  const binary = atob(decodeURIComponent(value));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
};

interface LitActionFormProps {
  selectedPkp: UIPKP | null;
  disabled?: boolean;
}

interface LitActionResult {
  result: any;
  timestamp: string;
}

export const LitActionForm: React.FC<LitActionFormProps> = ({
  selectedPkp,
  disabled = false,
}) => {
  const { user, services } = useLitAuth();
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(
    DEFAULT_EXAMPLE_ID
  );
  const [litActionCode, setLitActionCode] =
    useState<string>(DEFAULT_EXAMPLE_CODE);
  const [jsParamsInput, setJsParamsInput] = useState<string>(
    DEFAULT_JS_PARAMS_INPUT
  );
  const [jsParamsError, setJsParamsError] = useState<string | null>(null);
  const [litActionResult, setLitActionResult] =
    useState<LitActionResult | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasSharedLink, setHasSharedLink] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [localExamples, setLocalExamples] = useState<
    { id: string; title: string; code: string; params: string }[]
  >([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const editorRef = useRef<any>(null);
  const paramsEditorRef = useRef<any>(null);
  const triggerExecuteRef = useRef<() => void>(() => {});
  const monacoConfiguredRef = useRef(false);
  const litTypesDisposablesRef = useRef<any[]>([]);
  const litTypesModelRef = useRef<any>(null);
  const [showShortcutTip, setShowShortcutTip] = useState(false);
  const [showParsedModal, setShowParsedModal] = useState(false);

  const selectedExample = useMemo(() => {
    if (selectedExampleId === BLANK_EXAMPLE_ID) {
      return {
        id: BLANK_EXAMPLE_ID,
        title: "New Blank Action",
        description: "Start from scratch with an empty editor.",
        code: litActionCode,
      };
    }
    const localExample = localExamples.find(
      (example) => example.id === selectedExampleId
    );
    if (localExample) {
      return {
        id: localExample.id,
        title: localExample.title,
        description: "Custom action saved locally.",
        code: localExample.code,
        jsParams: (() => {
          try {
            return JSON.parse(localExample.params);
          } catch {
            return undefined;
          }
        })(),
      };
    }
    if (selectedExampleId === CUSTOM_SHARE_EXAMPLE_ID) {
      return {
        id: CUSTOM_SHARE_EXAMPLE_ID,
        title: "Shared Code",
        description: "Loaded from shared URL parameters.",
        code: litActionCode,
        jsParams: (() => {
          try {
            return JSON.parse(jsParamsInput);
          } catch {
            return undefined;
          }
        })(),
      };
    }
    return selectedExampleId
      ? getLitActionExample(selectedExampleId)
      : undefined;
  }, [jsParamsInput, litActionCode, selectedExampleId, localExamples]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as {
          id: string;
          title: string;
          code: string;
          params: string;
        }[];
        setLocalExamples(parsed);
      }
    } catch (error) {
      console.error("Failed to load local Lit Action examples", error);
    }

    try {
      const params = new URLSearchParams(window.location.search);
      const encodedCode = params.get("code");
      const encodedParams = params.get("params");
      if (encodedCode || encodedParams) {
        if (encodedCode) {
          const decodedCode = decodeFromShare(encodedCode);
          setLitActionCode(decodedCode);
        }
        if (encodedParams) {
          const decodedParams = decodeFromShare(encodedParams);
          setJsParamsInput(decodedParams);
        }
        setSelectedExampleId(CUSTOM_SHARE_EXAMPLE_ID);
        setHasSharedLink(true);
      }
    } catch (error) {
      console.error("Failed to decode shared Lit Action state", error);
    }
  }, []);

  const parsedResponse = useMemo(() => {
    const rawResponse = litActionResult?.result?.response;
    if (!rawResponse) return null;
    if (typeof rawResponse === "object") {
      return rawResponse as Record<string, unknown>;
    }
    if (typeof rawResponse === "string") {
      try {
        const parsed = JSON.parse(rawResponse);
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
    return null;
  }, [litActionResult]);

  const rawResultString = useMemo(() => {
    if (!litActionResult?.result) return "";
    try {
      return JSON.stringify(litActionResult.result, null, 2);
    } catch {
      return String(litActionResult.result);
    }
  }, [litActionResult]);

  const saveLocalExample = useCallback(() => {
    const baseTitle = "Custom Action";
    let suffix = 1;
    let title = baseTitle;
    const existingTitles = new Set(localExamples.map((ex) => ex.title));
    while (existingTitles.has(title)) {
      suffix += 1;
      title = `${baseTitle} ${suffix}`;
    }

    const id = `${CUSTOM_LOCAL_PREFIX}-${Date.now()}`;
    const record = {
      id,
      title,
      code: litActionCode,
      params: jsParamsInput,
    };
    const nextExamples = [record, ...localExamples];
    setLocalExamples(nextExamples);
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextExamples));
    setSelectedExampleId(id);
    setStatus(`Saved ${title}`);
  }, [jsParamsInput, litActionCode, localExamples]);

  const deleteLocalExample = useCallback(() => {
    if (!selectedExampleId?.startsWith(CUSTOM_LOCAL_PREFIX)) return;
    const nextExamples = localExamples.filter(
      (example) => example.id !== selectedExampleId
    );
    setLocalExamples(nextExamples);
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextExamples));
    setSelectedExampleId(nextExamples[0]?.id ?? DEFAULT_EXAMPLE_ID);
    setStatus("Removed local Lit Action");
  }, [localExamples, selectedExampleId]);

  const createBlankExample = useCallback(() => {
    setLitActionCode("");
    setJsParamsInput("{}");
    setJsParamsError(null);
    setSelectedExampleId(BLANK_EXAMPLE_ID);
    setStatus("Ready for new Lit Action");
    setShowParsedModal(false);
  }, []);

  const tryParseJson = useCallback(
    (text: string): Record<string, unknown> | unknown[] | null => {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, unknown> | unknown[];
        }
        return null;
      } catch {
        return null;
      }
    },
    []
  );

  const copyToClipboard = useCallback(
    async (pathKey: string, value: string) => {
      try {
        if (
          typeof navigator !== "undefined" &&
          navigator?.clipboard?.writeText
        ) {
          await navigator.clipboard.writeText(value);
        } else if (typeof document !== "undefined") {
          const textarea = document.createElement("textarea");
          textarea.value = value;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        } else {
          return;
        }
        setCopiedField(pathKey);
      } catch (error) {
        console.error("Failed to copy field", error);
      }
    },
    []
  );

  const executeButtonDisabled =
    disabled || isExecutingAction || !litActionCode.trim();
  const executeButtonContent = isExecutingAction ? (
    <>
      <LoadingSpinner size={16} />
      Executing...
    </>
  ) : (
    "Execute Lit Action"
  );

  const toggleFullscreen = () => setIsFullscreen((v) => !v);

  const handleEditorMount = useCallback(
    (editor: any, monaco: any) => {
      editorRef.current = editor;
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
        triggerExecuteRef.current()
      );

      if (!monacoConfiguredRef.current) {
        const compilerOptions = {
          allowJs: true,
          checkJs: true,
          allowNonTsExtensions: true,
          module: monaco.languages.typescript.ModuleKind.ESNext,
          moduleResolution:
            monaco.languages.typescript.ModuleResolutionKind.NodeJs,
          target: monaco.languages.typescript.ScriptTarget.ESNext,
          typeRoots: ["node_modules/@types"],
        };

        monaco.languages.typescript.javascriptDefaults.setCompilerOptions(
          compilerOptions
        );
        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: false,
          noSyntaxValidation: false,
        });
        monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);

        monaco.languages.typescript.typescriptDefaults.setCompilerOptions(
          compilerOptions
        );
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: false,
          noSyntaxValidation: false,
        });

        monacoConfiguredRef.current = true;
      }

      if (litTypesDisposablesRef.current.length === 0) {
        const modelUri = monaco.Uri.parse(LIT_ACTION_TYPES_URI);

        litTypesDisposablesRef.current = [
          monaco.languages.typescript.javascriptDefaults.addExtraLib(
            litActionsDefinitions,
            LIT_ACTION_TYPES_URI
          ),
          monaco.languages.typescript.typescriptDefaults.addExtraLib(
            litActionsDefinitions,
            LIT_ACTION_TYPES_URI
          ),
        ];

        if (!monaco.editor.getModel(modelUri)) {
          litTypesModelRef.current = monaco.editor.createModel(
            litActionsDefinitions,
            "typescript",
            modelUri
          );
        } else if (!litTypesModelRef.current) {
          litTypesModelRef.current = monaco.editor.getModel(modelUri);
        }
      }
    },
    [litActionsDefinitions]
  );

  const handleParamsEditorMount = useCallback((editor: any, monaco: any) => {
    paramsEditorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
      triggerExecuteRef.current()
    );
  }, []);

  const renderCodeEditor = (
    editorHeight: string | number,
    fullscreen: boolean
  ) => (
    <Editor
      value={litActionCode}
      onChange={(value) => setLitActionCode(value || "")}
      language="javascript"
      theme="vs-dark"
      onMount={handleEditorMount}
      options={{
        minimap: { enabled: false },
        wordWrap: "on",
        fontSize: fullscreen
          ? EDITOR_FONT_SIZE_FULLSCREEN
          : EDITOR_FONT_SIZE_COMPACT,
        lineHeight: EDITOR_LINE_HEIGHT,
        padding: { top: 12, bottom: 12 },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        lineNumbers: "on",
        folding: false,
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 3,
        readOnly: disabled || isExecutingAction,
      }}
      height={editorHeight}
      width="100%"
    />
  );

  const renderParamsContent = (
    editorHeight: string | number,
    fullscreen: boolean
  ) => {
    const helperTextColor = fullscreen ? "#e5e7eb" : "#6b7280";
    const errorStyles = fullscreen
      ? {
          backgroundColor: "rgba(252, 165, 165, 0.15)",
          border: "1px solid rgba(252, 165, 165, 0.4)",
          color: "#fecaca",
        }
      : {
          backgroundColor: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#b91c1c",
        };

    return (
      <>
        <Editor
          value={jsParamsInput}
          onChange={(value) => {
            setJsParamsInput(value ?? "");
            setJsParamsError(null);
          }}
          language="json"
          theme={fullscreen ? "vs-dark" : "vs-light"}
          onMount={handleParamsEditorMount}
          options={{
            minimap: { enabled: false },
            wordWrap: "off",
            fontSize: fullscreen
              ? EDITOR_FONT_SIZE_FULLSCREEN
              : EDITOR_FONT_SIZE_COMPACT,
            lineHeight: EDITOR_LINE_HEIGHT,
            padding: { top: 12, bottom: 12 },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            lineNumbers: "on",
            folding: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 2,
            readOnly: disabled || isExecutingAction,
          }}
          height={editorHeight}
          width="100%"
        />
        <div
          style={{
            marginTop: "8px",
            fontSize: "11px",
            color: helperTextColor,
          }}
        >
          publicKey is injected automatically before execution based on the
          selected PKP.
        </div>
        {jsParamsError && (
          <div
            style={{
              marginTop: "8px",
              padding: "8px 12px",
              borderRadius: "6px",
              fontSize: "11px",
              ...errorStyles,
            }}
          >
            {jsParamsError}
          </div>
        )}
      </>
    );
  };

  const renderCompactLayout = () => {
    const codeEditorHeight = "260px";
    const paramsEditorHeight = "260px";

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)",
          gap: "16px",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            padding: "12px",
            backgroundColor: "#ffffff",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <h4
            style={{
              margin: 0,
              fontSize: "13px",
              fontWeight: 600,
              color: "#111827",
              letterSpacing: "0.04em",
            }}
          >
            Code
          </h4>
          {renderCodeEditor(codeEditorHeight, false)}
        </div>
        <div
          style={{
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            padding: "12px",
            backgroundColor: "#ffffff",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <h4
            style={{
              margin: 0,
              fontSize: "13px",
              fontWeight: 600,
              color: "#111827",
              letterSpacing: "0.04em",
            }}
          >
            JS Params
          </h4>
          {renderParamsContent(paramsEditorHeight, false)}
        </div>
      </div>
    );
  };

  const renderFullscreenLayout = () => {
    const codeEditorHeight = "calc(100vh - 240px)";
    const paramsEditorHeight = "25vh";
    const fullPanelStyle = {
      border: "1px solid #1f2937",
      background: "#0f172a",
      borderRadius: "8px",
      padding: "16px",
      color: "#f9fafb",
      display: "flex",
      flexDirection: "column" as const,
      minHeight: 0,
      overflow: "hidden",
      gap: "12px",
    };

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2.2fr 1fr",
          gap: "16px",
          alignItems: "stretch",
          marginTop: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            color: "#111827",
            backgroundColor: "#f9fafb",
            borderRadius: "8px",
            padding: "16px",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              marginBottom: "12px",
              fontSize: "13px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              position: "relative",
              paddingBottom: "10px",
              color: "#111827",
            }}
          >
            Lit Action
            <span
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                width: "60px",
                height: "2px",
                backgroundColor: "#B7410D",
                borderRadius: "999px",
              }}
            />
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
            }}
          >
            {renderCodeEditor(codeEditorHeight, true)}
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateRows: "minmax(0, 0.25fr) minmax(0, 0.75fr)",
            gap: "16px",
            minHeight: 0,
          }}
        >
          <div style={fullPanelStyle}>
            <h4
              style={{
                margin: 0,
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              JS Params
            </h4>
            <div
              style={{
                flex: 1,
                minHeight: 0,
              }}
            >
              {renderParamsContent(paramsEditorHeight, true)}
            </div>
          </div>
          <div
            style={{
              ...fullPanelStyle,
              justifyContent: "flex-start",
            }}
          >
            <h4
              style={{
                margin: 0,
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              Execution Result
            </h4>
            {renderResultPanel(true)}
          </div>
        </div>
      </div>
    );
  };

  const renderParsedEntries = (
    value: Record<string, unknown> | unknown[],
    fullscreen: boolean,
    path: string[] = []
  ): React.ReactNode => {
    const entryBackground = fullscreen ? "rgba(59, 130, 246, 0.08)" : "#f3f4f6";
    const entryBorder = fullscreen
      ? "1px solid rgba(59, 130, 246, 0.25)"
      : "1px solid #e5e7eb";

    const entries = Array.isArray(value)
      ? value.map((entry, index) => [String(index), entry] as [string, unknown])
      : Object.entries(value);

    const formatPrimitive = (val: unknown): string => {
      if (val === null) return "null";
      if (val === undefined) return "undefined";
      if (typeof val === "string") return val;
      try {
        return JSON.stringify(val, null, 2);
      } catch {
        return String(val);
      }
    };

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {entries.map(([key, val]) => {
          const pathKey = [...path, key].join(".");
          const parsedFromString =
            typeof val === "string" ? tryParseJson(val) : null;
          const nestedValue = parsedFromString
            ? parsedFromString
            : Array.isArray(val)
            ? val
            : val && typeof val === "object"
            ? (val as Record<string, unknown>)
            : null;
          const copyPayload = (() => {
            if (typeof val === "string") return val;
            if (nestedValue) {
              try {
                return JSON.stringify(nestedValue, null, 2);
              } catch {
                return String(nestedValue);
              }
            }
            return formatPrimitive(val);
          })();
          return (
            <div
              key={pathKey}
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr auto",
                gap: "12px",
                padding: "10px 12px",
                backgroundColor: entryBackground,
                border: entryBorder,
                borderRadius: "6px",
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  fontSize: "12px",
                  color: fullscreen ? "#f9fafb" : "#111827",
                }}
              >
                {key}
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: fullscreen ? "#e5e7eb" : "#111827",
                  display: "flex",
                  flexDirection: "column",
                  gap: nestedValue ? "8px" : "0",
                }}
              >
                {nestedValue ? (
                  <div
                    style={{
                      marginTop: "4px",
                      paddingLeft: "10px",
                      borderLeft: fullscreen
                        ? "2px solid rgba(59,130,246,0.35)"
                        : "2px solid #cbd5f5",
                    }}
                  >
                    {renderParsedEntries(
                      nestedValue as Record<string, unknown> | unknown[],
                      fullscreen,
                      [...path, key]
                    )}
                  </div>
                ) : (
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: "monospace",
                    }}
                  >
                    {formatPrimitive(val)}
                  </pre>
                )}
              </div>
              <button
                onClick={() => copyToClipboard(pathKey, copyPayload)}
                style={{
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid rgba(209, 213, 219, 0.6)",
                  backgroundColor: fullscreen
                    ? "rgba(17, 24, 39, 0.6)"
                    : "#ffffff",
                  color: fullscreen ? "#f9fafb" : "#1f2937",
                  fontSize: "10px",
                  cursor: "pointer",
                }}
              >
                {copiedField === pathKey ? "Copied" : "Copy"}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderResultPanel = (fullscreen: boolean) => {
    if (!litActionResult) {
      return (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "6px",
            border: fullscreen ? "1px dashed #1f2937" : "1px dashed #d1d5db",
            color: fullscreen ? "#9ca3af" : "#6b7280",
            fontSize: "12px",
            padding: "16px",
          }}
        >
          Run an action to see the response here.
        </div>
      );
    }

    const containerStyles = {
      flex: 1,
      display: "flex",
      flexDirection: "column" as const,
      minHeight: 0,
      gap: "12px",
      backgroundColor: fullscreen ? "#111827" : "#ffffff",
      border: fullscreen ? "1px solid #1f2937" : "1px solid #e5e7eb",
      borderRadius: "8px",
      padding: "14px",
      color: fullscreen ? "#f9fafb" : "#111827",
    };

    const messageBackground = status.includes("successfully")
      ? fullscreen
        ? "rgba(34,197,94,0.15)"
        : "#f0fdf4"
      : fullscreen
      ? "rgba(248,113,113,0.15)"
      : "#fef2f2";
    const messageBorder = status.includes("successfully")
      ? fullscreen
        ? "1px solid rgba(34,197,94,0.4)"
        : "1px solid #bbf7d0"
      : fullscreen
      ? "1px solid rgba(248,113,113,0.4)"
      : "1px solid #fecaca";
    const messageColor = status.includes("successfully")
      ? fullscreen
        ? "#bbf7d0"
        : "#15803d"
      : fullscreen
      ? "#fecaca"
      : "#dc2626";

    return (
      <div style={containerStyles}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            fontSize: "11px",
            color: fullscreen ? "#d1d5db" : "#6b7280",
          }}
        >
          <span>
            Executed at: {new Date(litActionResult.timestamp).toLocaleString()}
          </span>
          {parsedResponse && (
            <button
              onClick={() => setShowParsedModal(true)}
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid rgba(59,130,246,0.4)",
                backgroundColor: fullscreen
                  ? "rgba(30, 64, 175, 0.35)"
                  : "#e0f2fe",
                color: fullscreen ? "#bfdbfe" : "#1d4ed8",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              View Parsable JSON
            </button>
          )}
        </div>
        {status && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              backgroundColor: messageBackground,
              border: messageBorder,
              color: messageColor,
              fontSize: "12px",
            }}
          >
            {status}
          </div>
        )}
        <pre
          style={{
            flex: 1,
            margin: 0,
            overflow: "auto",
            backgroundColor: fullscreen ? "#0f172a" : "#f9fafb",
            borderRadius: "6px",
            border: fullscreen ? "1px solid #1f2937" : "1px solid #e5e7eb",
            padding: "12px",
            fontFamily: "monospace",
            fontSize: "11px",
            whiteSpace: "pre-wrap",
          }}
        >
          {rawResultString}
        </pre>
      </div>
    );
  };

  useEffect(() => {
    return () => {
      litTypesDisposablesRef.current.forEach((disposable) => {
        disposable?.dispose?.();
      });
      litTypesDisposablesRef.current = [];
      litTypesModelRef.current?.dispose?.();
      litTypesModelRef.current = null;
      monacoConfiguredRef.current = false;
      paramsEditorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!parsedResponse) {
      setShowParsedModal(false);
    }
  }, [parsedResponse, litActionResult?.timestamp]);

  useEffect(() => {
    if (!copiedField) return;
    const timeout = window.setTimeout(() => setCopiedField(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [copiedField]);

  useEffect(() => {
    if (!shareStatus) return;
    const timeout = window.setTimeout(() => setShareStatus(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [shareStatus]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showParsedModal) {
        setShowParsedModal(false);
        e.stopPropagation();
        return;
      }
      setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [showParsedModal]);

  // Show the shortcut tip when entering fullscreen; hide when exiting
  useEffect(() => {
    if (isFullscreen) {
      setShowShortcutTip(false);
    }
  }, [isFullscreen]);

  // Keep a fresh reference to the execute trigger with current conditions
  triggerExecuteRef.current = () => {
    const codeEditorHasFocus = !!editorRef.current?.hasTextFocus?.();
    const paramsEditorHasFocus = !!paramsEditorRef.current?.hasTextFocus?.();
    const editorHasFocus = codeEditorHasFocus || paramsEditorHasFocus;
    if (
      isFullscreen &&
      editorHasFocus &&
      !disabled &&
      !isExecutingAction &&
      !!litActionCode.trim()
    ) {
      void executeLitAction();
    }
  };

  const executeLitAction = async () => {
    console.log("[executeLitAction] Called.");
    console.log(
      "[executeLitAction] Context:",
      await services?.litClient.getContext()
    );
    if (!user?.authContext || !litActionCode.trim() || !services?.litClient) {
      setStatus("No auth context, Lit Action code, or Lit client");
      return;
    }

    let parsedJsParams: Record<string, unknown> = {};
    try {
      parsedJsParams = jsParamsInput.trim() ? JSON.parse(jsParamsInput) : {};
      setJsParamsError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setJsParamsError(message);
      setStatus(`Invalid JS params JSON: ${message}`);
      return;
    }

    const runtimePublicKey =
      selectedPkp?.pubkey || user?.pkpInfo?.pubkey || parsedJsParams.publicKey;
    const jsParams: Record<string, unknown> = {
      ...parsedJsParams,
    };
    if (runtimePublicKey) {
      jsParams.publicKey = runtimePublicKey;
    }

    setIsExecutingAction(true);
    setStatus("Executing Lit Action...");
    try {
      const result = await services.litClient.executeJs({
        authContext: user.authContext,
        code: litActionCode,
        jsParams,
      });
      console.log("[executeLitAction] result:", result);

      setLitActionResult({
        result,
        timestamp: new Date().toISOString(),
      });
      setIsExecutingAction(false);
      setStatus("Lit Action executed successfully!");
      try {
        const addr = selectedPkp?.ethAddress || user.pkpInfo?.ethAddress;
        if (addr) await triggerLedgerRefresh(addr);
      } catch {}
    } catch (error: any) {
      console.error("Failed to execute Lit Action:", error);
      setIsExecutingAction(false);
      setStatus(`Failed to execute Lit Action: ${error.message || error}`);
    }
  };

  const loadExample = useCallback((exampleId: string) => {
    if (!exampleId || exampleId === BLANK_EXAMPLE_ID) {
      createBlankExample();
      return;
    }
    if (exampleId === CUSTOM_SHARE_EXAMPLE_ID) {
      try {
        const params = new URLSearchParams(window.location.search);
        const encodedCode = params.get("code");
        const encodedParams = params.get("params");
        if (encodedCode) {
          const decodedCode = decodeFromShare(encodedCode);
          setLitActionCode(decodedCode);
        }
        if (encodedParams) {
          const decodedParams = decodeFromShare(encodedParams);
          setJsParamsInput(decodedParams);
        }
        setJsParamsError(null);
        setStatus("Loaded shared Lit Action");
        setShowParsedModal(false);
        setSelectedExampleId(CUSTOM_SHARE_EXAMPLE_ID);
      } catch (error) {
        console.error("Failed to load shared example", error);
        setStatus("Unable to load shared Lit Action");
      }
      return;
    }

    if (exampleId.startsWith(CUSTOM_LOCAL_PREFIX)) {
      const example = localExamples.find((ex) => ex.id === exampleId);
      if (example) {
        setLitActionCode(example.code);
        setJsParamsInput(example.params);
        setJsParamsError(null);
        setSelectedExampleId(example.id);
        setStatus("Loaded local Lit Action");
      }
      return;
    }

    const example = getLitActionExample(exampleId);
    if (!example) {
      console.warn(`[LitActionForm] Unknown Lit Action example: ${exampleId}`);
      return;
    }
    const formattedParams = formatJsParams(example.jsParams);

    setLitActionCode(example.code ?? "");
    setLitActionResult(null);
    setSelectedExampleId(example.id);
    setJsParamsInput(formattedParams);
    setJsParamsError(null);
    setStatus("");
    setShowParsedModal(false);
  }, [createBlankExample, localExamples]);

  const handleShare = useCallback(async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("code", encodeForShare(litActionCode));
      url.searchParams.set("params", encodeForShare(jsParamsInput));
      const shareUrl = url.toString();

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus("Share link copied!");
      } else {
        window.prompt("Copy this Lit Action link", shareUrl);
        setShareStatus("Share link ready to copy");
      }

      window.history.replaceState({}, "", shareUrl);
      setHasSharedLink(true);
      setSelectedExampleId(CUSTOM_SHARE_EXAMPLE_ID);
    } catch (error) {
      console.error("Failed to generate share link", error);
      setShareStatus("Unable to copy share link");
    }
  }, [jsParamsInput, litActionCode]);

  return (
    <div
      style={{
        padding: "20px",
        backgroundColor: "#ffffff",
        borderRadius: "12px",
        border: "1px solid #e5e7eb",
        boxShadow: "",
        marginBottom: "20px",
        position: "relative",
        ...(isFullscreen
          ? {
              position: "fixed" as const,
              inset: 0,
              width: "100vw",
              height: "100vh",
              zIndex: FULLSCREEN_Z_INDEX,
              marginBottom: 0,
              overflow: "auto",
            }
          : {}),
      }}
    >
      <button
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          display: "grid",
          placeItems: "center",
          borderRadius: 6,
          border: "1px solid #d1d5db",
          background: "white",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          zIndex: FULLSCREEN_Z_INDEX + 1,
          outline: "none",
          boxShadow: "none",
        }}
        disabled={disabled}
      >
        {isFullscreen ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M9 3H3v6h2V5h4V3zm12 6V3h-6v2h4v4h2zM3 15v6h6v-2H5v-4H3zm18 6v-6h-2v4h-4v2h6z" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M9 3H3v6h2V5h4V3zm12 6V3h-6v2h4v4h2zM3 15v6h6v-2H5v-4H3zm18 6v-6h-2v4h-4v2h6z" />
          </svg>
        )}
      </button>
      {isFullscreen && showShortcutTip && null}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          paddingRight: 40,
        }}
      >
        <h3 style={{ margin: 0, color: "#1f2937" }}>⚡ Execute Lit Action</h3>
        {isFullscreen ? (
          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
            }}
          >
            <div
              style={{
                position: "relative",
              }}
            >
              <select
                value={selectedExampleId ?? ""}
                onChange={(event) => loadExample(event.target.value)}
                disabled={disabled || isExecutingAction}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  fontSize: "12px",
                  minWidth: "220px",
                }}
              >
                <option value={BLANK_EXAMPLE_ID}>New Blank Action</option>
                {hasSharedLink && (
                  <option value={CUSTOM_SHARE_EXAMPLE_ID}>Shared Code</option>
                )}
                {localExamples.map((example) => (
                  <option key={example.id} value={example.id}>
                    {example.title} (Local)
                  </option>
                ))}
                {litActionExamples.map((example) => (
                  <option key={example.id} value={example.id}>
                    {example.title}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={executeLitAction}
              disabled={executeButtonDisabled}
              onMouseEnter={() => setShowShortcutTip(true)}
              onMouseLeave={() => setShowShortcutTip(false)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                backgroundColor: executeButtonDisabled ? "#9ca3af" : "#B7410D",
                fontSize: "12px",
                fontWeight: 600,
                color: "#ffffff",
                cursor: executeButtonDisabled ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                position: "relative",
              }}
            >
              {executeButtonContent}
              {showShortcutTip && !executeButtonDisabled && (
                <span
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    backgroundColor: "#111827",
                    color: "#F9FAFB",
                    borderRadius: "6px",
                    padding: "6px 10px",
                    fontSize: "11px",
                    whiteSpace: "nowrap",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                  }}
                >
                  Press Cmd+Enter (Mac) / Ctrl+Enter (Windows)
                </span>
              )}
            </button>
            <button
              onClick={handleShare}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                backgroundColor: "#f3f4f6",
                color: "#1f2937",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Share Link
            </button>
            <button
              onClick={saveLocalExample}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid #1f2937",
                backgroundColor: "#111827",
                color: "#f9fafb",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Save
            </button>
            {selectedExampleId?.startsWith(CUSTOM_LOCAL_PREFIX) && (
              <button
                onClick={deleteLocalExample}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid #dc2626",
                  backgroundColor: "#fee2e2",
                  color: "#991b1b",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            )}
            {/* <button
              onClick={createBlankExample}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid #4b5563",
                backgroundColor: "#f9fafb",
                color: "#1f2937",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              New Code
            </button> */}
            {shareStatus && (
              <span
                style={{
                  fontSize: "11px",
                  color: shareStatus.includes("Unable") ? "#fecaca" : "#bbf7d0",
                }}
              >
                {shareStatus}
              </span>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <select
              value={selectedExampleId ?? ""}
              onChange={(event) => loadExample(event.target.value)}
              disabled={disabled || isExecutingAction}
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
                backgroundColor: "#ffffff",
                fontSize: "12px",
                minWidth: "220px",
              }}
            >
              <option value={BLANK_EXAMPLE_ID}>New Blank Action</option>
              {hasSharedLink && (
                <option value={CUSTOM_SHARE_EXAMPLE_ID}>Shared Code</option>
              )}
              {localExamples.map((example) => (
                <option key={example.id} value={example.id}>
                  {example.title} (Local)
                </option>
              ))}
              {litActionExamples.map((example) => (
                <option key={example.id} value={example.id}>
                  {example.title}
                </option>
              ))}
            </select>
            <button
              onClick={handleShare}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                backgroundColor: "#f3f4f6",
                color: "#1f2937",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Share Link
            </button>
            {shareStatus && (
              <span
                style={{
                  fontSize: "11px",
                  color: shareStatus.includes("Unable") ? "#dc2626" : "#15803d",
                }}
              >
                {shareStatus}
              </span>
            )}
          </div>
        )}
      </div>

      <p
        style={{
          margin: "0 0 16px 0",
          color: "#6b7280",
          fontSize: "14px",
        }}
      >
        Run custom JavaScript code with your PKP. Use the examples above to get
        started.
      </p>
      {selectedExample?.description && (
        <p
          style={{
            margin: "0 0 16px 0",
            color: "#4b5563",
            fontSize: "12px",
          }}
        >
          {selectedExample.description}
        </p>
      )}

      {isFullscreen ? (
        renderFullscreenLayout()
      ) : (
        <>
          {renderCompactLayout()}

          <button
            onClick={executeLitAction}
            disabled={executeButtonDisabled}
            className={`w-full p-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 border-1 border-gray-200 ${
              executeButtonDisabled
                ? "bg-gray-400 cursor-not-allowed text-white"
                : "bg-[#B7410D] text-white cursor-pointer"
            }`}
          >
            {executeButtonContent}
          </button>

          {/* <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginTop: "10px",
            }}
          >
            <button
              onClick={handleShare}
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                backgroundColor: "#f3f4f6",
                color: "#1f2937",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Share Link
            </button>
          </div> */}

          <div style={{ marginTop: "16px" }}>{renderResultPanel(false)}</div>
        </>
      )}

      {showParsedModal && parsedResponse && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15,23,42,0.85)",
            backdropFilter: "blur(4px)",
            zIndex: FULLSCREEN_Z_INDEX + 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px",
          }}
        >
          <div
            style={{
              width: "min(1300px, 90vw)",
              maxHeight: "80vh",
              backgroundColor: "#0f172a",
              border: "1px solid #1f2937",
              borderRadius: "12px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              color: "#f9fafb",
              boxShadow: "0 25px 50px -12px rgba(15,23,42,0.6)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "16px",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                }}
              >
                Parsable JSON
              </h3>
              <div
                style={{ display: "flex", gap: "8px", alignItems: "center" }}
              >
                <button
                  onClick={executeLitAction}
                  disabled={executeButtonDisabled}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid rgba(209,213,219,0.4)",
                    backgroundColor: executeButtonDisabled
                      ? "rgba(156,163,175,0.4)"
                      : "#B7410D",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: executeButtonDisabled ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {executeButtonContent}
                </button>
                <button
                  onClick={() => setShowParsedModal(false)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#e5e7eb",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
              }}
            >
              {renderParsedEntries(parsedResponse, true)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
