/**
 * LitActionForm Component
 *
 * Form for executing Lit Actions with custom JavaScript code
 */

import React, { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { useLitAuth } from "../../../../lit-login-modal/LitAuthProvider";
import { UIPKP } from "../../types";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { triggerLedgerRefresh } from "../../utils/ledgerRefresh";

// UI constants
const EDITOR_FONT_SIZE_COMPACT = 10;
const EDITOR_FONT_SIZE_FULLSCREEN = 14;
const EDITOR_LINE_HEIGHT = 20;
const FULLSCREEN_Z_INDEX = 9999;

// Default Lit Action code constants
const DEFAULT_LIT_ACTION = `const { sigName, toSign, publicKey, } = jsParams;
const { keccak256, arrayify } = ethers.utils;

(async () => {
  const toSignBytes = new TextEncoder().encode(toSign);
  const toSignBytes32 = keccak256(toSignBytes);
  const toSignBytes32Array = arrayify(toSignBytes32);
  
  await Lit.Actions.signEcdsa({
    toSign: toSignBytes32Array,
    publicKey,
    sigName,
  });  
})();`;

const DEFAULT_LIT_ACTION2 = `(async () => {
  const dAppUniqueAuthMethodType = "0x...";
  const { publicKey, username, password, authMethodId } = jsParams;
  
  // Custom validation logic 
  const EXPECTED_USERNAME = 'alice';
  const EXPECTED_PASSWORD = 'lit';
  const userIsValid = username === EXPECTED_USERNAME && password === EXPECTED_PASSWORD;
  
  // Check PKP permissions
  const tokenId = await Lit.Actions.pubkeyToTokenId({ publicKey: publicKey });
  const permittedAuthMethods = await Lit.Actions.getPermittedAuthMethods({ tokenId });
  
  const isPermitted = permittedAuthMethods.some((permittedAuthMethod) => {
    return permittedAuthMethod["auth_method_type"] === dAppUniqueAuthMethodType && 
           permittedAuthMethod["id"] === authMethodId;
  });
  
  const isValid = isPermitted && userIsValid;
  LitActions.setResponse({ response: isValid ? "true" : "false" });
})();`;

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
  const [litActionCode, setLitActionCode] = useState(DEFAULT_LIT_ACTION);
  const [litActionResult, setLitActionResult] =
    useState<LitActionResult | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const editorRef = useRef<any>(null);
  const triggerExecuteRef = useRef<() => void>(() => {});
  const [showShortcutTip, setShowShortcutTip] = useState(false);
  const [activeExample, setActiveExample] = useState<"sign" | "blockchash">(
    "sign"
  );

  const toggleFullscreen = () => setIsFullscreen((v) => !v);

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
      const result = await services.litClient.executeJs({
        authContext: user.authContext,
        code: litActionCode,
        jsParams: {
          publicKey: selectedPkp?.pubkey || user?.pkpInfo?.pubkey,
          sigName: "sig1",
          toSign: "Hello from Lit Action",
        },
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

  const loadExample = (example: "sign" | "blockchash") => {
    if (example === "sign") {
      setLitActionCode(DEFAULT_LIT_ACTION);
    } else {
      setLitActionCode(DEFAULT_LIT_ACTION2);
    }
    setLitActionResult(null);
    setActiveExample(example);
  };

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
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => loadExample("sign")}
              disabled={disabled || isExecutingAction}
              style={{
                padding: "4px 8px",
                backgroundColor:
                  disabled || isExecutingAction ? "#9ca3af" : "#6366f1",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "11px",
                cursor:
                  disabled || isExecutingAction ? "not-allowed" : "pointer",
              }}
            >
              Load Sign Example
            </button>
            <button
              onClick={() => loadExample("blockchash")}
              disabled={disabled || isExecutingAction}
              style={{
                padding: "4px 8px",
                backgroundColor:
                  disabled || isExecutingAction ? "#9ca3af" : "#059669",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "11px",
                cursor:
                  disabled || isExecutingAction ? "not-allowed" : "pointer",
              }}
            >
              Load Custom Auth Example
            </button>
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
              <button
                onClick={() => loadExample("sign")}
                style={{
                  padding: "6px 10px",
                  fontSize: "11px",
                  border: "none",
                  borderRight: "1px solid #e5e7eb",
                  backgroundColor:
                    activeExample === "sign" ? "#ffffff" : "#f3f4f6",
                  color: activeExample === "sign" ? "#111827" : "#374151",
                  cursor: "pointer",
                }}
              >
                Load Sign Example
              </button>
              <button
                onClick={() => loadExample("blockchash")}
                style={{
                  padding: "6px 10px",
                  fontSize: "11px",
                  border: "none",
                  backgroundColor:
                    activeExample === "blockchash" ? "#ffffff" : "#f3f4f6",
                  color: activeExample === "blockchash" ? "#111827" : "#374151",
                  cursor: "pointer",
                }}
              >
                Load Custom Auth Example
              </button>
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
                onMount={(editor, monaco) => {
                  editorRef.current = editor;
                  editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                    () => triggerExecuteRef.current()
                  );
                }}
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
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                editor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                  () => triggerExecuteRef.current()
                );
              }}
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
