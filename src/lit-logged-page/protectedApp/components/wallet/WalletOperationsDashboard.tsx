/**
 * WalletOperationsDashboard Component
 *
 * Comprehensive dashboard for all PKP wallet operations
 */

import React from "react";
import { UIPKP, TransactionResult } from "../../types";
import { EncryptDecryptForm } from "./EncryptDecryptForm";
import { LitActionForm } from "./LitActionForm";
import { ViemAccountForm } from "./ViemAccountForm";
import { SendTransactionForm } from "./SendTransactionForm";

interface WalletOperationsDashboardProps {
  selectedPkp: UIPKP | null;
  selectedChain: string;
  disabled?: boolean;
  onTransactionComplete?: (result: TransactionResult) => void;
}

export const WalletOperationsDashboard: React.FC<
  WalletOperationsDashboardProps
> = ({
  selectedPkp,
  selectedChain,
  disabled = false,
  onTransactionComplete,
}) => {
  return (
    <>
      {/* Message Signing */}
      {/* <SignMessageForm selectedPkp={selectedPkp} disabled={disabled} /> */}

      {/* Viem Integrations Section */}
      <div className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* PKP Viem Account Signing */}
          <ViemAccountForm selectedPkp={selectedPkp} disabled={disabled} />

          {/* Send Transaction */}
          <SendTransactionForm
            selectedPkp={selectedPkp}
            selectedChain={selectedChain}
            disabled={disabled}
            onTransactionComplete={onTransactionComplete}
          />
        </div>
      </div>

      {/* Encryption/Decryption */}
      {/* <EncryptDecryptForm selectedPkp={selectedPkp} disabled={disabled} /> */}

      {/* Lit Action Execution */}
      <div className="mt-6">
        <LitActionForm selectedPkp={selectedPkp} disabled={disabled} />
      </div>
    </>
  );
};
