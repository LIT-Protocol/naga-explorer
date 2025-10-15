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

const DEFAULT_EXAMPLE = getDefaultLitActionExample();
const DEFAULT_EXAMPLE_ID = DEFAULT_EXAMPLE?.id ?? null;
const DEFAULT_EXAMPLE_CODE = DEFAULT_EXAMPLE?.code ?? "";

const LIT_ACTION_TYPES_URI = "ts:lit-actions.d.ts";

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
  const [litActionCode, setLitActionCode] = useState<string>(
    DEFAULT_EXAMPLE_CODE
  );
  const [litActionResult, setLitActionResult] =
    useState<LitActionResult | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const editorRef = useRef<any>(null);
  const triggerExecuteRef = useRef<() => void>(() => {});
  const monacoConfiguredRef = useRef(false);
  const litTypesDisposablesRef = useRef<any[]>([]);
  const litTypesModelRef = useRef<any>(null);
  const [showShortcutTip, setShowShortcutTip] = useState(false);

  const selectedExample = useMemo(
    () =>
      selectedExampleId ? getLitActionExample(selectedExampleId) : undefined,
    [selectedExampleId]
  );

  const toggleFullscreen = () => setIsFullscreen((v) => !v);

  const handleEditorMount = useCallback(
    (editor: any, monaco: any) => {
      editorRef.current = editor;
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => triggerExecuteRef.current()
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

  useEffect(() => {
    return () => {
      litTypesDisposablesRef.current.forEach((disposable) => {
        disposable?.dispose?.();
      });
      litTypesDisposablesRef.current = [];
      litTypesModelRef.current?.dispose?.();
      litTypesModelRef.current = null;
      monacoConfiguredRef.current = false;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Show the shortcut tip when entering fullscreen; hide when exiting
  useEffect(() => {
    if (isFullscreen) {
      setShowShortcutTip(true);
    } else {
      setShowShortcutTip(false);
    }
  }, [isFullscreen]);

  // Keep a fresh reference to the execute trigger with current conditions
  triggerExecuteRef.current = () => {
    const editorHasFocus = !!editorRef.current?.hasTextFocus?.();
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
    console.log("[executeLitAction] Context:", await services?.litClient.getContext());
    if (!user?.authContext || !litActionCode.trim() || !services?.litClient) {
      setStatus("No auth context, Lit Action code, or Lit client");
      return;
    }

    setIsExecutingAction(true);
    setStatus("Executing Lit Action...");
    try {
      const baseJsParams: Record<string, unknown> = {
        publicKey: selectedPkp?.pubkey || user?.pkpInfo?.pubkey,
      };
      const exampleJsParams = selectedExample?.jsParams ?? {};
      const jsParams = {
        ...baseJsParams,
        ...exampleJsParams,
      };

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
    const example = getLitActionExample(exampleId);
    if (!example) {
      console.warn(`[LitActionForm] Unknown Lit Action example: ${exampleId}`);
      return;
    }
    setLitActionCode(example.code);
    setLitActionResult(null);
    setSelectedExampleId(example.id);
  }, []);

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
      {isFullscreen && showShortcutTip && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 44,
            background: "#111827",
            color: "#F9FAFB",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
            zIndex: FULLSCREEN_Z_INDEX + 1,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          <span>
            Press <strong>Cmd</strong>+<strong>Enter</strong> (Mac) /{" "}
            <strong>Ctrl</strong>+<strong>Enter</strong> (Windows)
          </span>
          <button
            onClick={() => setShowShortcutTip(false)}
            aria-label="Dismiss shortcut tip"
            style={{
              background: "transparent",
              color: "#9CA3AF",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.9a1 1 0 0 0 1.41-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4z" />
            </svg>
          </button>
        </div>
      )}
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
        {!isFullscreen && (
          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            {litActionExamples.map((example) => {
              const isActive = example.id === selectedExampleId;
              const isDisabled = disabled || isExecutingAction;
              const backgroundColor = isDisabled
                ? "#9ca3af"
                : isActive
                ? "#6366f1"
                : "#f3f4f6";
              const color = isActive || isDisabled ? "#ffffff" : "#374151";
              return (
                <button
                  key={example.id}
                  onClick={() => loadExample(example.id)}
                  disabled={isDisabled}
                  title={example.description ?? example.title}
                  style={{
                    padding: "4px 8px",
                    backgroundColor,
                    color,
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "11px",
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    transition: "background-color 0.15s ease",
                  }}
                >
                  {example.title}
                </button>
              );
            })}
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
        <div
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Tabs above editor in fullscreen */}
            <div
              style={{
                display: "flex",
                alignItems: "stretch",
                border: "1px solid #d1d5db",
                borderBottom: "none",
                borderRadius: "8px 8px 0 0",
                overflow: "hidden",
              }}
            >
              {litActionExamples.map((example, index) => {
                const isActive = example.id === selectedExampleId;
                return (
                  <button
                    key={example.id}
                    onClick={() => loadExample(example.id)}
                    style={{
                      padding: "6px 10px",
                      fontSize: "11px",
                      border: "none",
                      borderRight:
                        index === litActionExamples.length - 1
                          ? "none"
                          : "1px solid #e5e7eb",
                      backgroundColor: isActive ? "#ffffff" : "#f3f4f6",
                      color: isActive ? "#111827" : "#374151",
                      cursor: "pointer",
                    }}
                    title={example.description ?? example.title}
                  >
                    {example.title}
                  </button>
                );
              })}
            </div>
            <div
              style={{
                border: "1px solid #d1d5db",
                borderTop: "none",
                borderRadius: "0 0 8px 8px",
                overflow: "hidden",
                marginBottom: "12px",
                opacity: disabled ? 0.6 : 1,
              }}
            >
              <Editor
                value={litActionCode}
                onChange={(value) => setLitActionCode(value || "")}
                language="javascript"
                theme="vs-dark"
                onMount={handleEditorMount}
                options={{
                  minimap: { enabled: false },
                  wordWrap: "on",
                  fontSize: isFullscreen
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
                height={"70vh"}
                width="100%"
              />
            </div>
            <button
              onClick={executeLitAction}
              disabled={disabled || isExecutingAction || !litActionCode.trim()}
              className={`w-full p-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 border-1 border-gray-200 ${
                disabled || isExecutingAction || !litActionCode.trim()
                  ? "bg-gray-400 cursor-not-allowed text-white"
                  : "bg-[#B7410D] text-white cursor-pointer"
              }`}
            >
              {isExecutingAction ? (
                <>
                  <LoadingSpinner size={16} />
                  Executing...
                </>
              ) : (
                "Execute Lit Action"
              )}
            </button>
            {status && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "8px 12px",
                  backgroundColor: status.includes("successfully")
                    ? "#f0fdf4"
                    : "#fef2f2",
                  border: `1px solid ${
                    status.includes("successfully") ? "#bbf7d0" : "#fecaca"
                  }`,
                  borderRadius: "6px",
                  color: status.includes("successfully")
                    ? "#15803d"
                    : "#dc2626",
                  fontSize: "12px",
                }}
              >
                {status}
              </div>
            )}
          </div>
          <div style={{ width: "40%", minWidth: 320 }}>
            {litActionResult && (
              <div
                style={{
                  marginTop: 0,
                  padding: "12px",
                  backgroundColor: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  borderRadius: "8px",
                  height: "70vh",
                  overflow: "auto",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 8px 0",
                    color: "#15803d",
                    fontSize: "14px",
                  }}
                >
                  ✅ Execution Result
                </h4>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#6b7280",
                    marginBottom: "8px",
                  }}
                >
                  Executed at:{" "}
                  {new Date(litActionResult.timestamp).toLocaleString()}
                </div>
                <pre
                  style={{
                    fontSize: "11px",
                    fontFamily: "monospace",
                    color: "#15803d",
                    margin: 0,
                    backgroundColor: "#dcfce7",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #bbf7d0",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {JSON.stringify(litActionResult.result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              overflow: "hidden",
              marginBottom: "12px",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <Editor
              value={litActionCode}
              onChange={(value) => setLitActionCode(value || "")}
              language="javascript"
              theme="vs-dark"
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                wordWrap: "on",
                fontSize: isFullscreen
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
              height={"200px"}
              width="100%"
            />
          </div>

          {isFullscreen && (
            <div
              style={{
                marginTop: "-6px",
                marginBottom: "10px",
                color: "#6b7280",
                fontSize: "12px",
              }}
            >
              Tip: Press <span style={{ fontWeight: 600 }}>Cmd</span>+
              <span style={{ fontWeight: 600 }}>Enter</span> (Mac) or{" "}
              <span style={{ fontWeight: 600 }}>Ctrl</span>+
              <span style={{ fontWeight: 600 }}>Enter</span> (Windows) to
              execute while the editor is focused.
            </div>
          )}

          <button
            onClick={executeLitAction}
            disabled={disabled || isExecutingAction || !litActionCode.trim()}
            className={`w-full p-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 border-1 border-gray-200 ${
              disabled || isExecutingAction || !litActionCode.trim()
                ? "bg-gray-400 cursor-not-allowed text-white"
                : "bg-[#B7410D] text-white cursor-pointer"
            }`}
          >
            {isExecutingAction ? (
              <>
                <LoadingSpinner size={16} />
                Executing...
              </>
            ) : (
              "Execute Lit Action"
            )}
          </button>

          {status && (
            <div
              style={{
                marginTop: "12px",
                padding: "8px 12px",
                backgroundColor: status.includes("successfully")
                  ? "#f0fdf4"
                  : "#fef2f2",
                border: `1px solid ${
                  status.includes("successfully") ? "#bbf7d0" : "#fecaca"
                }`,
                borderRadius: "6px",
                color: status.includes("successfully") ? "#15803d" : "#dc2626",
                fontSize: "12px",
              }}
            >
              {status}
            </div>
          )}

          {litActionResult && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                backgroundColor: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
              }}
            >
              <h4
                style={{
                  margin: "0 0 8px 0",
                  color: "#15803d",
                  fontSize: "14px",
                }}
              >
                ✅ Execution Result
              </h4>
              <div
                style={{
                  fontSize: "11px",
                  color: "#6b7280",
                  marginBottom: "8px",
                }}
              >
                Executed at:{" "}
                {new Date(litActionResult.timestamp).toLocaleString()}
              </div>
              <pre
                style={{
                  fontSize: "11px",
                  fontFamily: "monospace",
                  color: "#15803d",
                  overflow: "auto",
                  maxHeight: "200px",
                  margin: 0,
                  backgroundColor: "#dcfce7",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #bbf7d0",
                  whiteSpace: "pre-wrap",
                }}
              >
                {JSON.stringify(litActionResult.result, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
};
